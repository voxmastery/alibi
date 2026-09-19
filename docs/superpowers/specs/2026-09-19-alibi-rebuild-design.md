# Alibi rebuild — design

Date: 2026-09-19. Status: approved in conversation section by section; awaiting written review.
Supersedes the buildathon build audited in `AUDIT.md`. The old code is deleted; `docs/reference/` keeps the prompt documents and the original `risk.js` as the executable statement of the rule weights.

## 1. Why rebuild

The buildathon build opens on a visualization and asks the user to explore. Nothing starts from a task or ends in an action. The audit found the chain verifies linkage only, sample data is presented as the user's own, and the honest multi-state vendor is flagged. None of that is worth patching.

North star (Razorpay Fix My Itch, itch 76, B2B Services): *"Why can't businesses verify new suppliers before purchasing?"* Every feature must either help a business verify a supplier before purchasing, or prove that it did. Anything else is scope creep and is named as such.

Decisions taken by the owner in this session, recorded so nobody re-litigates them:

| Decision | Choice |
|---|---|
| Core moment | The pre-purchase check. Everything hangs off it. |
| Register data | Live provider plus a labelled sample register; never fabricated. |
| Demo provider | gstinapi.in (owner picks the production GSP separately). |
| Stack | TypeScript, pnpm workspace, Express, Postgres (Neon), vanilla TypeScript frontend built with Vite, Three.js immersive throughout. |
| Network view | Built in Three.js, styled after graphify's community graph. `3d-force-graph` is not used (see §4.6). |
| Deploy | Vercel. |
| Deadline | None today. Build properly, one milestone per session. |
| Product shape | Check-first. |

Decisions that remain the owner's and are never resolved in code: production GSP and price per lookup; hash anchoring mechanism; DPDP Act obligations; any copy about admissibility of a private ledger.

## 2. Invariants (unchanged, restated)

1. No snapshots → `unknown`, never `clear`.
2. Snapshots are append-only. Enforced by a database trigger, not by convention.
3. Never display a chain as verified unless verification ran and passed in that request. Failure is red and explicit.
4. Never fabricate a snapshot. Failed lookups are sealed as failures (`lookup_ok = false`).
5. Shared PAN across GSTINs is context at weight 5.
6. Every user-facing finding is a complete plain-English sentence. Rule IDs never reach the UI.
7. Sample data is badged SAMPLE on every row, card, export and page where it appears.
8. Rules are deterministic. No model in the evaluation path.

## 3. Product

### 3.1 Screens

**Check (home).** One input: a GSTIN. Format and check digit validated client-side and server-side before a lookup is spent. Secondary link: "Upload your vendor list". When no provider key is configured, a persistent banner states that all results are SAMPLE.

**Result.** In order:
1. *Verdict.* One or two sentences. Band `clear` / `watch` / `flagged` / `unknown` from the deterministic engine. Vocabulary never includes "safe" or "fraud".
2. *Register facts.* Legal name, trade name, status, taxpayer type, registration date, cancellation date (if any), principal address, e-invoice status, block status. Badge LIVE or SAMPLE. Capture timestamp in IST with the UTC instant beneath.
3. *Filing record.* GSTR-1 and GSTR-3B by period for the current and previous financial year: filed / not filed / not yet due, last filing date. One sentence: your credit appears in your GSTR-2B only when they file GSTR-1.
4. *Your network.* Shared bank account, address, phone, email, filing IP (if the org supplied it) between this GSTIN and the org's loaded vendors. Sentences first; a small 3D mini-graph second. Shared PAN shown as context.
5. *Sealed record.* Position in the chain, `payload_hash`, `prev_hash`, and the verification result computed in this request. Every lookup, including failures, is sealed automatically.
6. *Actions.* **Add to my vendors** (collects the fields the register does not know: bank account on file, contact phone, email, optional filing IP). **Watch this vendor.** **Download this check** as a dated certificate (HTML and PDF, §3.3).

**Vendors.** Table: legal name, GSTIN, band, last capture, filing status, ITC at risk, watched. CSV upload for a vendor master and a purchase register with column validation; each error names the column and the row. "Load sample data" button, explicitly labelled; sample rows badged.

