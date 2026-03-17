const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec, execFile } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.CLAWSCOPE_PORT || 18880);
const POLL_MS = Number(process.env.CLAWSCOPE_POLL_MS || 4000);
const STALE_MS = Number(process.env.CLAWSCOPE_STALE_MS || 90000);
const MAX_EVENTS = Number(process.env.CLAWSCOPE_MAX_EVENTS || 250);
const MAX_TASKS = Number(process.env.CLAWSCOPE_MAX_TASKS || 12);
const EXEC_MODE = process.env.CLAWSCOPE_EXEC_MODE || "local";
const OPENCLAW_CONTAINER = process.env.OPENCLAW_CONTAINER || "openclaw-gateway";
const OPENCLAW_STATE_DIR =
  process.env.OPENCLAW_STATE_DIR ||
  (fs.existsSync("/home/node/.openclaw")
    ? "/home/node/.openclaw"
    : fs.existsSync(path.join(process.env.USERPROFILE || "", ".openclaw"))
    ? path.join(process.env.USERPROFILE || "", ".openclaw")
    : null);
const STATIC_DIR = path.join(__dirname, "static");
const GATEWAY_HEALTH_URL = (() => {
  const raw = process.env.OPENCLAW_GATEWAY_URL;
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
    parsed.pathname = "/healthz";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
})();

let currentState = {
  generatedAt: null,
  summary: {
    gatewayHealthy: false,
    activeSessions: 0,
    activeAgents: 0,
    staleSessions: 0,
    recentErrors: 0,
    lastEventAgeMs: null,
    executionMode: "unknown",
    activeTasks: 0,
    avgProgressPct: null,
    contextSaturated: false,
  },
  health: null,
  status: null,
  sessions: [],
  tasks: [],
  agentSpread: [],
  alerts: [],
  events: [],
  preview: {
    localUrl: `http://127.0.0.1:${process.env.APP_PREVIEW_PORT || "4310"}`,
    publicUrl: null,
  },
};

const sseClients = new Set();
const seenEventIds = new Set();

function shellJoin(parts) {
  return parts
    .map((part) => {
      if (/^[a-zA-Z0-9_./:-]+$/.test(part)) return part;
      return `'${String(part).replace(/'/g, `'\"'\"'`)}'`;
    })
    .join(" ");
}

function runOpenClaw(args) {
  const execEnv = { ...process.env };
  if (process.env.OPENCLAW_GATEWAY_URL) {
    execEnv.OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL;
    if (!execEnv.OPENCLAW_GATEWAY_TOKEN) {
      const token = readGatewayTokenFromConfig();
      if (token) execEnv.OPENCLAW_GATEWAY_TOKEN = token;
    }
  }

  if (EXEC_MODE === "docker") {
    const command = `openclaw ${shellJoin(args)}`;
    return new Promise((resolve) => {
      execFile(
        "docker",
        ["exec", OPENCLAW_CONTAINER, "sh", "-lc", command],
        { timeout: 15000, maxBuffer: 1024 * 1024 * 4, env: execEnv },
        (error, stdout, stderr) => {
          resolve({
            ok: !error,
            stdout: String(stdout || ""),
            stderr: String(stderr || ""),
            error: error ? error.message : null,
          });
        }
      );
    });
  }

  return new Promise((resolve) => {
    execFile(
      "openclaw",
      args,
      { timeout: 15000, maxBuffer: 1024 * 1024 * 4, env: execEnv },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
          error: error ? error.message : null,
        });
      }
    );
  });
}

function readGatewayTokenFromConfig() {
  if (!OPENCLAW_STATE_DIR) return null;
  const configPath = path.join(OPENCLAW_STATE_DIR, "openclaw.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.gateway?.auth?.token || null;
  } catch {
    return null;
  }
}

