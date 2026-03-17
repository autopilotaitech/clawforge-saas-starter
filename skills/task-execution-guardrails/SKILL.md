---
name: task-execution-guardrails
description: >
  Use this skill for non-trivial coding, debugging, planning, and review tasks in this workspace.
  It enforces direction-following, no unapproved scope expansion, and phase discipline.
---

# Task Execution Guardrails

1. Identify the job type first: `audit`, `plan`, `implement`, `debug`, or `review`.
2. Do only that job type unless the user explicitly combines phases.
3. Do not add dependencies, refactors, or side workflows unless required and requested.
4. Do not expand scope because it feels helpful.
5. If the task is non-trivial, inspect the codebase first before editing.
6. If something goes sideways, stop and re-evaluate instead of piling on fixes.

## Output discipline

- `audit` -> findings first, no code changes
- `plan` -> ordered tasks, files, blockers, verification
- `implement` -> requested scope only, then verify
- `debug` -> root cause first, then fix, then verify
- `review` -> findings first, ordered by severity

