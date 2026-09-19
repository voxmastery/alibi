# Alibi

Vendor diligence recorder for Indian SMEs and the chartered accountants who defend them. Records what the GST register said about a supplier on the day you checked, in a tamper-evident hash chain, and exports it as evidence.

- Design: `docs/superpowers/specs/2026-09-19-alibi-rebuild-design.md`
- Audit of the previous build: `AUDIT.md`
- Reference documents and the rule weights: `docs/reference/`

## Develop

Requires Node 22+, pnpm 10, Docker (for Postgres).

    pnpm install
    docker run -d --name alibi-pg -e POSTGRES_PASSWORD=alibi -e POSTGRES_DB=alibi_test -p 5433:5432 postgres:16
    export DATABASE_URL=postgres://postgres:alibi@localhost:5433/alibi_test
    pnpm typecheck
    pnpm test:unit
    pnpm test:integration
    pnpm build && pnpm test:e2e

Evidence, not legal advice. Nothing in this repository asserts that a private ledger is admissible in any proceeding.

## Run the product locally

    pnpm install
    pnpm build
    NODE_ENV=production PORT=3000 node apps/api/dist/server.mjs

Open http://localhost:3000. Without a `GSTINAPI_KEY` the app runs on the labelled sample register and says so on every screen.

## Deploy

Replit: `.replit` builds the workspace (`pnpm build`) and runs `apps/api/dist/server.mjs`, which serves the built site from `apps/web/dist` and the API under `/api`. Environment variables are set in Replit Secrets, never committed; see `.env.example` for the names.
