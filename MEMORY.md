# MEMORY

## Purpose
- This repo is a public-safe OpenClaw starter for autonomous AI SaaS work.
- Keep the setup portable and free of personal machine assumptions.

## Environment
- The repo root is mounted to `/share`.
- Put target apps in `/share/projects`.
- Do not assume Windows drive letters inside instructions.
- Default app preview port is `4310`.
- Gateway port is `18789`.

## Agent Roles
- `deep-coder` is the default agent for planning, architecture, multi-step debugging, and audit-first work.
- `fast-coder` is for tightly scoped implementation and verification.
- `repo-ops` is for review, branch hygiene, and repo operations.

## Model Roles
- `deep-coder` primary: `nvidia/nemotron-3-super-120b-a12b`
- `fast-coder` primary: `moonshotai/kimi-k2-instruct-0905`
- `repo-ops` primary: `openai/gpt-oss-20b`

## Workflow Rules
- Prefer one job type per prompt: `audit`, `plan`, `implement`, `debug`, or `review`.
- Use `wiring-audit` for partially wired SaaS products.
- Use `principal-architect` for strategic AI SaaS design.
- Prefer `get-api-docs` and `chub` before coding against third-party APIs.
- Keep generated projects inside `projects/` so the repo stays organized.

