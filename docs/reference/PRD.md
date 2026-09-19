# ALIBI — Product Requirements Document

**Prove what you knew, when you knew it.**

Buildathon: Razorpay × Replit · 19 Sep 2026 · Razorpay Arena Office, Bangalore
Track: **Finance & Business Ops** → *Vendor or contract tracker*
Fix My Itch problem: *"Why can't businesses verify new suppliers before purchasing?"* — itch score 76, B2B Services

---

## 1. The problem, stated precisely

India's GST system detected **30,162 cases involving ₹74,781.56 crore** of fraudulent input tax credit in FY 2025-26, up from 15,283 cases and ₹58,772.51 crore in FY 2024-25. DGGI has detected fake ITC worth over **₹1.14 lakh crore between 2020 and 2025**.

Those numbers describe the *government's* loss. They are already being attacked by GSTN's own risk engines (DGARM, BIFA, ADVAIT, e-invoicing, IMS).

**There is a second victim with no tooling at all: the honest buyer.**

When a supplier's GST registration is cancelled *with retrospective effect* — often 12–24 months after the fact — every buyer downstream receives a notice demanding reversal of input tax credit they already claimed, plus interest and penalty.

Real case: roughly 40 induction-furnace industrialists in Ludhiana received Central and state GST notices over scrap dealers' bogus billing. Their position: they had already paid 18% GST to those dealers, and since the department issues the GST numbers, verifying the dealers' credentials was the department's job.

### The legal position — and why it doesn't save them

Courts have settled this. Where the supplier was registered and **active on the date of the transaction**, and the buyer paid value and GST through banking channels, ITC cannot be denied merely because the registration was later cancelled retrospectively. Authorities must examine the buyer's documentary evidence rather than reverse ITC mechanically.

But practitioners report the allegation only collapses **after prolonged litigation**, once transportation, inventory and payment records are produced.

### The actual gap (first principles)

The buyer wins *if* they can prove three things about the moment of transaction:

1. The GSTIN was **Active** on that date
2. The supplier was **filing returns** at that time
3. Payment moved through **banking channels**, and goods actually moved

Item 3 they usually have. **Items 1 and 2 are destroyed by the passage of time.**

`gst.gov.in` answers *"what is this GSTIN's status now?"*
No system answers *"what did this GSTIN's status say on 14 March 2025?"*

Retrospective cancellation overwrites the record. The evidence that would exonerate the buyer is the same record the department later rewrites.

**Nobody sells a time machine for vendor status. That is the entire product.**

---

## 2. What Alibi is

Alibi is **not** a fraud detector. GSTN detects fraud better than we ever will.

Alibi is a **diligence recorder**. It does three things:

1. **Snapshots** — every vendor check writes an immutable, hash-chained record of what the public record said at that instant
2. **Network** — it maps vendors against each other on shared identity attributes, surfacing collusion clusters *before* you transact
3. **Defence file** — when the notice arrives, one click exports a dated, hash-verified evidence pack

The insight in one line: **the value isn't catching the fraud, it's owning the receipt.**

---

## 3. Why this earns a 3D interface

The Delhi ₹347-crore fake-billing case is the design spec. Investigators found that of 11 firms: four filed returns from computers sharing the same **IP address**, six shared the same **contact number**, four used the same **email ID**, two shared the same **bank account number**, and none existed at their registered address.

Those are graph edges, not table columns. A shell ring is invisible in a spreadsheet and unmissable in a network view.

Alibi renders the vendor base as a 3D force-directed graph. But the differentiator is **time**: a scrubber along the bottom replays the network month by month. A vendor sits green in March, the cluster tightens through August, it turns red in November — and the snapshot ledger proves you checked it in March when it was clean.

**Scrubbing time and watching risk propagate through the network is the demo moment.** It cannot be done in a table, which is what makes the 3D earned rather than decorative.

---

## 4. Users

| User | Job | Pain today |
|---|---|---|
| SME finance lead | Onboard vendors, claim ITC | Checks GSTIN once, keeps no proof |
| CA / tax practitioner | Defend clients against notices | Reconstructs 18-month-old evidence by hand |
| Procurement | Approve new suppliers | No view of vendor-to-vendor links |

Primary user for the demo: **SME finance lead.**

---

## 5. Scope — build in this order

### P0 — must ship (the demo dies without these)

- **Upload**: drop a vendor master CSV + a transactions CSV
- **Snapshot ledger**: every vendor record stored with `captured_at`, content hash, and `prev_hash` forming a chain
- **Risk engine**: rules in `RISK_RULES.md`, producing a 0–100 score with itemised reasons
- **3D network graph**: nodes = vendors, edges = shared attributes, colour = risk band
- **Time scrubber**: replay network state month by month
- **Vendor drawer**: click a node → 2D side panel with details, risk reasons, snapshot history
- **Defence file export**: one button → dated evidence pack for a selected vendor