**Network.** Immersive 3D of the org's vendor base: community colouring, node size by purchase value, a "connections worth a look" panel listing the strongest shared-attribute edges as sentences, time scrubber replaying findings by date without resetting the layout. 2D twin (§5.3).

**Vendor detail.** Snapshot timeline, findings as of a chosen date, transactions with the status recorded on each date, "Export defence file".

**Defence file.** Deterministic HTML and PDF (§6). "This record states what the public register showed on the dates listed. It is evidence, not legal advice." on every page.

**Verify (public, no account).** Paste or upload a defence file or chain export. The chain is recomputed in the browser and on the server; both results are shown. A break is shown in red at the link where it occurs and every link after.

**Alerts.** Change events per watched vendor: status changed, filing gap appeared, cancellation date appeared or moved earlier, block status changed. Each alert names the vendor, the change, the date, and the ITC at risk. Email delivery. Job health (last run, next run, stale warning) on the page.

### 3.2 Out of scope, deliberately
GSTR-2B reconciliation, Section 43B(h) MSME payment tracking, payment-terms tooling, accounting-software import, e-way bill integration, mobile app. Adjacent itches; different products.

### 3.3 The check certificate
A one-vendor, one-capture export: register facts, filing record, network sentences, the sealed hash and chain position, the SAMPLE/LIVE badge, the evidence-not-advice notice. Same rendering path as the defence file (§6) so determinism is shared.

## 4. Architecture

### 4.1 Workspace
```
apps/api        Express in TypeScript. One Vercel function; plain Node locally.
apps/web        Static site. Vanilla TypeScript + Three.js, Vite build. No UI framework.
packages/core   Pure and fully tested: canonical JSON (RFC 8785), chain hashing,
                GSTIN check digit, risk engine, point-in-time evaluation, verify.
packages/db     pg, numbered hand-written SQL migrations, a small runner.
packages/sample Sample register generator (TypeScript port of generate_data.py,
                RNG bug fixed, payload_json shaped like provider responses).
docs/reference  PRD, RISK_RULES, CASES, DEMO_SCRIPT, THREEJS_REFERENCE, risk.js.
```
`packages/core` compiles to both Node and the browser; the public Verify page runs the same code the server runs.

### 4.2 Database (Postgres on Neon)
Every table carries `org_id` from migration `0001`. Row-level security is enabled on every table with `org_id`; the API sets `app.org_id` per transaction. Migration `0001` also creates a default org for local development.

```
orgs            id, name, created_at
users           id, org_id, email, role (owner|member|viewer), created_at        -- R6
vendors         id, org_id, gstin, legal_name, trade_name, pan, state, address,
                registered_on, bank_account, phone, email, filing_ip,
                tracking (checked|tracked), created_at
snapshots       id, org_id, vendor_id, seq, captured_at, source (gstinapi|sample),
                provider_ref, lookup_ok, error, status, taxpayer_type,
                registration_date, cancellation_date, returns_current,
                last_return_filed, retrospective_from, payload_json (jsonb),
                payload_hash (bytea 32), prev_hash (bytea 32)
transactions    id, org_id, vendor_id, invoice_no, date, amount, itc_claimed,
                payment_mode, eway_bill, source
edges           org_id, from_vendor, to_vendor, attribute, value, valid_from
                attribute in (pan, bank_account, address, phone, email, filing_ip)
findings_cache  org_id, vendor_id, as_of, engine_version, rule_id, severity,
                weight, message
watches         org_id, vendor_id, created_by, created_at
alerts          id, org_id, vendor_id, kind, detail_json, itc_at_risk, created_at,
                emailed_at
job_runs        id, kind, started_at, heartbeat_at, finished_at, ok, detail_json
lookup_budget   day, org_id, used, cap
audit_log       id, org_id, actor, action, subject, created_at              -- R6
exports         id, org_id, vendor_id, as_of, head_hash, content_hash       -- R5
anchors         id, day, merkle_root, receipt_json                          -- R7
```

**Append-only.** A trigger on `snapshots` raises on UPDATE and DELETE. `seq` is `max(seq)+1` per `(org_id, vendor_id)` under a row lock on the vendor, so two concurrent appends cannot both claim the same `prev_hash`.

