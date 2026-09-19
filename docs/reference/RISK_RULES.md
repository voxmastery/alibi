# ALIBI — Risk Rules Specification

Every rule below is derived from signals that appeared in actual Indian enforcement cases, not invented. Implement exactly as written.

**Source anchor:** in the Delhi ₹347-crore fake-billing case, investigators found that of 11 firms — four filed returns from computers sharing the same IP address, six shared the same contact number, four used the same email ID, two shared the same bank account number, and none existed at their registered address. In a Thane case, one individual registered 22 non-genuine firms using misappropriated Aadhaar and PAN details.

Those are the rules. We are not guessing at what fraud looks like.

---

## Scoring

Score = `min(100, sum of triggered rule weights)`

| Band | Range | Colour | Meaning |
|---|---|---|---|
| `clear` | 0–24 | `#2DD4A7` | Nothing adverse on record |
| `watch` | 25–54 | `#F5A524` | One or more soft signals |
| `flagged` | 55–100 | `#FF4D4D` | Pattern consistent with known shell structures |
| `unknown` | n/a | `#555A66` | **No snapshots on file** |

**Hard rule:** a vendor with zero snapshots is `unknown`, never `clear`. Absence of record is stated as absence. We never infer safety from missing data — that inversion is exactly what gets buyers into trouble.

---

## A. Network rules (shared-attribute edges)

### A1 — Shared bank account
**Weight 45 · Severity high**
Two or more vendors with the same `bank_account`.
> "Shares bank account ending {last4} with {other_names} — {n} entities, one account."

Highest-weight single signal. Independent businesses do not share a settlement account.

### A2 — Shared PAN, different GSTINs across states
**Weight 5 · Severity info**
> "Holds {n} GSTINs under one PAN across {states}. Normal for multi-state operations."

**This is legitimate.** A business with operations in multiple states must obtain a separate GSTIN for each state, all sharing the same PAN. Include it as *context*, weighted near zero. Getting this wrong flags every honest multi-state vendor — and a judge who knows GST will catch it.

### A3 — Shared registered address
**Weight 30 · Severity high**
Two or more unrelated PANs at an identical `address` string.
> "Registered at the same address as {other_names}. No shared PAN or group structure on record."

Suppress if the vendors share a PAN (that's A2, a branch).

### A4 — Shared phone or email
**Weight 20 each · Severity medium**
> "Contact number shared with {other_names}."
> "Email address shared with {other_names}."

### A5 — Shared filing IP
**Weight 25 · Severity high**
> "Returns filed from the same IP address as {other_names}."

### A6 — Cluster density
**Weight 25 · Severity high**
Three or more vendors mutually connected by two or more distinct attribute types.
> "Part of a {n}-entity cluster linked by {attributes}. This structure matches known circular-trading patterns."

Only fires on genuine rings. This is the rule that lights up the demo.

---

## B. Snapshot-history rules

### B1 — Retrospective cancellation
**Weight 50 · Severity critical**
`status` moved to `Cancelled` with an effective date **earlier than** transactions already recorded.
> "Registration cancelled with retrospective effect from {date}. {n} transactions worth ₹{amount} fall inside the cancelled period. ITC of ₹{itc} is exposed."

This is the notice event. It is what the defence file exists for.

### B2 — Return filing gap
**Weight 30 · Severity high**
No GSTR-3B filed for 2+ consecutive periods while active.
> "No GSTR-3B filed for {n} periods to {date}. A supplier not filing is likely not remitting the tax you paid them."

### B3 — Suspended status
**Weight 35 · Severity high**
> "Registration suspended on {date}."

### B4 — New registration, high value
**Weight 15 · Severity medium**
Registered under 6 months and receiving over ₹10 lakh in transactions.
> "Registered {n} months ago. ₹{amount} transacted since — high value against a short history."

### B5 — No Aadhaar authentication
**Weight 15 · Severity medium**
> "GSTIN not Aadhaar-authenticated."

Relevant because fake registrations have been obtained using misappropriated Aadhaar and PAN details; biometric Aadhaar authentication was introduced specifically to close this.

### B6 — Status volatility
**Weight 20 · Severity medium**
Three or more status changes in 12 months.
> "Registration status changed {n} times in the last year."

---

## C. Transaction rules

### C1 — Cash payment
**Weight 25 · Severity high**
> "₹{amount} paid in cash. Payment through banking channels is what protects an ITC claim."

Courts weigh payment through banking channels heavily when deciding whether a transaction was bona fide. Cash removes that protection.

### C2 — Missing e-way bill above threshold
**Weight 20 · Severity medium**
> "No e-way bill recorded for {n} consignments above ₹50,000. Movement of goods cannot be evidenced."

### C3 — Round-number invoicing
**Weight 10 · Severity low**
Over 80% of invoices are exact multiples of ₹10,000.
> "{pct}% of invoices are round figures."

Weak on its own. Only meaningful alongside a network finding.

---

## D. Protective findings (positive, not scored)

Shown in the drawer in green. Weight 0. These are what the defence file is built from.

### D1
> "Active on the public register on every transaction date. {n} snapshots on file."

### D2
> "Returns current at the time of every transaction."

### D3
> "All payments through banking channels."

---

## Implementation notes

1. **Compute A-rules from edges, not pairwise scans.** Build the edge list once.
2. **Every finding carries an `as_of` date.** The scrubber needs to replay findings at a point in time, not just recompute against today.
3. **Never show `rule_id` to the user.** The message is the output.
4. **Suppress A3 when vendors share a PAN.** Branches of one company at one address are not a red flag.
5. **Cap at 100** but keep the raw sum internally — useful for ordering the drawer's findings by weight.
6. When a vendor trips both A1 and A6, show A1 first. The bank account is the sentence a judge repeats back to you.
