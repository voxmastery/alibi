# AUDIT.md — Alibi, milestone M0

Audited 2026-09-19 against commit `3444a7f` ("Initial Alibi application snapshot"), the only substantive commit in the repository. The repo is the output of a one-day Replit Agent build for the Razorpay × Replit buildathon, working from the PRD, RISK_RULES, CASES and DEMO_SCRIPT documents that were attached to that session (copies live in `.conversation/attached_assets/`).

Method: every non-boilerplate file was read in full. The API was built and run from the workspace root (the production launch path), every endpoint was exercised, a tamper test was run against a scratch copy of the snapshot data, and the frontend was opened in a real Chrome with a working GPU. What was observed is recorded in section 7. Nothing in the repo was modified.

---

## 1. What exists

### 1.1 Runtime code that does something

| Path | Lines | What it is |
|---|---|---|
| `artifacts/api-server/src/lib/alibi-store.ts` | 427 | Loads three seed files into memory at import, exposes `listVendors`, `graphAt`, `vendorDetail`, `defenceFile`, `verifyChain`, `debugRiskText`. Also contains a second, dead risk engine (`findingsFor`, lines 134–267) that nothing calls. |
| `artifacts/api-server/server/risk.js` | 460 | The risk engine. Plain JS, imported into TS via `@ts-expect-error` (`alibi-store.ts:5-6`). Implements all rules in RISK_RULES.md (A1–A6, B1–B6, C1–C3, D1–D3) with the specified weights and message templates. |
| `artifacts/api-server/src/routes/alibi.ts` | 54 | `GET /api/vendors`, `/api/graph?asof=YYYY-MM`, `/api/vendor/:id`, `/api/defence/:id`, `/api/verify`, `/api/debug/risk`. |
| `artifacts/api-server/src/{app,index,resource-paths}.ts`, `routes/{index,health}.ts`, `lib/logger.ts` | ~100 | Express 5 + pino + cors, port from env, `/api/healthz`. Data directory resolved relative to the module so the bundle runs from any cwd. |
| `artifacts/api-server/build.mjs` | 126 | esbuild bundle to `dist/index.mjs`. Works (verified). |
| `artifacts/alibi-web/public/app.js` | 137 | The whole frontend in one IIFE, written as very long lines. 3D graph via `new ForceGraph3D(el)` (correct constructor form), counters, month scrubber with play, vendor dropdown, drawer with findings and snapshot history, WebGL-unavailable warning. |
| `artifacts/alibi-web/public/index.html`, `style.css` | 40 + 75 | Overlay UI. One script tag for `3d-force-graph@1.80.0` from jsDelivr, no separate three.js (correct). |
| `artifacts/alibi-web/serve.mjs` | 17 | Static Express server for the Replit preview. Production serves `public/` as static files. |
| `artifacts/api-server/data/{vendors.csv,transactions.csv,snapshots.json}` | 34 / 188 / 646 rows | The seed data. See section 2. |

### 1.2 Scaffolding that does nothing for this product

| Path | What it is | Used by the app? |
|---|---|---|
| `artifacts/mockup-sandbox/` | Replit "design canvas": Vite + React 19 + Tailwind 4 + 55 shadcn/ui components + ~50 devDependencies. `.generated/mockup-components.ts` is an empty module map. | No. Only wired to the Replit canvas. |
| `lib/db/` | Drizzle ORM scaffold. Schema file exports nothing (`src/schema/index.ts:20`). `src/index.ts` throws at import if `DATABASE_URL` is unset. | No. `@workspace/db` is listed in api-server's `package.json:14` but never imported. |
| `lib/api-spec/`, `lib/api-zod/`, `lib/api-client-react/` | Orval codegen from a 36-line OpenAPI file describing only `/healthz`. Produces a zod schema (`HealthCheckResponse`) and a React Query hook. | `api-zod` is used once, `routes/health.ts:7`, to validate `{status:"ok"}`. `api-client-react` is unused; there is no React app. |
| `scripts/` | `hello.ts` prints a string. `post-merge.sh` runs `pnpm install` then `pnpm --filter db push` (Drizzle push; the filter does resolve). | Replit post-merge hook only. |
| `.replit`, `*/.replit-artifact/artifact.toml`, `replit.md`, `.replitignore` | Replit workspace, path-router and deployment config. `replit.md` is the Replit agent's own instruction file and states constraints that contradict the new brief ("Do not introduce … a database, or external vendor-data lookups"). | Only on Replit. |
| `.agents/` | Replit agent memory (two notes) and an asset manifest with a GCS URI. | No. |
| `.conversation/attached_assets/`, `attached_assets/` | The buildathon prompt documents and a second full copy of the seed data (`snapshots.json` is 171 KB, duplicated). The `.conversation` copies are byte-identical to the files in the parent working directory; `THREEJS_REFERENCE` exists in two versions. | No. |
| `screenshots/` | Three JPEGs captured by the Replit agent. Two show the app with the "WebGL unavailable" warning; one shows an earlier "Stage 01 / WebGL calibration" fixture screen with a "GRAPH UNAVAILABLE" modal. None shows a rendered graph. | No. |
| `package.json` root dependency `@replit/connectors-sdk` | Replit connector SDK. | Not imported anywhere. |

