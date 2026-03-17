$ErrorActionPreference = "Stop"

$installHomebrewScript = Join-Path $PSScriptRoot "install-homebrew.ps1"
& $installHomebrewScript

$bootstrap = @'
OPENCLAW_PRIMARY_REF="nvidia/$OPENCLAW_PRIMARY_MODEL"
OPENCLAW_FALLBACK_REF_1="nvidia/$OPENCLAW_FALLBACK_MODEL_1"
OPENCLAW_FALLBACK_REF_2="nvidia/$OPENCLAW_FALLBACK_MODEL_2"
OPENCLAW_LOCAL_CONTROL_UI_RELAXED="${OPENCLAW_LOCAL_CONTROL_UI_RELAXED:-true}"
openclaw onboard --non-interactive --accept-risk --flow manual --mode local --auth-choice custom-api-key --custom-provider-id nvidia --custom-base-url "https://integrate.api.nvidia.com/v1" --custom-model-id "$OPENCLAW_PRIMARY_MODEL" --custom-api-key "$NVIDIA_API_KEY" --secret-input-mode plaintext --skip-channels --skip-skills --skip-search --skip-ui --skip-daemon --skip-health --json
openclaw config set agents.defaults.workspace '"/share"'
EXISTING_TOKEN="$(node -e 'const fs=require("fs");const p="/home/node/.openclaw/openclaw.json";try{const j=JSON.parse(fs.readFileSync(p,"utf8"));process.stdout.write(j?.gateway?.auth?.token||"")}catch{process.stdout.write("")}')"
if [ -z "$EXISTING_TOKEN" ]; then
  EXISTING_TOKEN="$(openssl rand -hex 24)"
fi
CONTROL_UI_FLAGS=''
if [ "$OPENCLAW_LOCAL_CONTROL_UI_RELAXED" = "true" ]; then
  CONTROL_UI_FLAGS='"allowInsecureAuth": true, "dangerouslyDisableDeviceAuth": true,'
fi
cat > /home/node/.openclaw/openclaw.json <<JSON
{
  "models": {
    "mode": "merge",
    "providers": {
      "nvidia": {
        "baseUrl": "https://integrate.api.nvidia.com/v1",
        "apiKey": "$NVIDIA_API_KEY",
        "api": "openai-completions",
        "models": [
          {
            "id": "nvidia/nemotron-3-super-120b-a12b",
            "name": "Nemotron 3 Super",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 262144,
            "maxTokens": 32768
          },
          {
            "id": "moonshotai/kimi-k2-instruct-0905",
            "name": "Kimi K2 Instruct 0905",
            "reasoning": true,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 262144,
            "maxTokens": 32768
          },
          {
            "id": "openai/gpt-oss-20b",
            "name": "GPT-OSS 20B",
            "reasoning": false,
            "input": ["text"],
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
            "contextWindow": 131072,
            "maxTokens": 65536
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "$OPENCLAW_PRIMARY_REF",
        "fallbacks": [
          "$OPENCLAW_FALLBACK_REF_1",
          "$OPENCLAW_FALLBACK_REF_2"
        ]
      },
      "models": {
        "$OPENCLAW_PRIMARY_REF": {},
        "$OPENCLAW_FALLBACK_REF_1": {},
        "$OPENCLAW_FALLBACK_REF_2": {}
      },
      "workspace": "/share"
    },
    "list": [
      {
        "id": "fast-coder",
        "name": "Fast Coder",
        "workspace": "/share",
        "model": {
          "primary": "$OPENCLAW_FALLBACK_REF_1",
          "fallbacks": [
            "$OPENCLAW_FALLBACK_REF_2",
            "$OPENCLAW_PRIMARY_REF"
          ]
        },
        "skills": [
          "task-execution-guardrails",
          "autonomous-saas-delivery",
          "coding-agent",
          "test-driven-development",
          "systematic-debugging",
          "verification-before-completion",
          "get-api-docs",
          "github",
          "gh-issues",
          "tmux",
          "model-usage"
        ]
      },
      {
        "id": "deep-coder",
        "name": "Deep Coder",
        "default": true,
        "workspace": "/share",
        "model": {
          "primary": "$OPENCLAW_PRIMARY_REF",
          "fallbacks": [
            "$OPENCLAW_FALLBACK_REF_1",
            "$OPENCLAW_FALLBACK_REF_2"
          ]
        },
        "skills": [
          "task-execution-guardrails",
          "autonomous-saas-delivery",
          "wiring-audit",
          "principal-architect",
          "coding-agent",
          "brainstorming",
          "writing-plans",
          "executing-plans",
          "subagent-driven-development",
          "dispatching-parallel-agents",
          "test-driven-development",
          "systematic-debugging",
          "verification-before-completion",
          "requesting-code-review",
          "receiving-code-review",
          "using-git-worktrees",
          "finishing-a-development-branch",
          "using-superpowers",
          "get-api-docs",
          "github",
          "gh-issues",
          "tmux",
          "model-usage",
          "session-logs"
        ]
      },
      {
        "id": "repo-ops",
        "name": "Repo Ops",
        "workspace": "/share",
        "model": {
          "primary": "$OPENCLAW_FALLBACK_REF_2",
          "fallbacks": [
            "$OPENCLAW_FALLBACK_REF_1",
            "$OPENCLAW_PRIMARY_REF"
          ]
        },
        "skills": [
          "task-execution-guardrails",
          "autonomous-saas-delivery",
          "github",
          "gh-issues",
          "coding-agent",
          "get-api-docs",
          "requesting-code-review",
          "receiving-code-review",
          "verification-before-completion",
          "using-git-worktrees",
          "finishing-a-development-branch",
          "tmux",
          "session-logs"
        ]
      }
    ]
  },
  "skills": {
    "load": {
      "extraDirs": [
        "/share/vendor/superpowers/skills",
        "/share/vendor/context-hub/cli/skills"
      ],
      "watch": true,
      "watchDebounceMs": 250
    },
    "install": {
      "preferBrew": true,
      "nodeManager": "npm"
    }
  },
  "tools": {
    "profile": "coding"
  },
  "commands": {
    "native": "auto",
    "nativeSkills": "auto",
    "restart": true,
    "ownerDisplay": "raw"
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "gateway": {
    "port": $OPENCLAW_GATEWAY_PORT,
    "mode": "local",
    "bind": "lan",
    "controlUi": {
      $CONTROL_UI_FLAGS
      "allowedOrigins": ["http://localhost:$OPENCLAW_GATEWAY_PORT", "http://127.0.0.1:$OPENCLAW_GATEWAY_PORT"]
    },
    "auth": {
      "mode": "token",
      "token": "$EXISTING_TOKEN",
      "rateLimit": {
        "maxAttempts": 10,
        "windowMs": 60000,
        "lockoutMs": 300000
      }
    },
    "tailscale": {
      "mode": "off",
      "resetOnExit": false
    }
  }
}
JSON
openclaw models set "$OPENCLAW_PRIMARY_REF"
openclaw models fallbacks clear
openclaw models fallbacks add "$OPENCLAW_FALLBACK_REF_1"
openclaw models fallbacks add "$OPENCLAW_FALLBACK_REF_2"
'@

docker compose --profile shell up -d openclaw-shell
$bootstrap | docker compose exec -u node -T openclaw-shell /bin/sh -s
docker compose --profile gateway up -d openclaw-gateway
