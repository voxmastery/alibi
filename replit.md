# Alibi

Vendor diligence recorder for Indian SMEs, using the supplied CSV and JSON records.

## Product constraints

- Preserve the vanilla HTML, JavaScript, and CSS frontend and Express backend.
- Do not introduce React, authentication, a database, or external vendor-data lookups.
- Keep the single pinned `3d-force-graph@1.80.0` browser library; do not load a second Three.js instance or replace the graph with 2D without approval.
- Treat uploaded data as the source of truth; do not change records to improve a demo.

## Application structure

- `artifacts/alibi-web/public/`: the existing frontend, served at `/`.
- `artifacts/alibi-web/serve.mjs`: a small Express static server for the managed preview workflow.
- `artifacts/api-server/src/`: the Express API, routed at `/api`; production entry is `dist/index.mjs`.
- `artifacts/api-server/server/risk.js`: the plain-JavaScript risk engine.
- `artifacts/api-server/data/`: uploaded vendor, transaction, and snapshot records.
- `artifacts/mockup-sandbox/`: design canvas tooling, not the published app.

## Run and publish

- Use managed workflows `artifacts/alibi-web: web` and `artifacts/api-server: API Server`.
- `pnpm --filter @workspace/alibi-web run typecheck` checks the vanilla JavaScript syntax.
- `pnpm --filter @workspace/api-server run typecheck` checks the API.
- The frontend needs no bundling: publishing serves its `public/` files directly. Its build command only checks JavaScript syntax.
- The API uses its existing esbuild production build and `/api/healthz` startup probe.
- Routing and publishing settings live in each artifact's `.replit-artifact/artifact.toml`; use the validated configuration-update workflow rather than editing those files directly.
- Keep resource paths independent of the process working directory. Publishing starts the API from the workspace root, unlike the package-local preview command.

## Verification limitation

The automated browser has failed WebGL context creation. The user approved continuing with 3D while visual verification remains incomplete. Do not claim spheres, links, camera orbit, or hover interactions passed unless actually observed.