### 1.3 What is absent

- Persistence of any kind. Nothing writes. There is no append path for a snapshot.
- Tests. Zero test files. No CI configuration. No linter. The "typecheck" for the frontend is `node --check`.
- Any lookup against a GST source, licensed or otherwise.
- Upload flow (PRD Screen 1), defence-file page (PRD Screen 4), "Export defence file" button (PRD Screen 3), 2D fallback renderer. The frontend fetches `/api/defence/:id` nowhere.
- `org_id`, users, auth, rate limiting, input validation beyond the `asof` regex.
- The brief's snapshot columns `source`, `payload_json`, `lookup_ok`, `error`. The seed rows carry none of them.
- An `edges` or `findings` table. Both are recomputed on every request.

---

## 2. What is simulated

All application data is synthetic, generated by `generate_data.py` (seeded with 1947) and committed as if it were user data. Every place the code or copy treats it as real:

### 2.1 Data files presented as the user's own
- `artifacts/api-server/src/lib/alibi-store.ts:81-87` — the three seed files are read at module import and become the sole data source for every endpoint. There is no other source and no way to supply one.
- `artifacts/api-server/src/resource-paths.ts:5` — data directory hard-wired to `../data/` relative to the bundle.
- `artifacts/api-server/data/snapshots.json` — 646 rows produced by `generate_data.py:116-128`. No lookup produced them. They carry no `payload_json`, `source`, `lookup_ok` or `error`.
- `artifacts/api-server/data/vendors.csv` — carries two columns the brief's data model does not have and no public source I know of supplies: `filing_ip` (invented at `generate_data.py:51,79`) and `aadhaar_authenticated` (`generate_data.py:81`). Rule A5 (`risk.js:219-227`) and rule B5 (`risk.js:317-319`) depend on them.

### 2.2 UI copy that calls seed data "uploaded" (invariant 7 violations)
- `artifacts/alibi-web/public/index.html:26` — "Retrieving uploaded relationship records."
- `artifacts/alibi-web/public/app.js:42` — status card reads "network / uploaded records".
- `artifacts/alibi-web/public/app.js:82` — "Retrieving uploaded records for {month}."
- `artifacts/alibi-web/public/app.js:95-96` — "No uploaded records are available" / "Records remain as of {month}".
- `artifacts/alibi-web/public/index.html:20` — the "Snapshots sealed" counter counts generator rows. Nothing sealed them.
- `artifacts/alibi-web/.replit-artifact/artifact.toml:4` — "Express continues to provide the uploaded-data API".
- `replit.md:3,18,20` — "using the supplied CSV and JSON records", "uploaded vendor, transaction, and snapshot records", "Treat uploaded data as the source of truth".

Nowhere on screen, in the API, or in the docs is the word "sample" or "demo" attached to this data.

### 2.3 Code shaped around the generator's choices
- `artifacts/alibi-web/public/app.js:5` and `index.html:31-33` — the scrubber range is hard-coded to March 2025 → September 2026 (19 months), which is the generator's `months` loop (`generate_data.py:107-111`). The frontend cannot show any other period.
- `artifacts/api-server/src/lib/alibi-store.ts:360-379` (`verifyChain`) — reports `verified: true` over hashes whose preimage exists only inside the generator's `seal()` function (`generate_data.py:117-118`). The server cannot recompute a single hash. See section 7.1.
- `artifacts/api-server/src/lib/alibi-store.ts:419` — `exported_at: new Date().toISOString()` stamps the wall clock onto a synthetic evidence pack.
- `artifacts/api-server/server/risk.js:267-269, 285-287, 242-246` — status matched by lower-cased string equality against the generator's vocabulary (`Active`, `Suspended`, `Cancelled`). The real API's vocabulary is unknown (section 6).
- `artifacts/api-server/server/risk.js:47-60` — dates handled as `YYYY-MM-DD` strings with month arithmetic. Fine for the generator's first-of-month captures; untested for anything else.

