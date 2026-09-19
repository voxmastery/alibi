import { describe, expect, it } from "vitest";
import { evaluateRisk } from "@alibi/core";
import { edgesFromVendors, failedSnap, multiStateVendors, resultFor, ringVendors, snap, tx, vendor } from "./helpers.js";

describe("invariants", () => {
  it("1: a vendor with no snapshots is unknown, never clear", () => {
    const v = vendor({ id: "N", legal_name: "Nothing Known" });
    const [result] = evaluateRisk({ as_of: "2026-09-01", vendors: [v], snapshots: [], transactions: [tx("N", "2026-01-01", 1)], edges: [] });
    expect(result).toEqual({ vendor_id: "N", as_of: "2026-09-01", score: null, band: "unknown", findings: [] });
  });

  it("1 and 4: failed lookups are not observations; a vendor with only failures is unknown", () => {
    const v = vendor({ id: "F", legal_name: "Failed Only" });
    const snapshots = [failedSnap("F", "2026-01-01"), failedSnap("F", "2026-02-01")];
    const [result] = evaluateRisk({ as_of: "2026-09-01", vendors: [v], snapshots, transactions: [], edges: [] });
    expect(result!.band).toBe("unknown");
    expect(result!.score).toBeNull();
  });

  it("4: a failed lookup between two observations neither carries the old status forward nor counts as a snapshot on file", () => {
    const v = vendor({ id: "G", legal_name: "Gap" });
    const snapshots = [snap("G", "2026-01-01"), failedSnap("G", "2026-02-01"), snap("G", "2026-03-01")];
    const [result] = evaluateRisk({ as_of: "2026-09-01", vendors: [v], snapshots, transactions: [tx("G", "2026-02-15", 100000)], edges: [] });
    const d1 = result!.findings.find((f) => f.rule_id === "D1");
    expect(d1?.message).toBe("Active on the public register on every transaction date. two snapshots on file.");
  });

  it("1: a snapshot after as_of does not count; the vendor is unknown on that date", () => {
    const v = vendor({ id: "L", legal_name: "Later" });
    const [result] = evaluateRisk({ as_of: "2026-01-15", vendors: [v], snapshots: [snap("L", "2026-02-01")], transactions: [], edges: [] });
    expect(result!.band).toBe("unknown");
  });

  it("5: the honest multi-state vendor is clear with A2 as context at weight five", () => {
    const vendors = multiStateVendors();
    const snapshots = vendors.flatMap((v) => [snap(v.id, "2025-03-01"), snap(v.id, "2026-03-01")]);
    const transactions = vendors.map((v) => tx(v.id, "2025-08-01", 459000));
    const results = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots, transactions, edges: edgesFromVendors(vendors) });
    for (const id of ["V001", "V029"]) {
      const result = resultFor(results, id);
      expect(result.band).toBe("clear");
      expect(result.score).toBe(5);
      expect(result.findings.map((f) => f.rule_id)).toEqual(["A2", "D1", "D2", "D3"]);
    }
  });

  it("documents current behaviour pending the owner's decision: A1 fires for two GSTINs on one PAN sharing a bank account", () => {
    const vendors = multiStateVendors().map((v) => ({ ...v, bank_account: "92782703481" }));
    const snapshots = vendors.map((v) => snap(v.id, "2026-03-01"));
    const results = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots, transactions: [], edges: edgesFromVendors(vendors) });
    expect(resultFor(results, "V001").findings.map((f) => f.rule_id)).toEqual(["A1", "A2"]);
  });

  it("point in time: a vendor registered after as_of is unknown and is not a peer to anyone", () => {
    const vendors = ringVendors(); // V031 registered 2025-02-15
    const snapshots = vendors.map((v) => snap(v.id, "2025-02-01"));
    const results = evaluateRisk({ as_of: "2025-02-14", vendors, snapshots, transactions: [], edges: edgesFromVendors(vendors) });
    expect(resultFor(results, "V031").band).toBe("unknown");
    const meridian = resultFor(results, "V030");
    expect(meridian.findings.find((f) => f.rule_id === "A1")?.message).toBe(
      "Shares bank account XXXX4471 with Orbit Metal Corporation — two entities, one account.",
    );
  });

  it("6: every message is a sentence, and copy never says safe or fraud", () => {
    const vendors = [...ringVendors(), ...multiStateVendors()];
    const snapshots = vendors.flatMap((v) => [
      snap(v.id, "2025-03-01"), snap(v.id, "2026-03-01", "Active", false), snap(v.id, "2026-04-01", "Active", false),
      snap(v.id, "2026-05-01", "Suspended", false), snap(v.id, "2026-07-01", "Cancelled", false, "2025-04-01"),
    ]);
    const transactions = vendors.flatMap((v) => [tx(v.id, "2025-05-09", 500000, "Cash", null), tx(v.id, "2025-06-01", 250000)]);
    const results = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots, transactions, edges: edgesFromVendors(vendors) });
    const messages = results.flatMap((r) => r.findings.map((f) => f.message));
    expect(messages.length).toBeGreaterThan(20);
    for (const message of messages) {
      expect(message.endsWith(".")).toBe(true);
      expect(message.toLowerCase()).not.toMatch(/(^|[^a-z])(safe|fraud)([^a-z]|$)/);
    }
  });

  it("8: evaluation is deterministic across runs and input order", () => {
    const vendors = [...ringVendors(), ...multiStateVendors()];
    const snapshots = vendors.map((v) => snap(v.id, "2026-03-01"));
    const edges = edgesFromVendors(vendors);
    const a = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots, transactions: [], edges });
    const b = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots: [...snapshots].reverse(), transactions: [], edges: [...edges].reverse() });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
