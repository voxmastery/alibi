# REPLIT AGENT — BUILD PROMPT

Paste **Block 1** first. Do not paste everything at once — Replit Agent degrades badly on long specs. Ship each block, confirm it works, then move on.

---

## Feasibility notes (read before starting)

- **Do not attempt live GSTIN lookup in the first pass.** The official portal requires a CAPTCHA per lookup. Third-party verification APIs exist and return status, legal name, filing history, but they need keys and have rate limits. Treat live lookup as P1 and make it fully skippable.
- **Do not hand-roll force simulation.** Use `3d-force-graph` (MIT, wraps Three.js) from CDN.
- **Do not add auth, database, or user accounts.** Single-session, in-memory + one JSON file.
- If the 3D graph is not rendering by 13:30, stop and fall back to 2D canvas. Keep the time scrubber — it matters more.

---

## BLOCK 1 — Scaffold + data

```
Build a single-page web app called "Alibi" — a vendor due-diligence recorder for Indian SMEs.

Stack: plain HTML + vanilla JS + Express backend. No React, no build step, no auth, no database.

Load these from CDN:
- 3d-force-graph (latest UMD build from unpkg or cdnjs)

Create this structure:
  /public/index.html
  /public/app.js
  /public/style.css
  /server.js
  /data/vendors.csv
  /data/transactions.csv
  /data/snapshots.json

I am uploading vendors.csv, transactions.csv and snapshots.json — put them in /data and
read them from there. Do not generate your own sample data.

Server endpoints:
  GET  /api/vendors          -> vendors with computed risk scores and findings
  GET  /api/graph?asof=YYYY-MM  -> { nodes, links } for the network at that month
  GET  /api/vendor/:id       -> vendor + findings + full snapshot chain
  GET  /api/defence/:id      -> the defence file JSON (schema in PRD section 7)
  GET  /api/verify           -> hash chain verification result

For now just serve the data and a blank page that logs the vendor count to console.
Confirm it loads before doing anything else.
```

---

## BLOCK 2 — Risk engine

```
Implement the risk engine in /server/risk.js.

Read RISK_RULES.md (uploaded) and implement every rule exactly as specified, including
the weights and the plain-English message templates.

Rules operate on two things:
  1. Shared-attribute edges between vendors (pan, bank_account, address, phone, email, ip)
  2. Snapshot history per vendor (status transitions, return filing gaps)

Output per vendor:
  { vendor_id, score: 0-100, band: "clear"|"watch"|"flagged", findings: [...] }

Each finding: { rule_id, severity, weight, message }
The message must be a complete plain-English sentence naming the other vendor where
relevant. Example: "Shares bank account XXXX4471 with Meridian Traders and
Kavach Supplies — three entities, one account."

Critical: a vendor with NO snapshots must return band "unknown", not "clear".
Never infer safety from absence of data.

Add a test route GET /api/debug/risk that prints every vendor's score and findings
as plain text so I can verify the logic before any UI exists.
```

---

## BLOCK 3 — The 3D network

```
Build the main screen: a full-bleed 3D force-directed graph using 3d-force-graph.

Nodes = vendors.
  - Node colour by risk band: clear = #2DD4A7, watch = #F5A524, flagged = #FF4D4D,
    unknown = #555A66
  - Node size scales with total transaction value
  - Node label on hover: legal name + score

Links = shared attributes between vendors.
  - Link colour by attribute type (give each of pan/bank_account/address/phone/email/ip
    its own hue)
  - Link width by how unusual the shared value is (shared bank account = thickest)

Background: #0A0B0E. Ambient dark, no grid, no axes.

Overlay UI, absolutely positioned over the canvas, never blocking the centre:
  - Top-left: three counters — "Vendors tracked", "Snapshots sealed", "ITC exposed (₹)".
    Animate the numbers counting up on load over 800ms.
  - Top-right: risk band legend, small, monospace.
  - Bottom-centre: time scrubber (see Block 4).

Typography: system sans for labels, monospace for every number and hash. No exceptions —
all numeric content is monospace.

Click a node -> console.log the vendor id for now. Drawer comes in Block 5.
```