### 2.4 Seed-data bugs that change what the demo shows
- `generate_data.py:11-14` — `pan()` calls `random.seed(name)` on the **global** RNG. The multi-state branch `V029` is generated with `p=pan("Sundaram Steel Traders")`, which reseeds the RNG to the same state as when `V001` was generated, so V029 gets **the same bank account, phone and filing IP** as V001 (`vendors.csv` rows V001 and V029). The vendor pair that exists to prove invariant 5 (legitimate multi-state, shared PAN) is therefore flagged at score 95 through A1, A4-phone and A5. Verified at `GET /api/debug/risk`.
- Consequence for the demo script: "March 2025. Everything green" (DEMO_SCRIPT §1:35) is not what the code shows. At `asof=2025-03` five vendors are already flagged: the three-vendor ring (network rules fire from day one) and the honest Sundaram pair. The "ITC exposed" counter at March 2025 is ₹69,407, which is Sundaram's first invoice. The final-month counter shows ₹30,70,069, not the script's ₹20,21,186, because `graphAt` counts **all** recorded ITC of every flagged vendor (`alibi-store.ts:316`), not the ITC inside a cancelled period.

---

## 3. What is load-bearing

Things worth carrying forward, with the caveat attached to each.

- **`server/risk.js` — the rule port.** Weights, severities, message templates, A3-suppression-on-shared-PAN (`buildEdges`, `risk.js:75`), A1-before-A6 ordering (`risk.js:416-420`), the `unknown` band for zero snapshots (`risk.js:150-157`), cap at 100, and the number-word formatting all match RISK_RULES.md. This is the specification of M3 in executable form. It is not the M3 implementation: edges are a pairwise scan (`risk.js:66-86`), cluster adjacency is rebuilt per vendor (`risk.js:98-114`), point-in-time is month-granular and ignores whether the peer existed at `asOf`, and it is untyped JS.
- **The API surface.** `/graph?asof`, `/vendor/:id`, `/defence/:id`, `/verify` are the right nouns. The response shapes are reasonable starting contracts for M3, M5, M6.
- **The scrubber's in-place update.** `app.js:58-64` (`patchGraphData`) copies new node fields onto existing node objects while preserving `x/y/z/vx/vy/vz/fx/fy/fz`, then re-applies the accessor functions (`app.js:40`). This is exactly the M6 requirement ("without resetting the force simulation") and the only piece of frontend logic I would keep verbatim.
- **The drawer** (`app.js:104-127`): shows severity, sentence, weight; never shows `rule_id`; snapshot history filtered to the selected month; loading and error states; focus management. Good bones for M6.
- **The defence-file JSON shape** (`alibi-store.ts:413-427`) matches PRD §7. The `status_on_date` lookup honestly returns "No snapshot on file" when there is none (`alibi-store.ts:399`). The `statement` logic is wrong (section 5.7) but the envelope is right.
- **The `asof` regex** (`routes/alibi.ts:22`) is the only input validation in the codebase and it works (400 on `2025-3`).
- **The prompt documents** (PRD, RISK_RULES, CASES, DEMO_SCRIPT, THREEJS_REFERENCE, REPLIT_PROMPT) are the product spec and the evidence base. They belong in `docs/`, once, not in `.conversation/`.
- **`generate_data.py`** is the right seed for M6's labelled sample data, after (a) the RNG bug is fixed, (b) it emits `payload_json` and hashes under the M1 construction, and (c) it is ported to TypeScript so CI can regenerate fixtures without Python.
- **Workspace skeleton**: `pnpm-workspace.yaml` (minimum-release-age guard is worth keeping), `tsconfig.base.json` (strict-ish), the esbuild bundle, pino with header redaction.

---

## 4. What to delete

Recommended for the M0 infrastructure commit, pending your reply.