### 4.3 Chain
```
canonical  = RFC 8785 JSON Canonicalization Scheme over payload_json
payload_hash = sha256( prev_hash_bytes || utf8(canonical) )
prev_hash    = payload_hash of seq-1, or 32 zero bytes for seq 1
```
Full 32-byte digests. `payload_json` is the provider's raw HTTP body (or the error envelope) exactly as received, so parser changes never affect old hashes. Chains are per org per vendor. Verification recomputes every link from `payload_json`; a mismatch at link *k* marks *k* and all later links failed.

Anchor readiness (mechanism deferred to owner): a nightly job computes a Merkle root over all chain heads across all orgs and stores it in `anchors` with an empty `receipt_json` slot. Whatever external witness is chosen later fills the slot; existing rows need no change.

### 4.4 Provider adapter
```ts
interface RegisterLookup {
  taxpayer(gstin): Promise<RawResponse>              // status, names, dates, address
  returns(gstin, fy): Promise<RawResponse>           // per-period filing status
  filingPreference?(gstin, fy): Promise<RawResponse> // monthly vs QRMP
}
```
Implementations: `gstinapi` and `sample`. `RawResponse` carries the HTTP status, headers subset, body bytes, and the request instant. The sealer stores the body verbatim; a separate parser derives columns. Parsers are versioned; re-parsing an old row with a newer parser is a normal operation and never touches the hash.

Derived fields:
- `returns_current`: true when GSTR-3B for the latest period whose due date has passed is filed. Due date: 20th of the following month for monthly filers; 22nd or 24th of the month after the quarter for QRMP (state-dependent; the parser uses the later date until filing preference says otherwise).
- `retrospective_from`: the provider's cancellation date when it is earlier than `captured_at`. Whether the provider's `cancellation_date` is the effective date or the order date is unverified; R1 confirms it against a real cancelled GSTIN and records the answer here.

Failure sealing: on any non-2xx, timeout, or malformed body, a snapshot is appended with `lookup_ok = false`, `error` set, all parsed columns null, and `payload_json` = `{provider, http_status, body, requested_at, reason}`.

Limits: token bucket 60 requests/min for gstinapi; exponential backoff with jitter on 429 and 502, at most 3 attempts; per-org daily cap from `lookup_budget` decremented atomically before the call, refused with a clear message when exhausted; a global daily cap in env. Caps are refused, never exceeded.

### 4.5 Risk engine
Port of `docs/reference/risk.js` to TypeScript with identical weights, severities, messages and ordering. Changes that are corrections, not rule changes:
- Edges are read from the `edges` table; no pairwise scan. Cluster density uses one adjacency pass per evaluation, not one per vendor.
- Point-in-time by date (`as_of: YYYY-MM-DD`). Snapshots and transactions with `captured_at`/`date <= as_of`; an edge participates only if both vendors' `registered_on <= as_of`.
- Every finding carries `as_of`.
- B4's "registered {n} months ago" is measured to `as_of`.
- Findings are cached per `(org, vendor, as_of, engine_version)`.

Open rule question, owner's to decide, default unchanged from RISK_RULES: whether A1, A4 and A5 suppress when the two vendors share a PAN (as A3 already does).

Performance target: 10,000 vendors evaluated for one `as_of` in under 2 seconds on Neon's free tier, measured in CI with generated data.

### 4.6 Three.js and the network view (deviation from the original brief)
The original brief specified `3d-force-graph` via script tag. Immersive Three.js across the app needs one Three.js instance bundled from npm; `3d-force-graph` bundles its own, which is the two-copies failure the brief warns about. Therefore: `d3-force-3d` for layout, our own `InstancedMesh` nodes and `Line2` edges, one renderer. Approved by the owner on 2026-09-19.