function readOpenClawConfig() {
  if (!OPENCLAW_STATE_DIR) return null;
  const configPath = path.join(OPENCLAW_STATE_DIR, "openclaw.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function fetchJson(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve({ ok: false, error: "missing url" });
      return;
    }
    const lib = url.startsWith("https:") ? require("https") : require("http");
    const req = lib.get(url, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode && res.statusCode < 400, data: JSON.parse(body) });
        } catch (error) {
          resolve({
            ok: false,
            error: `invalid json from ${url}`,
            stderr: String(body || "").slice(0, 1000),
            parseError: error.message,
          });
        }
      });
    });
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.setTimeout(5000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function buildFallbackHealth() {
  const cfg = readOpenClawConfig();
  const agents = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];
  const defaultAgent = agents.find((agent) => agent.default) || null;
  return {
    ok: true,
    ts: Date.now(),
    durationMs: 0,
    defaultAgentId: defaultAgent?.id || "unknown",
    agents: agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name || agent.id,
      isDefault: Boolean(agent.default),
      heartbeat: {
        enabled: Boolean(agent.default),
        every: agent.default ? "30m" : "disabled",
        everyMs: agent.default ? 1800000 : null,
      },
      sessions: {
        path: path.join(OPENCLAW_STATE_DIR || "", "agents", agent.id, "sessions", "sessions.json"),
        count: 0,
        recent: [],
      },
    })),
    sessions: {
      path: path.join(OPENCLAW_STATE_DIR || "", "agents", defaultAgent?.id || "deep-coder", "sessions", "sessions.json"),
      count: 0,
      recent: [],
    },
  };
}

function buildFallbackStatus() {
  const cfg = readOpenClawConfig();
  const agents = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : [];
  const defaultAgent = agents.find((agent) => agent.default) || null;
  const sessionPaths = agents.map((agent) =>
    path.join(OPENCLAW_STATE_DIR || "", "agents", agent.id, "sessions", "sessions.json")
  );
  return {
    runtimeVersion: "unknown",
    heartbeat: {
      defaultAgentId: defaultAgent?.id || "unknown",
      agents: agents.map((agent) => ({
        agentId: agent.id,
        enabled: Boolean(agent.default),
        every: agent.default ? "30m" : "disabled",
        everyMs: agent.default ? 1800000 : null,
      })),
    },
    sessions: {
      paths: sessionPaths,
      count: 0,
      defaults: {
        model: String(defaultAgent?.model?.primary || cfg?.agents?.defaults?.model?.primary || "").split("/").pop() || null,
      },
      recent: [],
      byAgent: agents.map((agent) => ({
        agentId: agent.id,
        path: path.join(OPENCLAW_STATE_DIR || "", "agents", agent.id, "sessions", "sessions.json"),
        count: 0,
        recent: [],
      })),
    },
    gateway: {
      mode: cfg?.gateway?.mode || "local",
      url: process.env.OPENCLAW_GATEWAY_URL || `ws://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT || "18789"}`,
      urlSource: process.env.OPENCLAW_GATEWAY_URL ? "env OPENCLAW_GATEWAY_URL" : "default",
      reachable: true,
      authWarning: null,
      error: null,
    },
    agents: {
      defaultId: defaultAgent?.id || "unknown",
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name || agent.id,
        workspaceDir: agent.workspace || cfg?.agents?.defaults?.workspace || null,
        bootstrapPending: false,
        sessionsPath: path.join(OPENCLAW_STATE_DIR || "", "agents", agent.id, "sessions", "sessions.json"),
        sessionsCount: 0,
        lastUpdatedAt: null,
        lastActiveAgeMs: null,
      })),
      totalSessions: 0,
      bootstrapPendingCount: 0,
    },
  };
}