| Delete | Why |
|---|---|
| `artifacts/mockup-sandbox/` (entire) | Replit design canvas. 55 shadcn components, React, Tailwind, ~50 packages, none used by the product. Removes the bulk of `pnpm-lock.yaml`. |
| `lib/api-client-react/` | React Query client for a React app that does not and will not exist (brief: plain HTML/JS). |
| `lib/api-spec/`, `lib/api-zod/` | Three packages and an Orval codegen step to validate `{status:"ok"}`. If we want zod validation at the boundary (M7), write the schemas by hand next to the routes. |
| `lib/db/` (Drizzle) | Brief says the snapshot chain SQL is hand-written and "no ORM magic there". Replace with `pg` + a plain SQL migration runner. Keeping Drizzle for the *other* tables is a choice you could make; my recommendation is one mechanism for all tables so nobody reaches for the ORM on the snapshot table by habit. |
| `artifacts/api-server/src/lib/alibi-store.ts:134-267` (`findingsFor`) | Dead second risk engine with different logic (no A6/B2/B4/B6/C3, different B1 window). Two rule engines is one too many. |
| `.conversation/`, `attached_assets/`, `.agents/`, `screenshots/` | Replit session residue. Move the six prompt documents to `docs/` first. Drop the duplicate 171 KB `snapshots.json`. |
| `scripts/src/hello.ts`, `scripts/post-merge.sh` | Placeholder and Replit hook. The `scripts` package can stay as the home for the sample-data generator. |
| `@replit/connectors-sdk` (root `package.json:13`) | Unused. |
| `replit.md` | Its constraints are now wrong ("do not introduce a database or external lookups"). Replace with a README that states the current constraints. |
| `.replit`, `.replit-artifact/*.toml`, `.replitignore` | **Only if** Replit is no longer the deployment target. See section 6. |
| `pnpm-workspace.yaml` catalog entries for react, react-dom, expo pins, tailwind, framer-motion, wouter, lucide, etc. | Dead once the sandbox goes. |

Keep `GET /api/debug/risk` for now; it is the fastest way to eyeball rule output. It must become dev-only or admin-gated in M4 because it prints rule IDs and every vendor's findings to anyone.

---

## 5. Structural problems that will make later milestones harder

Ordered by how much they cost if not fixed at M0/M1.

### 5.1 The hash chain cannot verify content, only linkage (blocks M1, M5)
`payload_hash` is `sha256(prev_hash + json.dumps({v,c,s,rc,lf}, sort_keys=True))[:16]` (`generate_data.py:117-120`). That preimage is not stored. `verifyChain` (`alibi-store.ts:365-376`) only checks that each row's `prev_hash` equals the previous row's `payload_hash`. **Editing any status, date or flag in `snapshots.json` leaves `/api/verify` reporting `verified: true`** (demonstrated, section 7.1). The hash is also truncated to 64 bits. The M1 construction (`sha256(prev_hash || canonical(payload_json))`, full digest, `payload_json` stored verbatim) is incompatible with every existing row, so the current seed data cannot be migrated into the M1 table and must be regenerated. Nothing in the current chain code should survive M1.

### 5.2 No persistence and no append path (blocks M1, M2, M4)
All state is three files parsed into module-level constants (`alibi-store.ts:81-87`). There is no write path anywhere, so invariants 2 and 4 are currently vacuous rather than satisfied. `org_id` does not exist on any record. M1's snapshot table, M2's job state, and M4's row-level isolation all start from an empty schema.

### 5.3 Risk evaluation is O(n²) per request and O(n³) for `/vendors` (blocks M3)
`riskFor` (`alibi-store.ts:269-277`) calls `riskResults(asOf)`, which evaluates **every** vendor, then picks one. `listVendors` (`alibi-store.ts:279-281`) calls `riskFor` once per vendor, so `/api/vendors` evaluates all vendors n times. `buildEdges` is a pairwise scan (`risk.js:66-86`) and runs inside every evaluation. `denseClusterFor` rebuilds the full adjacency map per vendor (`risk.js:98-114`). At 34 vendors this is invisible; at 10,000 it is hours. M3's "edges from the edge table, under 2 seconds" is a rewrite, not a port.

### 5.4 Point-in-time is month-granular and half-applied (blocks M3)
`asOf` is `YYYY-MM` and compared as a string prefix (`risk.js:147,161`; `alibi-store.ts:116,192,290`). Snapshots and transactions are filtered; **edges and peers are not**: A-rules fire against vendors that did not exist at `asOf` (`risk.js:168-227` use the unfiltered edge list). A vendor registered after `asOf` gets `unknown` for itself but still contributes edges to everyone else. The B4 message says "Registered {n} months ago" where `n` is measured to the newest early transaction, not to `asOf` (`risk.js:308-313`): at `asof=2026-09` it prints "Registered six months ago" for a vendor registered 19 months earlier. Findings carry no `as_of` (`risk.js:165`) despite RISK_RULES implementation note 2; the dead `findingsFor` engine had it, the live one dropped it.