### P1 — only if P0 is fully working by 15:00

- Live GSTIN lookup against a public verification endpoint (read `REPLIT_PROMPT.md` §Feasibility first — captcha and rate limits make this risky on stage)
- Exposure calculator: total ITC at risk across flagged vendors

### P2 — do not build today

- Auth, multi-tenancy, real persistence beyond a JSON file
- PDF generation for the defence file (ship JSON + printable HTML instead)
- Any e-way bill / logistics integration

---

## 6. Screens

**Screen 1 — Intake**
Two drop zones: *Vendor master* and *Transactions*. One button: **Build the record.** Nothing else on screen.

**Screen 2 — The Network** (primary)
Full-bleed 3D graph. Overlaid, non-intrusive:
- Top-left: three counters — *Vendors tracked · Snapshots sealed · ₹ ITC exposed*
- Bottom: time scrubber, Mar 2025 → Sep 2026, with a play button
- Top-right: risk-band legend (green / amber / red)

**Screen 3 — Vendor Drawer** (slides over the graph, 2D, does not replace it)
- Vendor identity block
- Risk score with each contributing reason in plain English
- **Snapshot timeline**: a vertical list of every capture — date, status at that date, hash prefix
- Button: **Export defence file**

**Screen 4 — Defence File** (printable HTML, opens in new tab)
- Header: vendor name, GSTIN, export timestamp
- Transaction list with the status that was recorded on each transaction date
- Hash chain table with verification status
- Footer: plain-English statement of what the record establishes

---

## 7. The defence file — output contract

```json
{
  "vendor": { "legal_name": "...", "gstin": "...", "pan": "..." },
  "exported_at": "2026-09-19T16:40:00+05:30",
  "transactions": [
    {
      "invoice_no": "...",
      "date": "2025-03-14",
      "amount": 412000,
      "itc_claimed": 74160,
      "status_on_date": "Active",
      "returns_current_on_date": true,
      "payment_mode": "NEFT",
      "snapshot_hash": "a3f9c2..."
    }
  ],
  "chain": { "verified": true, "links": 14, "root_hash": "0000..." },
  "statement": "On each transaction date listed above, this GSTIN was recorded as Active on the public register and current in its return filings. Payment was made through banking channels. Registration was cancelled with retrospective effect on 2026-07-02, after all transactions listed."
}
```

That `statement` field is the product. It is the sentence the buyer's CA pastes into their reply to the department.

---

## 8. Data model

```
Vendor        id, legal_name, trade_name, gstin, pan, state,
              address, bank_account, phone, email, registered_on

Snapshot      id, vendor_id, captured_at, status, returns_current,
              last_return_filed, payload_hash, prev_hash

Transaction   id, vendor_id, invoice_no, date, amount, itc_claimed,
              payment_mode, eway_bill

Edge          from_vendor, to_vendor, attribute, value
              (attribute ∈ pan | bank_account | address | phone | email | ip)

RiskFinding   vendor_id, rule_id, severity, weight, message, as_of
```

### Storage

Today: a single JSON file behind a `SnapshotStore` interface with four methods — `append`, `get_chain`, `verify`, `as_of(date)`.

**Keep that interface clean and separate.** In production the snapshot ledger is an append-only, hash-chained log with point-in-time reads — which is exactly what an embedded engine like **FluctlightDB** exists to do. Do *not* wire it in today; a Rust dependency on Replit under time pressure is pure downside. Say it in the pitch, ship the JSON.

---

## 9. Success criteria

The demo works if a judge who has never seen the product can, in 90 seconds:

1. See a red cluster in the graph and understand it's a shell ring
2. Watch the scrubber turn a green vendor red
3. Open the defence file and read the `statement` sentence

If any of those three needs explaining, the build has failed regardless of code quality.

---

## 10. Non-goals

- We are not claiming to detect fraud better than GSTN
- We are not offering legal advice; the defence file is evidence, not an opinion
- We are not scoring vendors we have no snapshots for — absence of record is stated as absence, never inferred as clean

---

## 11. Honest risks

| Risk | Mitigation |
|---|---|
| 3D eats the day | Use `3d-force-graph` from CDN. If it isn't rendering by 13:30, fall back to 2D canvas and keep the scrubber. The scrubber matters more than the 3D. |
| Seeded data doesn't pop | Build data first, before any UI. One unmissable three-node ring. |
| Live GSTIN API fails on stage | Demo runs entirely on seeded data. Live lookup is P1 and must be skippable. |
| Judges ask "why not just check the portal?" | Answer: the portal tells you today's status. It cannot tell you March's. That's the whole product. Rehearse this answer. |