### 4.7 API
```
POST /api/checks                { gstin }            → check result (seals a snapshot)
GET  /api/vendors               ?as_of=              → table rows with bands
POST /api/vendors/import        multipart csv        → { inserted, errors:[{row,column,message}] }
POST /api/vendors/sample                             → loads the labelled sample set
GET  /api/vendors/:id           ?as_of=              → detail, findings, timeline
GET  /api/network               ?as_of=              → nodes, edges, communities
GET  /api/vendors/:id/defence   ?as_of=  &format=html|pdf|json
POST /api/verify                { export }           → link-by-link result
POST /api/watches, DELETE /api/watches/:vendorId
GET  /api/alerts, GET /api/jobs/health
POST /api/jobs/resnapshot       (Vercel Cron, bearer CRON_SECRET)
GET  /api/healthz
```
All inputs validated with hand-written zod schemas next to the route. Errors are `{ error: { code, message, field? } }`.

### 4.8 Deployment
One Vercel project. `apps/web` builds to static; `apps/api` is a single serverless function; `vercel.json` rewrites `/api/*` to it. Neon Postgres via the Vercel marketplace integration. Vercel Cron (daily on Hobby) calls `/api/jobs/resnapshot`. Environment: `DATABASE_URL`, `GSTINAPI_KEY` (absent → sample mode with banner), `CRON_SECRET`, `LOOKUP_DAILY_CAP`, `EMAIL_API_KEY` (R4; Resend by default, behind a one-function adapter so it can be swapped), `SESSION_SECRET` (R6). No secrets in the repo; `.env.example` lists names only.

## 5. Look and motion

### 5.1 Theme
Warm paper `#F7F4EE`, ink `#1C1B19`, muted `#6B675F`, rule lines `#E4DFD5`, one accent terracotta `#C2562F` for actions and focus. Band colours only on findings: clear `#2F8F6B`, watch `#C48A1E`, flagged `#B23A3A`, unknown `#8A857C`. Type: Source Serif 4 for headings, Source Sans 3 for body, JetBrains Mono for every GSTIN, hash, amount and date. All three are open-licensed and self-hosted so exports are deterministic. Light theme only; `prefers-color-scheme` is not honoured in this version.

### 5.2 Three.js chapters
One persistent full-viewport canvas behind the DOM, one renderer, one scene graph with a chapter per route; route changes tween the camera and cross-fade chapter groups so there is never a cut. The world is paper and light: translucent register cards, thin ink lines, soft shadows, particles only where they mean something (ledger entries, months).

1. **Register (home).** A slow carousel of register cards around a time dial. A valid GSTIN typed in the field pulls one card forward and turns the dial to today.
2. **Seal (result).** The card opens to show its facts. Sealing: a stamp lands, then a drawn link connects the card to the previous card in its chain. A failed lookup seals a grey card with a red edge.
3. **Network.** The graphify-styled force graph: community hulls, node size by value, edge thickness by attribute weight, camera fly-to on select, scrubber moves the date and recolours in place.
4. **Timeline (vendor detail).** Snapshots as stamped cards on a rail by date. A retrospective cancellation is a red band that sweeps backward from the capture date over months already sealed.
5. **Verify.** A light travels the chain link by link and stops, red, at the first broken link; links after it dim.

### 5.3 Fallbacks and budgets
Every chapter has a 2D twin (canvas or SVG) with the same data and the same interactions. Selection: WebGL context creation fails → 2D; `?renderer=2d` → 2D (used in CI); `prefers-reduced-motion` → 2D with no animation. No action exists only in the 3D layer; all controls are DOM. Budgets: DPR capped at 1.5, `InstancedMesh` for nodes, rendering paused when the tab is hidden, 16 ms frame at 1× DPR on an integrated GPU for 1,000 nodes.

## 6. Defence file and determinism
Inputs: `(org, vendor, as_of, chain head hash)`. Output HTML is generated from a template with stable ordering, no timestamps other than `as_of` and each snapshot's `captured_at`, self-hosted fonts, and no external requests. PDF is rendered by headless Chromium with a fixed viewport, embedded fonts, and PDF metadata (creation date, producer) stripped, so two exports of the same inputs are byte-identical; CI asserts this with a hash. Every page footer carries the evidence-not-advice notice and the SAMPLE badge when any included row is sample. The chain verification section shows the recomputed result; a failed chain renders the section in red with the failing link named, and the export still proceeds so the failure is on the record.