### 5.5 The frontend hard-codes the generator's calendar and has no data-entry path (blocks M6)
`app.js:5` fixes 19 months starting March 2025. There is no upload, no column validation, no sample-vs-own distinction, no 2D fallback (only a warning banner, `index.html:28`), no defence export control. M6 keeps `patchGraphData` and the drawer and rebuilds the rest.

### 5.6 The two-column attribute problem (blocks M1 vendor choice, shapes M3)
Rules A5 (`filing_ip`) and B5 (`aadhaar_authenticated`) consume columns that only the generator produces. A1 (`bank_account`), A4 (`phone`, `email`) consume columns that are plausibly the **user's** knowledge of their vendor (they pay the account; they have the contact) rather than anything a register lookup returns. I do not know which of these a licensed verification API returns (section 6). Until that is known, M3 cannot say which A-rules can fire on real data, and the "day one screening" tier may in practice be "screening of whatever columns the user's vendor master happens to have".

### 5.7 The defence statement asserts things it did not compute (blocks M5)
`alibi-store.ts:406-411`: the cancellation is found by scanning the chain **in reverse** for a `Cancelled` row, so the statement reports the *latest* capture (for Meridian: "cancelled with retrospective effect on 2026-09-01") rather than the first observation (2026-07-01), and conflates the capture date with the effective date (2025-04-01). The clause "after the listed transactions" is a string constant, not a comparison; it would be printed even if a transaction post-dated the cancellation. `chain` is not filtered to the export date. `exported_at` is the wall clock, so no two exports are byte-identical. M5's "deterministic, same inputs → byte-identical" and "honest verification display" both fail here today.

### 5.8 TypeScript imports untyped JS through a suppressed error
`alibi-store.ts:5-6` — the risk engine's interface is asserted via a manual type at `alibi-store.ts:91-101`. The brief says TypeScript. M3 should port `risk.js` to `.ts`; the `replit.md` constraint that kept it JS no longer applies.

### 5.9 Deployment is welded to Replit's path router
The frontend fetches `./api/...` on the same origin; nothing in the repo serves both. Locally I had to write a proxy to see the app. Production on Replit uses two services and a router (`artifact.toml` in each artifact). M4/M7 need one process (or one reverse proxy config) that serves static files and `/api` together, or the frontend needs a configurable API base.

### 5.10 Security posture is "internal demo"
`cors()` with no origin restriction (`app.ts:28`), no rate limiting, `req.params.id` passed straight to a Map lookup (harmless today, a habit tomorrow), `/api/debug/risk` public. Nothing catastrophic because nothing is writable, but M4 inherits none of it and must add all of it.

### 5.11 3D camera bug (M6)
`app.js:75` calls `zoomToFit(500, 95)` on the first engine stop. In a real browser the camera ended at z≈44 looking at z≈−955, inside the node cloud; after a single scrubber step the spheres filled the viewport and hid the overlay (section 7.2). Cosmetic in the sense that data is unaffected; fatal in the sense that the "demo moment" is unusable after one interaction.

---

## 6. What I could not determine

- **What a licensed GST verification API actually returns.** Specifically whether any GSP exposes `bank_account`, `phone`, `email`, `filing_ip`, an Aadhaar-authentication flag, return-filing status (`returns_current`, `last_return_filed`), or a retrospective cancellation effective date. My belief is that filing IP is enforcement-internal and not available to anyone, and that bank details are not in the public GSTIN search, but I have not verified this against any provider's documentation and I should not be trusted on it. This is your decision 1 and it determines which risk rules can exist on real data.
- **The real status vocabulary** (`Active`, `Suspended`, `Cancelled`, and whatever else: "Provisional", "Inactive", "Cancelled suo-moto"?). The engine matches lower-cased strings; unknown vocabulary would silently match nothing.
- **Whether Replit remains the deployment target.** Determines whether the `.replit*` files are deleted or maintained, and whether the two-service path router stays.
- **Whether the 16-character hash truncation was a deliberate readability choice for the demo** or an oversight. Either way it goes at M1.
- **Whether the ring vendors being flagged from March 2025 is the intended product behaviour.** It contradicts the demo script's "everything green" but is arguably correct (screening surfaces structure on day one). If the intent was that network rules only fire once a *snapshot* exists for the peer, that is a rule change and yours to make.
- **Whether A1/A4/A5 should suppress on shared PAN the way A3 does.** A real multi-state business may legitimately share one bank account and one phone number across its GSTINs. RISK_RULES.md suppresses only A3. The seed bug (section 2.4) makes this visible today; it is a rule-weight question I am not deciding.
- **Whether jsDelivr as a runtime dependency is acceptable.** The graph library is loaded from a CDN on every page load; an offline or firewalled CA office gets the warning banner and no graph. `3d-force-graph` 1.80.0 is the current npm release as of today.
- **Headless WebGL.** The Replit screenshots show context creation failing in its browser; in Chrome on this machine with a GPU it works. Nothing in the repo exercises the 2D path because there is no 2D path. The brief's CI requirement stands.
- **Whether `last_return_filed` as a free-text month label ("Feb 2026") is the shape any API returns.** The engine never reads it; only `returns_current` is used.

