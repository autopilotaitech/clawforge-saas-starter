New session.

Audit only these routes in `projects/<repo>/app/(dashboard)`:
- <route-1>
- <route-2>
- <route-3>
- <route-4>
- <route-5>

Constraints:
- route/product-surface only
- no backend
- no AI/workers
- no subagents
- inspect file contents
- do not continue beyond these listed routes

Required output for each route:
- route
- file
- status: WIRED / PARTIAL / STUB / MISSING / UNVERIFIED
- exact evidence from page content

Also inspect `app/(dashboard)/layout.tsx` only if needed to identify nav/sidebar links for these same routes.

Do not:
- do not use file size as evidence
- do not say `exists` as a status
- do not audit any routes not listed above
