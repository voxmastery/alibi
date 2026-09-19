import { describe, expect, it } from "vitest";
import { evaluateRisk, type EdgeInput, type SnapshotInput, type TransactionInput, type VendorInput } from "@alibi/core";

/** Small deterministic PRNG so the fixture is identical on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function fixture(vendorCount: number) {
  const rand = lcg(1947);
  const vendors: VendorInput[] = [];
  const snapshots: SnapshotInput[] = [];
  const transactions: TransactionInput[] = [];
  const edges: EdgeInput[] = [];
  for (let i = 0; i < vendorCount; i++) {
    const id = `V${String(i).padStart(5, "0")}`;
    vendors.push({
      id,
      legal_name: `Vendor ${i}`,
      state: ["Karnataka", "Maharashtra", "Delhi"][i % 3]!,
      registered_on: "2022-01-01",
      pan: `PAN${String(Math.floor(i / 2)).padStart(7, "0")}`,
      bank_account: String(1_000_000 + Math.floor(i / 3)),
      aadhaar_authenticated: rand() > 0.1,
    });
    for (const month of ["2025-03-01", "2025-09-01", "2026-03-01"]) {
      snapshots.push({ vendor_id: id, captured_at: month, lookup_ok: true, status: rand() > 0.02 ? "Active" : "Suspended", returns_current: rand() > 0.1, retrospective_from: null });
    }
    transactions.push(
      { vendor_id: id, date: "2025-06-15", amount: 10_000 * Math.ceil(rand() * 50), itc_claimed: 1000, payment_mode: rand() > 0.05 ? "NEFT" : "Cash", eway_bill: "EWB1" },
      { vendor_id: id, date: "2026-01-15", amount: 10_000 * Math.ceil(rand() * 50), itc_claimed: 1000, payment_mode: "NEFT", eway_bill: null },
    );
  }
  // Rings of three sharing bank account, address and phone; PAN pairs.
  for (let i = 0; i + 2 < vendorCount; i += 3) {
    const [a, b, c] = [vendors[i]!.id, vendors[i + 1]!.id, vendors[i + 2]!.id];
    for (const attribute of ["bank_account", "address", "phone"] as const) {
      const value = `${attribute}-${i}`;
      edges.push({ from_vendor: a, to_vendor: b, attribute, value }, { from_vendor: b, to_vendor: c, attribute, value }, { from_vendor: a, to_vendor: c, attribute, value });
    }
  }
  for (let i = 0; i + 1 < vendorCount; i += 2) {
    edges.push({ from_vendor: vendors[i]!.id, to_vendor: vendors[i + 1]!.id, attribute: "pan", value: vendors[i]!.pan! });
  }
  return { vendors, snapshots, transactions, edges };
}

describe("performance", () => {
  it("evaluates 10,000 vendors with 30,000 snapshots and 35,000 edges in under two seconds", () => {
    const data = fixture(10_000);
    expect(data.edges.length).toBeGreaterThan(30_000);
    evaluateRisk({ as_of: "2026-09-01", ...data }); // warm-up: JIT and Intl initialisation are not what we measure
    const started = performance.now();
    const results = evaluateRisk({ as_of: "2026-09-01", ...data });
    const elapsed = performance.now() - started;
    expect(results.length).toBe(10_000);
    expect(results.filter((r) => r.band === "flagged").length).toBeGreaterThan(9_000);
    expect(elapsed).toBeLessThan(2_000);
  }, 30_000);
});