---

## 7. Verification evidence

### 7.1 Tamper test (invariant 3)
Scratch copy of the built server and data. Row `S00568` (Meridian Traders, captured 2026-07-01) edited from `status: "Cancelled", retrospective_from: "2025-04-01"` to `status: "Active", retrospective_from: null`, hashes untouched.

| Call | Result on tampered data |
|---|---|
| `GET /api/verify` | `{"verified":true,"links":646,"failures":[]}` |
| `GET /api/defence/V030` → `chain` | `{"verified": true, "links": 19, "root_hash": "0000000000000000"}` |

Control: with `prev_hash` on the same row set to `ffffffffffffffff`, `/api/verify` correctly returned `verified:false` with that row listed. The linkage check works; the content check does not exist.

### 7.2 Browser (real Chrome, GPU available, via a scratch proxy that mimics Replit's path router)
- **Initial load**: WebGL context created; 34 spheres visible as a tight clump at the centre of the viewport (red and green, no orange visible at that zoom), links present in `graphData` (18) but not distinguishable at that camera distance; counters "34 / 646 / ₹30,70,069"; status card reads "network / uploaded records". No console errors.
- **Scrubber to 2025-03**: counters updated to "34 / 34 / ₹69,407"; bands clear 27, flagged 5, watch 2; flagged = the three ring vendors plus both Sundaram entities. Camera had by then jumped to inside the node cloud (camera z=44.4, lookAt z=−955.6); spheres and link tubes filled the screen and covered the counters.
- **Vendor select → Meridian Traders**: drawer opened; header, GSTIN/PAN/state, score 100 / flagged, six findings as plain sentences with severity and weight, no rule IDs, snapshot history through 2025-03 with payload and previous hash. Works.
- **Not tested**: hover labels, mouse orbit, play button timing, mobile layout. The committed screenshots show only the no-WebGL state.

### 7.3 Build and API
- `pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm --filter @workspace/api-server run build` all succeed. Server starts from the workspace root, `/api/healthz` returns `{"status":"ok"}`.
- `/api/graph?asof=2025-3` → 400 with a clear message. `/api/vendor/NOPE` → 404.
- Rule output for all 34 vendors captured via `/api/debug/risk`; every finding is a complete sentence; the 34 scores reproduce the generator's intended structure except for the Sundaram pair (section 2.4).
- No secrets found in the repo (grep for key/secret/password/token across source and config; the only hit is a Replit asset-manifest version token, not a credential).

### 7.4 Invariant scorecard

| # | Invariant | State today |
|---|---|---|
| 1 | No snapshots → `unknown` | Implemented (`risk.js:150-157`), but **untested**: every seed vendor has a snapshot from its registration month. |
| 2 | Append-only | Vacuous. Nothing writes. |
| 3 | Never display an unverified chain as verified | **Violated.** Section 7.1. |
| 4 | Never fabricate a snapshot | Vacuous for the code (no lookup exists); violated by the product surface, which calls 646 generated rows "Snapshots sealed". |
| 5 | Shared PAN near-zero weight | A2 = 5 ✓. But the multi-state pair is flagged 95 via other rules because of the seed bug, and whether that is a rule gap is open (section 6). |
| 6 | Plain-English findings, no rule IDs | ✓ in the drawer. `/api/debug/risk` prints IDs; keep it non-user-facing. |
| 7 | Sample data labelled as sample | **Violated** in seven places (section 2.2). |
| 8 | Deterministic rules | ✓. |
