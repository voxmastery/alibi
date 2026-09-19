import { describe, expect, it } from "vitest";
import { historyFindings, type Observation } from "@alibi/core";
import { tx, vendor } from "./helpers.js";

const obs = (captured_at: string, status = "Active", returns_current: boolean | null = true, retrospective_from: string | null = null): Observation =>
  ({ captured_at, status, returns_current, retrospective_from });

const months = (from: string, count: number, status = "Active", returnsCurrent = true) =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    return obs(d.toISOString().slice(0, 10), status, returnsCurrent);
  });

const meridian = vendor({ id: "V030", legal_name: "Meridian Traders", registered_on: "2025-02-12", aadhaar_authenticated: false });
const ids = (findings: { rule_id: string }[]) => findings.map((f) => f.rule_id);
const message = (findings: { rule_id: string; message: string }[], id: string) => findings.find((f) => f.rule_id === id)?.message;

describe("history rules", () => {
  it("B1 names the retrospective date, the transactions inside the cancelled period, and the exposed ITC", () => {
    const observations = [
      ...months("2025-03-01", 16),
      obs("2026-07-01", "Cancelled", false, "2025-04-01"),
    ];
    const transactions = [
      tx("V030", "2025-03-15", 999999),        // before the retrospective date: not exposed
      tx("V030", "2025-05-09", 500000),
      tx("V030", "2025-06-21", 250000),
      tx("V030", "2026-07-15", 100000),        // after the cancellation was captured: not exposed
    ];
    const findings = historyFindings(meridian, observations, transactions, "2026-09-01");
    expect(message(findings, "B1")).toBe(
      "Registration cancelled with retrospective effect from 2025-04-01. two transactions worth ₹7,50,000 fall inside the cancelled period. ITC of ₹1,14,407 is exposed.",
    );
    const b1 = findings.find((f) => f.rule_id === "B1")!;
    expect([b1.severity, b1.weight, b1.as_of]).toEqual(["critical", 50, "2026-09-01"]);
  });

  it("B1 does not fire when no transaction falls inside the cancelled period", () => {
    const observations = [obs("2026-06-01"), obs("2026-07-01", "Cancelled", false, "2025-04-01")];
    const findings = historyFindings(meridian, observations, [tx("V030", "2026-08-01", 500000)], "2026-09-01");
    expect(ids(findings)).not.toContain("B1");
  });

  it("B2 counts the longest run of active periods with returns not current", () => {
    const observations = [
      ...months("2025-09-01", 4),
      ...months("2026-01-01", 3, "Active", false),
      obs("2026-04-01", "Active", true),
      obs("2026-05-01", "Active", false),
    ];
    const findings = historyFindings(meridian, observations, [], "2026-09-01");
    expect(message(findings, "B2")).toBe(
      "No GSTR-3B filed for three periods to 2026-03-01. A supplier not filing is likely not remitting the tax you paid them.",
    );
  });

  it("B2 ignores a single missed period", () => {
    const observations = [obs("2026-01-01"), obs("2026-02-01", "Active", false), obs("2026-03-01")];
    expect(ids(historyFindings(meridian, observations, [], "2026-09-01"))).not.toContain("B2");
  });

  it("B3 reports the first suspension date", () => {
    const observations = [obs("2026-04-01"), obs("2026-05-01", "Suspended", false), obs("2026-06-01", "Suspended", false)];
    expect(message(historyFindings(meridian, observations, [], "2026-09-01"), "B3")).toBe("Registration suspended on 2026-05-01.");
  });

  it("B4 fires only while the vendor is under six months old on as_of", () => {
    const young = vendor({ id: "N", legal_name: "New Co", registered_on: "2026-05-10" });
    const transactions = [tx("N", "2026-06-01", 600000), tx("N", "2026-07-01", 500000)];
    const observations = [obs("2026-06-01"), obs("2026-07-01")];
    expect(message(historyFindings(young, observations, transactions, "2026-09-01"), "B4")).toBe(
      "Registered four months ago. ₹11,00,000 transacted since — high value against a short history.",
    );
    expect(ids(historyFindings(young, observations, transactions, "2026-12-01"))).not.toContain("B4");
    expect(ids(historyFindings(young, observations, [tx("N", "2026-06-01", 1000000)], "2026-09-01"))).not.toContain("B4");
  });

  it("B5 fires only when Aadhaar authentication is known to be false", () => {
    const observations = [obs("2026-06-01")];
    expect(message(historyFindings(meridian, observations, [], "2026-09-01"), "B5")).toBe("GSTIN not Aadhaar-authenticated.");
    expect(ids(historyFindings({ ...meridian, aadhaar_authenticated: null }, observations, [], "2026-09-01"))).not.toContain("B5");
    expect(ids(historyFindings({ ...meridian, aadhaar_authenticated: true }, observations, [], "2026-09-01"))).not.toContain("B5");
  });

  it("B6 counts status changes in the twelve months before the latest observation", () => {
    const observations = [
      obs("2024-01-01", "Suspended"),
      obs("2024-02-01", "Active"),           // older than twelve months: ignored
      obs("2025-09-01", "Active"),
      obs("2025-11-01", "Suspended"),
      obs("2026-01-01", "Active"),
      obs("2026-04-01", "Suspended"),
      obs("2026-08-01", "Suspended"),
    ];
    expect(message(historyFindings(meridian, observations, [], "2026-09-01"), "B6")).toBe(
      "Registration status changed three times in the last year.",
    );
    expect(ids(historyFindings(meridian, observations.slice(0, 5), [], "2026-09-01"))).not.toContain("B6");
  });
});
