import { describe, expect, it } from "vitest";
import { evaluateRisk, orderFindings, scoreAndBand, type Finding } from "@alibi/core";
import { edgesFromVendors, findingsOf, resultFor, ringVendors, snap, tx } from "./helpers.js";

const f = (rule_id: string, weight: number, severity: Finding["severity"] = "high"): Finding =>
  ({ rule_id, weight, severity, message: `${rule_id}.`, as_of: "2026-09-01" });

describe("scoreAndBand", () => {
  it("caps at 100 and bands at 25 and 55", () => {
    expect(scoreAndBand([f("A1", 45), f("B1", 50), f("B3", 35)])).toEqual({ score: 100, band: "flagged" });
    expect(scoreAndBand([f("C3", 10), f("B5", 15)])).toEqual({ score: 25, band: "watch" });
    expect(scoreAndBand([f("C3", 10), f("A4-phone", 20)])).toEqual({ score: 30, band: "watch" });
    expect(scoreAndBand([f("A2", 5), f("D1", 0, "positive")])).toEqual({ score: 5, band: "clear" });
    expect(scoreAndBand([f("A3", 30), f("A5", 25)])).toEqual({ score: 55, band: "flagged" });
    expect(scoreAndBand([f("A3", 30), f("B4", 15), f("C3", 10)])).toEqual({ score: 55, band: "flagged" });
    expect(scoreAndBand([f("A3", 30), f("B5", 15), f("C3", 9)])).toEqual({ score: 54, band: "watch" });
    expect(scoreAndBand([])).toEqual({ score: 0, band: "clear" });
  });
});

describe("orderFindings", () => {
  it("orders by weight descending with A1 ahead of A6 and positives last", () => {
    const ordered = orderFindings([f("D1", 0, "positive"), f("A6", 25), f("C1", 25), f("A1", 45), f("B1", 50)]);
    expect(ordered.map((x) => x.rule_id)).toEqual(["B1", "A1", "A6", "C1", "D1"]);
  });

  it("does not mutate its input", () => {
    const input = [f("A6", 25), f("A1", 45)];
    orderFindings(input);
    expect(input.map((x) => x.rule_id)).toEqual(["A6", "A1"]);
  });
});

describe("evaluateRisk", () => {
  it("reproduces the reference ring at 2026-09-01: score 100, flagged, rules in order", () => {
    const vendors = ringVendors();
    const snapshots = vendors.flatMap((v) => [
      snap(v.id, "2025-03-01"), snap(v.id, "2025-09-01"), snap(v.id, "2026-03-01", "Active", false),
      snap(v.id, "2026-04-01", "Active", false), snap(v.id, "2026-05-01", "Suspended", false),
      snap(v.id, "2026-07-01", "Cancelled", false, "2025-04-01"),
    ]);
    const transactions = vendors.flatMap((v) => [tx(v.id, "2025-05-09", 500000, "NEFT", null), tx(v.id, "2025-06-21", 250000, "Cash")]);
    const results = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots, transactions, edges: edgesFromVendors(vendors) });
    const meridian = resultFor(results, "V030");
    expect(meridian.band).toBe("flagged");
    expect(meridian.score).toBe(100);
    expect(meridian.findings.map((x) => x.rule_id)).toEqual([
      "B1", "A1", "B3", "A3", "B2", "A5", "A6", "C1", "A4-phone", "C2", "B5", "C3", "D1", "D2",
    ]);
    expect(findingsOf(meridian, "B1")[0]!.message).toBe(
      "Registration cancelled with retrospective effect from 2025-04-01. two transactions worth ₹7,50,000 fall inside the cancelled period. ITC of ₹1,14,407 is exposed.",
    );
    expect(meridian.as_of).toBe("2026-09-01");
  });

  it("evaluates the same ring as of 2025-03-15: network structure only, before any history", () => {
    const vendors = ringVendors();
    const snapshots = vendors.flatMap((v) => [snap(v.id, "2025-03-01"), snap(v.id, "2026-07-01", "Cancelled", false, "2025-04-01")]);
    const transactions = vendors.map((v) => tx(v.id, "2025-05-09", 500000, "Cash"));
    const results = evaluateRisk({ as_of: "2025-03-15", vendors, snapshots, transactions, edges: edgesFromVendors(vendors) });
    const meridian = resultFor(results, "V030");
    expect(meridian.findings.map((x) => x.rule_id)).toEqual(["A1", "A3", "A5", "A6", "A4-phone", "B5"]);
    expect(meridian.score).toBe(100);
    expect(meridian.findings.every((x) => x.as_of === "2025-03-15")).toBe(true);
  });

  it("rejects an as_of that is not YYYY-MM-DD", () => {
    expect(() => evaluateRisk({ as_of: "2025-3-1", vendors: [], snapshots: [], transactions: [], edges: [] })).toThrow(TypeError);
    expect(() => evaluateRisk({ as_of: "2025-03", vendors: [], snapshots: [], transactions: [], edges: [] })).toThrow(TypeError);
  });

  it("returns one result per input vendor, in input order", () => {
    const vendors = ringVendors();
    const results = evaluateRisk({ as_of: "2026-09-01", vendors, snapshots: [], transactions: [], edges: [] });
    expect(results.map((r) => r.vendor_id)).toEqual(["V030", "V031", "V032"]);
  });
});