function runJson(args) {
  return new Promise((resolve) => {
    runOpenClaw(args).then(({ ok, stdout, stderr, error }) => {
      if (!ok) {
        resolve({
          ok: false,
          error: error || `Failed to run ${args.join(" ")}`,
          stderr: String(stderr || "").trim(),
        });
        return;
      }

      const text = String(stdout || "").trim();
      if (!text) {
        resolve({ ok: true, data: null });
        return;
      }

      try {
        resolve({ ok: true, data: JSON.parse(text) });
      } catch (parseError) {
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length > 1) {
          try {
            resolve({ ok: true, data: lines.map((line) => JSON.parse(line)) });
            return;
          } catch {
            // fall through
          }
        }
        resolve({
          ok: false,
          error: `Failed to parse JSON from ${args.join(" ")}`,
          stderr: text.slice(0, 2000),
          parseError: parseError.message,
        });
      }
    });
  });
}

function runText(args) {
  return runOpenClaw(args);
}

function normalizeSessions(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.sessions) ? raw.sessions : [];
  const now = Date.now();

  return list.map((session) => {
    const updatedAt =
      session.updatedAt ||
      session.updated_at ||
      session.lastActivityAt ||
      session.last_activity_at ||
      session.createdAt ||
      session.created_at ||
      null;

    const updatedMs = updatedAt ? new Date(updatedAt).getTime() : null;
    const ageMs = Number.isFinite(updatedMs) ? Math.max(0, now - updatedMs) : null;

    return {
      id: session.id || session.sessionId || session.key || "unknown",
      agent: session.agent || session.agentId || session.agent_id || "unknown",
      title: session.title || session.recipient || session.peer || session.target || "Untitled session",
      updatedAt,
      ageMs,
      stale: Number.isFinite(ageMs) ? ageMs > STALE_MS : false,
      model:
        session.model ||
        session.modelId ||
        session.model_id ||
        session.primaryModel ||
        session.modelOverride ||
        null,
      tokenUsage:
        session.tokens ||
        session.tokenUsage ||
        session.token_usage ||
        null,
      raw: session,
    };
  });
}

function mergeSessionSources(primarySessions, statusData) {
  const statusRecent = Array.isArray(statusData?.sessions?.recent) ? statusData.sessions.recent : [];
  const merged = new Map();

  for (const session of primarySessions || []) {
    merged.set(session.id, { ...session });
  }

  for (const recent of statusRecent) {
    const id = recent.sessionId || recent.id || recent.key || "unknown";
    const existing = merged.get(id) || {
      id,
      agent: recent.agentId || recent.agent || "unknown",
      title: recent.key || "Untitled session",
      updatedAt: recent.updatedAt || null,
      ageMs: recent.age ?? null,
      stale: false,
      model: recent.model || null,
      tokenUsage: null,
      raw: {},
    };

    merged.set(id, {
      ...existing,
      agent: existing.agent || recent.agentId || recent.agent || "unknown",
      updatedAt: existing.updatedAt || recent.updatedAt || null,
      ageMs: existing.ageMs ?? recent.age ?? null,
      stale: existing.stale,
      model: existing.model || recent.model || null,
      raw: {
        ...(existing.raw || {}),
        ...recent,
      },
    });
  }

  return [...merged.values()];
}

function normalizeLogEntries(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(raw.entries)
    ? raw.entries
    : [];

  return list
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          ts: null,
          level: "info",
          message: entry,
        };
      }
      return {
        ts: entry.ts || entry.time || entry.timestamp || null,
        level: entry.level || entry.severity || "info",
        message: entry.message || entry.msg || entry.text || JSON.stringify(entry),
      };
    })
    .filter((entry) => entry.message);
}