## 7. Rollout and acceptance

One milestone per session. A milestone is done when its acceptance tests pass, not when the code exists. Weak tests are named as weak in the end-of-milestone report.

**R0 — Skeleton.** Fresh workspace; old artifacts removed; docs moved. `packages/db` with migrations `0001` (orgs, vendors, snapshots with trigger, transactions, edges, lookup_budget, job_runs, RLS) and the runner. `packages/core` with canonical JSON, chain, GSTIN check digit, and the risk engine port. GitHub Actions: typecheck, unit tests, integration tests against a Postgres service container with migrations applied from empty, Playwright headless run with `?renderer=2d`. First Vercel preview serving a placeholder home.
Acceptance: UPDATE/DELETE on `snapshots` raise; org A cannot read org B's rows under RLS in a test; JCS vectors pass; every rule in RISK_RULES produces its exact message on fixtures; the multi-state fixture (shared PAN, distinct everything else) is `clear`; a vendor with no snapshots is `unknown`; 10,000-vendor evaluation under 2 s.

**R1 — Check and seal.** Provider adapter (gstinapi + sample), sealer, failure sealing, limits and caps, `POST /api/checks`, Home and Result screens in DOM form (no 3D yet), sealed-record display with live verification, check certificate export (HTML).
Acceptance: tampering any `payload_json` byte breaks verification at that link and every later link; a provider 500 produces a `lookup_ok=false` row and never a status; a re-parse with a changed parser leaves hashes verifying; two concurrent checks of one vendor produce `seq` 1 and 2 with correct linkage; the daily cap refuses the 51st lookup; `GSTINAPI_KEY` absent → SAMPLE banner on every screen.

**R2 — Vendors and network signals.** CSV import with named-column errors, vendor table, `edges` maintenance on insert/update, network sentences on the Result page, sample data behind the labelled button, Vendors and Vendor detail screens.
Acceptance: a CSV with a bad header, a malformed GSTIN, and a non-numeric amount returns three errors naming row and column; importing the sample set badges every row; adding a vendor sharing a bank account with an existing one produces the A1 sentence on the next check; sample and org data never mix in a query (test).

**R3 — Visual system.** Theme, five chapters, 2D twins, fallbacks, budgets.
Acceptance: Playwright runs every screen in `?renderer=2d` and asserts the same DOM controls exist as in 3D mode; a WebGL run on a machine with a GPU is executed by hand and reported with what was seen (spheres counted, links seen, orbit and hover confirmed), never inferred from a clean console; reduced-motion disables animation; frame budget measured on a 1,000-node fixture.

**R4 — Monitoring and alerts.** Cron route, idempotent re-snapshot, diff detection, alert generation, email, job health.
Acceptance: running the job twice in a day appends once per vendor; a status change between two runs produces exactly one alert with vendor, change, date and ITC at risk; a job that dies mid-run leaves `job_runs` without `finished_at` and the Alerts page shows a stale warning within one interval.

**R5 — Defence file and public verify.** HTML and PDF export, byte-identical determinism, A4 print, public Verify page with in-browser and server recomputation.
Acceptance: two exports of the same inputs hash identically; an export whose chain fails renders red and names the link; Verify with a tampered file shows the break in both browser and server results; the notice is on every page.

**R6 — Orgs, users, roles, audit log.** Magic-link sessions, roles, per-request `app.org_id`, audit of every snapshot creation and export.
Acceptance: the RLS isolation test now runs through the HTTP layer; a viewer cannot export; every check and export writes one audit row.

**R7 — Hardening.** Anchoring implementation once the mechanism is chosen, rate limiting at the edge, dependency audit, backup and restore performed end to end and documented, error tracking and uptime monitoring.
Acceptance: a restore from backup yields a database whose every chain verifies; the daily Merkle root matches an independent recomputation.

## 8. End-of-milestone report (every session)
Compare spec to build. Classify each divergence DRIFT, REVISION (with reason) or BUG, one neutral sentence each. List acceptance criteria that genuinely pass, pass only because the test is weak, and do not pass. One paragraph: does this milestone move toward "a business can verify a new supplier before purchasing, and prove they did"; name any part that does not.