---

## BLOCK 4 — The time scrubber (this is the demo moment)

```
Add a horizontal time scrubber pinned to the bottom of the graph screen.

Range: March 2025 to September 2026, stepping by month.
Controls: a draggable handle, and a play button that advances one month per 600ms.

On each step, call GET /api/graph?asof=YYYY-MM and update the graph IN PLACE —
do not rebuild the scene. Transition node colours over 400ms so the change is
visible, not instant.

The graph at a given month must reflect ONLY what was known at that month:
  - A vendor's colour uses the snapshot in effect at that date
  - Edges only appear once both vendors existed at that date
  - A vendor registered after the selected month is not shown at all

Above the scrubber, show the selected month in large monospace, plus a single line
of context that updates: e.g. "Nov 2025 — 2 vendors changed status this month".

This is the centrepiece of the demo. It must be smooth. Spend time here.
```

---

## BLOCK 5 — Vendor drawer

```
Clicking a node slides in a panel from the right, 420px wide, over the graph.
The graph stays visible and interactive behind it.

Panel contents, top to bottom:
  1. Legal name, trade name, GSTIN (monospace), state
  2. Risk score as a large number with its band colour, and the band name
  3. Findings: each on its own row — severity dot, then the plain-English message.
     No jargon, no rule IDs shown to the user.
  4. Snapshot timeline: vertical list, newest first. Each row shows
     date | status on that date | first 8 chars of payload hash.
     Status changes highlighted — a row where status differs from the row below
     gets a left border in the new status's colour.
  5. Button: "Export defence file"

Escape key or clicking the graph closes the drawer.
```

---

## BLOCK 6 — Defence file

```
"Export defence file" opens a new tab rendering GET /api/defence/:id as a
clean printable HTML page.

Layout:
  - Header: "DILIGENCE RECORD", vendor legal name, GSTIN, exported timestamp
  - Section 1: Transactions table — invoice no, date, amount, ITC claimed,
    "Status on that date", "Returns current", payment mode. Monospace throughout.
  - Section 2: Hash chain — each link with its hash prefix and a verified tick.
    One line: "Chain verified: 14 links, root a3f9c2...". If verification fails,
    say so loudly in red — never show a green tick you haven't earned.
  - Section 3: The statement paragraph from the JSON, set larger, in a bordered box.
  - Footer: "This record states what the public register showed on the dates listed.
    It is evidence, not legal advice."

Must look good printed to A4. Use @media print to strip the background colour.
```

---

## BLOCK 7 — Polish (only after everything above works)

```
- Count-up animation on the three overlay counters
- Smooth 400ms colour transitions on the scrubber
- Focus the camera on a node when clicked, animating over 700ms
- Keyboard: spacebar toggles scrubber play/pause
- Loading state: the graph fades in rather than popping
- One accent colour only (#2DD4A7). Do not introduce a second.
```

---

## What NOT to let the agent do

If Replit Agent suggests any of these, say no:

- Adding React or a build step — it will cost you an hour
- Generating its own sample data — yours is designed to demo, its won't be
- Adding a login screen
- Fetching live GST data in Block 1
- Building a "dashboard" with charts — the graph IS the dashboard
- Adding a second accent colour

---

## Time checkpoints

| Time | Must be true |
|---|---|
| 11:00 | Block 1 done, data loading, vendor count in console |
| 12:15 | Block 2 done, `/api/debug/risk` prints correct findings |
| 13:30 | Block 3 done, graph renders. **If not: fall back to 2D now.** |
| 14:45 | Block 4 done, scrubber works |
| 15:30 | Blocks 5 and 6 done |
| 16:00 | Block 7, stop adding features |
| 16:15 | Rehearse the demo twice, end to end, on the actual machine you'll present from |
