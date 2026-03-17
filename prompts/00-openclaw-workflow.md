# OpenClaw Workflow

Use this workflow for repo work:

1. Audit
2. Consolidate
3. Fix one
4. Review
5. Repeat

Rules:
- One job type per prompt.
- Start a new session if context usage gets bloated or the run blocks.
- Audit in slices of 5 to 10 routes or one focused surface at a time.
- Do not ask OpenClaw to audit the whole repo in one pass.
- Do not combine audit, implementation, and review in one prompt.

Prompt files:
- `01-route-audit-batch.md`
- `02-consolidate-findings.md`
- `03-implement-one-fix.md`
- `04-post-fix-review.md`
