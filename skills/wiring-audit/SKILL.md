---
name: wiring-audit
description: >
  Use this skill when the user asks to audit, complete, or classify the wiring of an in-progress AI SaaS
  application, especially when pages, routes, APIs, hooks, state, or AI integrations may be partial or missing.
---

# Wiring Audit

Treat the codebase as a mix of wired, partial, stubbed, and missing surfaces.

## Required process

1. Inspect navigation and route definitions.
2. Inspect the page or view components behind those surfaces.
3. Inspect the data path: APIs, hooks, services, state, and AI entry points.
4. Classify each section as `WIRED`, `PARTIAL`, `STUB`, `MISSING`, or `UNVERIFIED`.
5. Produce a prioritized wiring plan before broad implementation.

## Required output

Always produce:

- a wiring table
- an AI/brain audit
- a prioritized P0/P1/P2/P3 plan
- exact files inspected

