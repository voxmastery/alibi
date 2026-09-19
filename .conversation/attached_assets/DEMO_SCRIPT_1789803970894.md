# ALIBI — Demo Script

**Target: 3 minutes.** Rehearse twice before judging. Time yourself.

---

## The 15-second version (if that's all you get)

> "When your supplier's GST registration gets cancelled retrospectively, you get the notice — even though you did nothing wrong. Courts side with you *if* you can prove the GSTIN was active the day you transacted. Nobody can, because the portal only shows today. Alibi records what the register said on every date you checked, and exports it as a defence file."

---

## Full run

### 0:00 — Open on the number, not the product

> "Last financial year, tax officers detected ₹74,782 crore of fraudulent input tax credit across 30,162 cases. Everyone's building fraud detection for that number.
>
> I built for the other victim."

### 0:20 — The real problem

> "In Ludhiana, about forty furnace industrialists got GST notices over scrap dealers who turned out to be running bogus billing. They'd already paid 18% GST to those dealers. Their argument was simple — the department issues the GST numbers, so verifying them is the department's job.
>
> Courts agree with them, mostly. If you can show the supplier was registered and active on the date you transacted, and you paid through banking channels, your ITC survives. But only after prolonged litigation."

### 0:45 — The insight (pause before this line)

> "Here's what nobody has solved. You can check a GSTIN today. You cannot check what it said on the 14th of March last year.
>
> When the department cancels a registration retrospectively, it overwrites the exact record that would have cleared you. The evidence you need is destroyed by the process that accuses you.
>
> Alibi is a time machine for vendor status."

### 1:05 — Show the network

*Open the graph. Say nothing for two seconds. Let them look.*

> "This is a vendor base. 34 suppliers. Lines are shared identity attributes — same PAN, same address, same phone, same bank account."

*Point at the red cluster.*

> "These three share a bank account, a registered address, a phone number, and they file their returns from the same IP address. That's not a coincidence, that's a structure. In the Delhi ₹347-crore case, investigators found exactly this — firms sharing IPs, contact numbers, emails, and in two cases a bank account."

### 1:35 — The scrubber (this is the moment)

*Drag to March 2025. Everything green.*

> "March 2025. All clean on the public register. This is what you'd have seen if you'd checked."

*Hit play. Let it run.*

> "Watch. Returns stop in March 2026. Suspended in May. Cancelled in July 2026 — **with retrospective effect from April 2025.**"

*Stop. Let the red sit there.*

> "₹1.32 crore of purchases now sit inside a cancelled period. ₹20,21,186 of input tax credit exposed. That notice is coming."

### 2:05 — The payoff

*Click Meridian Traders. Drawer opens. Scroll to the snapshot timeline.*

> "But here's September 2025 — the day we transacted. Status: Active. Returns: current. Sealed with a hash, chained to every snapshot before it."

*Click Export defence file.*

> "One click."

*Read the statement box aloud.*

> "That's the paragraph the CA pastes into the reply to the department. Dated, hash-verified, and it says exactly what the public register said on the day the money moved."

### 2:40 — Close

> "Alibi doesn't try to out-detect GSTN — they have DGARM and BIFA and they're better at it than I'll ever be.
>
> Alibi makes sure that when the honest buyer gets accused, they have the receipt."

---

## Answers to the questions you will be asked

**"Why not just check the GST portal?"**
> The portal is a live lookup. It answers "what is this GSTIN now." It has no history API, and retrospective cancellation rewrites what you'd see. Alibi's value isn't the lookup — it's the timestamped, chained record of the lookup.

**"Couldn't someone fake the snapshots?"**
> Each snapshot is hashed with the previous one's hash. Altering any historical record breaks every link after it, and the export shows the break. Today the chain is local — in production it's anchored to a third party so the record isn't self-attested.

**"How is this different from ClearTax or a GSTIN verification API?"**
> Those verify. They return today's status and move on. None of them retain a dated, tamper-evident record of what they told you, and none of them produce a defence artifact. Verification is a query; Alibi is a ledger.

**"Is this legal advice?"**
> No, and the export says so. It's evidence. What a CA does with it is their call.

**"Why 3D?"**
> Because the fraud is a network and the risk moves through time. Two dimensions can show you one or the other. Also — honest answer — because when you scrub the timeline and the cluster goes red, people understand it without me explaining. That's worth something.

**"What's the business model?"**
> Per-vendor-per-month, sold to CAs who defend these notices for a living. They have the pain, the client list, and the budget. Not selling to SMEs one at a time.

**"What would you build next?"**
> Two things. Anchoring the hash chain externally so it's not self-attested. And the buyer-side alert: the moment a vendor you've transacted with changes status, you know that week instead of eighteen months later.

---

## Discipline notes

- **Do not open with the architecture.** Nobody cares that it's hash-chained until they care about the problem.
- **Do not say "AI-powered."** Every other team will. The rules are deterministic and that's a feature — you can defend a deterministic rule to a tax officer.
- **Let silences sit.** After the cluster goes red, stop talking for two seconds.
- **If the demo breaks**, go straight to the defence file page. It's static HTML and it carries the whole idea on its own.
- **Numbers to have memorised:** ₹74,782 crore / 30,162 cases / FY26. ₹1.14 lakh crore 2020–2025. ₹20,21,186 exposed in the demo.

---

## Attribution — say this if asked about FluctlightDB

Don't put it on the critical path today. If someone asks about the storage layer:

> "Today the ledger is a JSON file behind a clean interface. The production version is an append-only hash-chained log with point-in-time reads — I've built an embedded engine for exactly that shape of problem. Not shipping it in a seven-hour build on Replit, that'd be reckless."

That reads as judgement, not as a missing feature.
