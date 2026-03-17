# AGENTS.md

## Purpose

This repo is a public starter for running OpenClaw with NVIDIA-hosted models for AI SaaS workflows.

Keep changes focused on:

- Docker-based OpenClaw setup
- NVIDIA model configuration
- ClawScope monitoring
- local skills and prompts
- public-safe documentation

## Public Repo Rules

- Do not commit `.env`, API keys, tokens, or local state.
- Do not hardcode personal filesystem paths.
- Do not commit runtime logs, PID files, or temporary monitor artifacts.
- Keep setup instructions portable across machines.
- Treat this repo as a starter, not a dump of local operational notes.

## Repo Conventions

- Main shared workspace is `/share`.
- `vendor/` and `upstream/` are fetched during setup and are not committed.
- `projects/` is for local user repos and should stay empty except for `.gitkeep`.
- Prefer simple PowerShell helper scripts for setup and startup flows.

## Documentation Rules

- README should explain:
  - what the stack is
  - how to install it
  - how to start it
  - what is local-dev only
  - what must be hardened before public deployment
- Keep docs free of private paths, personal notes, and stale tokens.

## Monitoring

- `clawscope` is read-only.
- Prefer direct health endpoints and mounted state/config over brittle cross-container RPC assumptions.
- Keep monitor behavior understandable from the README and scripts.

## Changes

- Favor minimal, verifiable edits.
- If a script is changed, verify it by running it.
- If a Docker/service change is made, verify the actual container behavior.