function parseNdjson(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function pushEvents(entries) {
  for (const entry of entries) {
    const id = crypto
      .createHash("sha1")
      .update(`${entry.ts || ""}|${entry.level}|${entry.message}`)
      .digest("hex");
    if (seenEventIds.has(id)) continue;
    seenEventIds.add(id);
    currentState.events.push({ id, ...entry });
  }

  if (currentState.events.length > MAX_EVENTS) {
    const overflow = currentState.events.length - MAX_EVENTS;
    const removed = currentState.events.splice(0, overflow);
    for (const item of removed) seenEventIds.delete(item.id);
  }
}

function summarizeAlerts(health, sessions, logEntries, tasks) {
  const alerts = [];

  if (health && health.ok === false) {
    alerts.push({
      level: "error",
      kind: "gateway",
      message: `Gateway health check failed: ${health.error || health.stderr || "unknown error"}`,
    });
  }

  const staleSessions = sessions.filter((session) => session.stale);
  if (staleSessions.length > 0) {
    alerts.push({
      level: "warn",
      kind: "stalled",
      message: `${staleSessions.length} session(s) look stale`,
    });
  }

  const blockedTasks = tasks.filter((task) => task.status === "blocked");
  if (blockedTasks.length > 0) {
    alerts.push({
      level: "warn",
      kind: "blocked",
      message: `${blockedTasks.length} task(s) look blocked or awaiting a final answer`,
    });
  }

  const distinctAgents = new Set(sessions.map((session) => session.agent).filter(Boolean));
  if (sessions.length > 0 && distinctAgents.size <= 1) {
    alerts.push({
      level: "info",
      kind: "parallelism",
      message: "Work appears serial: only one active agent/session track is visible.",
    });
  }

  const recentErrors = logEntries.filter((entry) =>
    String(entry.level).toLowerCase().includes("error")
  );
  if (recentErrors.length > 0) {
    alerts.push({
      level: "error",
      kind: "logs",
      message: `${recentErrors.length} recent error log(s) detected`,
    });
  }

  const saturatedSessions = sessions.filter((session) => session.contextSaturated);
  if (saturatedSessions.length > 0) {
    alerts.push({
      level: "error",
      kind: "ctx",
      message: `${saturatedSessions.length} session(s) are context saturated and should be abandoned`,
    });
  }

  return alerts;
}

function extractPreviewUrl(events) {
  const match = [...events]
    .reverse()
    .map((event) => event.message.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i))
    .find(Boolean);
  return match ? match[0] : null;
}

function emitState() {
  const payload = `event: state\ndata: ${JSON.stringify(currentState)}\n\n`;
  for (const client of sseClients) client.write(payload);
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function collectSessionFiles(stateDir) {
  if (!stateDir) return [];
  const agentsDir = path.join(stateDir, "agents");
  const agentEntries = safeReadDir(agentsDir).filter((entry) => entry.isDirectory());
  const files = [];

  for (const agentEntry of agentEntries) {
    const sessionsDir = path.join(agentsDir, agentEntry.name, "sessions");
    for (const entry of safeReadDir(sessionsDir)) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const filePath = path.join(sessionsDir, entry.name);
      try {
        const stat = fs.statSync(filePath);
        files.push({
          agent: agentEntry.name,
          filePath,
          sessionId: path.basename(entry.name, ".jsonl"),
          mtimeMs: stat.mtimeMs,
        });
      } catch {
        // ignore
      }
    }
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_TASKS);
}

function parseSessionFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function extractTextFromContent(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part) return "";
      if (part.type === "text" || part.type === "thinking") return String(part.text || part.thinking || "");
      if (part.type === "toolCall") return `[tool:${part.name}]`;
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanUserPrompt(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const lastBracketIndex = raw.lastIndexOf("]");
  let cleaned = lastBracketIndex >= 0 ? raw.slice(lastBracketIndex + 1) : raw;
  cleaned = cleaned
    .replace(/Sender \(untrusted metadata\):[\s\S]*?```/g, "")
    .replace(/```json[\s\S]*?```/g, "")
    .replace(/System:\s*\[[^\]]+\][^\n]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || raw;
}

function detectPhase(run) {
  if (!run) return "idle";
  if (run.finalAssistantText) return "responded";
  if (run.lastToolCall && !run.lastToolResult) return `running ${run.lastToolCall}`;
  if (run.lastToolCall && run.lastToolResult) return "analyzing results";
  if (run.toolCalls > 0) return "investigating";
  if (run.firstAssistantAt) return "planning";
  return "queued";
}

function estimateProgress(run, sessionAgeMs) {
  if (!run) return 0;
  let progress = 8;
  if (run.firstAssistantAt) progress += 12;
  if (run.toolCalls > 0) progress += 18;
  progress += Math.min(25, run.toolCalls * 4);
  progress += Math.min(20, run.toolResults * 3);
  if (run.lastToolResult) progress += 8;
  if (run.finalAssistantText) progress = 100;
  else if (run.toolCalls > 0 && run.toolResults >= run.toolCalls) progress = Math.max(progress, 72);
  else if (run.toolCalls > 0) progress = Math.max(progress, 48);
  if (!run.finalAssistantText && Number.isFinite(sessionAgeMs) && sessionAgeMs > STALE_MS) {
    progress = Math.min(progress, 92);
  }
  return Math.max(0, Math.min(100, progress));
}

function deriveContextSaturation(sessionMeta) {
  const raw = sessionMeta.raw || {};
  const percentUsed = Number(
    raw.percentUsed ??
      raw.percent_used ??
      raw.contextPercentUsed ??
      raw.context_percent_used ??
      -1
  );
  const remainingTokens = Number(
    raw.remainingTokens ??
      raw.remaining_tokens ??
      raw.contextRemaining ??
      raw.context_remaining ??
      NaN
  );
  const inputTokens = Number(raw.inputTokens ?? raw.input_tokens ?? NaN);
  const contextTokens = Number(raw.contextTokens ?? raw.context_tokens ?? NaN);

  if (Number.isFinite(percentUsed) && percentUsed >= 95) {
    return { saturated: true, percentUsed };
  }

  if (Number.isFinite(remainingTokens) && remainingTokens <= 0) {
    return { saturated: true, percentUsed: Number.isFinite(percentUsed) ? percentUsed : 100 };
  }

  if (
    Number.isFinite(inputTokens) &&
    Number.isFinite(contextTokens) &&
    contextTokens > 0 &&
    inputTokens / contextTokens >= 0.95
  ) {
    return {
      saturated: true,
      percentUsed: Math.round((inputTokens / contextTokens) * 100),
    };
  }

  return {
    saturated: false,
    percentUsed: Number.isFinite(percentUsed) ? percentUsed : null,
  };
}

function deriveTaskFromTranscript(sessionMeta, transcript) {
  const sessionStartedAt = transcript.find((entry) => entry.type === "session")?.timestamp || null;
  const userMessages = transcript.filter(
    (entry) => entry.type === "message" && entry.message && entry.message.role === "user"
  );
  const assistantMessages = transcript.filter(
    (entry) => entry.type === "message" && entry.message && entry.message.role === "assistant"
  );
  const lastUserMessage = userMessages[userMessages.length - 1] || null;
  const lastUserAt = lastUserMessage?.timestamp || sessionStartedAt;
  const activeWindow = transcript.filter((entry) => !lastUserAt || String(entry.timestamp || "") >= lastUserAt);

  let firstAssistantAt = null;
  let lastAssistantAt = null;
  let finalAssistantText = "";
  let lastToolCall = null;
  let lastToolResult = null;
  let toolCalls = 0;
  let toolResults = 0;
  const recentTools = [];
  const assistantTextSnippets = [];

  for (const entry of activeWindow) {
    if (entry.type !== "message" || !entry.message) continue;
    const role = entry.message.role;
    const content = Array.isArray(entry.message.content) ? entry.message.content : [];

    if (role === "assistant") {
      if (!firstAssistantAt) firstAssistantAt = entry.timestamp || null;
      lastAssistantAt = entry.timestamp || null;
      for (const part of content) {
        if (part.type === "toolCall") {
          toolCalls += 1;
          lastToolCall = part.name || "tool";
          recentTools.push(lastToolCall);
        }
        if (part.type === "text" && part.text) {
          assistantTextSnippets.push(String(part.text).trim());
          finalAssistantText = String(part.text).trim();
        }
      }
    }

    if (role === "toolResult") {
      toolResults += 1;
      lastToolResult = entry.message.toolName || entry.message.toolCallId || "tool";
      if (entry.message.toolName) recentTools.push(entry.message.toolName);
    }
  }

  const promptText = cleanUserPrompt(extractTextFromContent(lastUserMessage?.message?.content));
  const title = promptText
    ? promptText.split(/\r?\n/).find((line) => line.trim())?.trim() || promptText.slice(0, 120)
    : sessionMeta.title || "Untitled task";
  const uniqueTools = [...new Set(recentTools)].slice(-5);
  const ctx = deriveContextSaturation(sessionMeta);
  const phase = detectPhase({
    firstAssistantAt,
    lastToolCall,
    lastToolResult,
    toolCalls,
    toolResults,
    finalAssistantText,
  });
  let progressPct = estimateProgress(
    { firstAssistantAt, lastToolCall, lastToolResult, toolCalls, toolResults, finalAssistantText },
    sessionMeta.ageMs
  );
  let status = finalAssistantText
    ? "complete"
    : sessionMeta.stale
    ? "blocked"
    : firstAssistantAt
    ? "running"
    : "queued";

  if (ctx.saturated && !finalAssistantText) {
    status = "ctx-saturated";
    progressPct = 100;
  }

  return {
    id: sessionMeta.id,
    agent: sessionMeta.agent,
    model: sessionMeta.model,
    title: title.slice(0, 180),
    prompt: promptText.slice(0, 600),
    status,
    phase,
    progressPct,
    contextPercentUsed: ctx.percentUsed,
    contextSaturated: ctx.saturated,
    startedAt: lastUserAt,
    updatedAt: sessionMeta.updatedAt || lastAssistantAt || lastUserAt,
    ageMs: sessionMeta.ageMs,
    stale: sessionMeta.stale,
    toolCalls,
    toolResults,
    recentTools: uniqueTools,
    finalAssistantText: finalAssistantText.slice(0, 280),
    transcriptPath: sessionMeta.transcriptPath || null,
  };
}

function buildTaskBoard(sessions) {
  const sessionFiles = collectSessionFiles(OPENCLAW_STATE_DIR);
  const sessionFileById = new Map(sessionFiles.map((item) => [item.sessionId, item]));
  const fallbackSessions = sessionFiles.map((item) => ({
    id: item.sessionId,
    agent: item.agent,
    title: "Untitled session",
    updatedAt: new Date(item.mtimeMs).toISOString(),
    ageMs: Math.max(0, Date.now() - item.mtimeMs),
    stale: Date.now() - item.mtimeMs > STALE_MS,
    model: null,
  }));

  const mergedSessions = [...sessions];
  const seen = new Set(mergedSessions.map((session) => session.id));
  for (const session of fallbackSessions) {
    if (seen.has(session.id)) continue;
    mergedSessions.push(session);
  }

  return mergedSessions
    .map((session) => {
      const transcript = parseSessionFile(
        sessionFileById.get(session.id)?.filePath ||
          path.join(OPENCLAW_STATE_DIR || "", "agents", session.agent || "main", "sessions", `${session.id}.jsonl`)
      );
      if (!transcript.length) return null;
      return deriveTaskFromTranscript(
        {
          ...session,
          transcriptPath: sessionFileById.get(session.id)?.filePath || null,
        },
        transcript
      );
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTs = new Date(a.updatedAt || 0).getTime();
      const bTs = new Date(b.updatedAt || 0).getTime();
      return bTs - aTs;
    })
    .slice(0, MAX_TASKS);
}

async function poll() {
  let [health, status, sessionsResult, logs] = await Promise.all([
    runJson(["health", "--json"]),
    runJson(["status", "--json", "--usage"]),
    runJson(["sessions", "--all-agents", "--json"]),
    runText(["logs", "--json", "--limit", "80"]),
  ]);

  if ((!health.ok || !status.ok) && GATEWAY_HEALTH_URL) {
    const gatewayHealth = await fetchJson(GATEWAY_HEALTH_URL);
    if (gatewayHealth.ok) {
      if (!health.ok) {
        health = { ok: true, data: buildFallbackHealth() };
      }
      if (!status.ok) {
        status = { ok: true, data: buildFallbackStatus() };
      }
    }
  }

  const normalizedSessions = mergeSessionSources(
    normalizeSessions(sessionsResult.data),
    status.ok ? status.data : null
  );
  const normalizedLogEntries = normalizeLogEntries(parseNdjson(logs.stdout));
  pushEvents(normalizedLogEntries);

  const agentCounts = new Map();
  for (const session of normalizedSessions) {
    const key = session.agent || "unknown";
    agentCounts.set(key, (agentCounts.get(key) || 0) + 1);
  }
  const agentSpread = [...agentCounts.entries()].map(([agent, sessionsCount]) => ({
    agent,
    sessionsCount,
  }));
  const activeAgents = agentSpread.length;
  const executionMode =
    normalizedSessions.length === 0 ? "idle" : activeAgents <= 1 ? "serial" : "parallel";

  const tasks = buildTaskBoard(normalizedSessions);
  const alerts = summarizeAlerts(health, normalizedSessions, normalizedLogEntries, tasks);
  const lastEvent = currentState.events[currentState.events.length - 1] || null;
  const lastEventAgeMs =
    lastEvent && lastEvent.ts ? Math.max(0, Date.now() - new Date(lastEvent.ts).getTime()) : null;
  const avgProgressPct =
    tasks.length > 0 ? Math.round(tasks.reduce((sum, task) => sum + task.progressPct, 0) / tasks.length) : null;
  const contextSaturated = tasks.some((task) => task.contextSaturated);

  currentState = {
    ...currentState,
    generatedAt: new Date().toISOString(),
    health: health.ok ? health.data : health,
    status: status.ok ? status.data : status,
    sessions: normalizedSessions,
    tasks,
    agentSpread,
    alerts,
    events: currentState.events,
    preview: {
      ...currentState.preview,
      publicUrl: extractPreviewUrl(currentState.events),
    },
    summary: {
      gatewayHealthy: Boolean(health.ok && (health.data?.ok ?? true)),
      activeSessions: normalizedSessions.length,
      activeAgents,
      staleSessions: normalizedSessions.filter((session) => session.stale).length,
      recentErrors: normalizedLogEntries.filter((entry) =>
        String(entry.level).toLowerCase().includes("error")
      ).length,
      lastEventAgeMs,
      executionMode,
      activeTasks: tasks.filter((task) => task.status !== "complete").length,
      avgProgressPct: contextSaturated ? null : avgProgressPct,
      contextSaturated,
    },
  };

  emitState();
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    Connection: "close",
  });
  res.end(body);
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(STATIC_DIR, requestPath);
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
        ? "text/css; charset=utf-8"
        : "application/javascript; charset=utf-8";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": Buffer.byteLength(content),
      Connection: "close",
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/api/state") {
    sendJson(res, 200, currentState);
    return;
  }

  if (req.url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: state\ndata: ${JSON.stringify(currentState)}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  if (req.url === "/api/ping") {
    sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[clawscope] listening on ${PORT} via ${EXEC_MODE}`);
  poll().catch((error) => {
    console.error("[clawscope] initial poll failed", error);
  });
  setInterval(() => {
    poll().catch((error) => {
      console.error("[clawscope] poll failed", error);
    });
  }, POLL_MS);
});
