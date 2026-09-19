import { describe, expect, it } from "vitest";
import { protectiveFindings, transactionFindings, type Observation } from "@alibi/core";
import { tx } from "./helpers.js";

const obs = (captured_at: string, status = "Active", returns_current: boolean | null = true): Observation =>
  ({ captured_at, status, returns_current, retrospective_from: null });
const message = (findings: { rule_id: string; message: string }[], id: string) => findings.find((f) => f.rule_id === id)?.message;
const ids = (findings: { rule_id: string }[]) => findings.map((f) => f.rule_id);

describe("transaction rules", () => {
  it("C1 totals cash payments", () => {
    const findings = transactionFindings([tx("V", "2026-01-01", 1000000, "Cash"), tx("V", "2026-02-01", 500000, "cash"), tx("V", "2026-03-01", 300000)], "2026-09-01");
    expect(message(findings, "C1")).toBe("₹15,00,000 paid in cash. Payment through banking channels is what protects an ITC claim.");
    const c1 = findings.find((f) => f.rule_id === "C1")!;
    expect([c1.severity, c1.weight]).toEqual(["high", 25]);
  });

  it("C2 counts consignments strictly above fifty thousand with no e-way bill", () => {
    const findings = transactionFindings([tx("V", "2026-01-01", 50000, "NEFT", null), tx("V", "2026-02-01", 50001, "NEFT", null), tx("V", "2026-03-01", 900000, "NEFT", ""), tx("V", "2026-04-01", 900000)], "2026-09-01");
    expect(message(findings, "C2")).toBe("No e-way bill recorded for two consignments above ₹50,000. Movement of goods cannot be evidenced.");
  });

  it("C3 fires above eighty percent round figures, not at eighty", () => {
    const round = (n: number) => tx("V", "2026-01-01", 10000 * (n + 1));
    const odd = tx("V", "2026-01-01", 12345);
    expect(message(transactionFindings([round(1), round(2), round(3), round(4), round(5)], "2026-09-01"), "C3")).toBe("100% of invoices are round figures.");
    expect(ids(transactionFindings([round(1), round(2), round(3), round(4), odd], "2026-09-01"))).not.toContain("C3");
    expect(ids(transactionFindings([], "2026-09-01"))).toEqual([]);
  });

  it("D1, D2 and D3 describe a clean record", () => {
    const observations = [obs("2026-01-01"), obs("2026-02-01"), obs("2026-03-01")];
    const transactions = [tx("V", "2026-01-15", 100000), tx("V", "2026-02-15", 100000)];
    const findings = protectiveFindings(observations, transactions, "2026-09-01");
    expect(findings.map((f) => [f.rule_id, f.severity, f.weight, f.message])).toEqual([
      ["D1", "positive", 0, "Active on the public register on every transaction date. three snapshots on file."],
      ["D2", "positive", 0, "Returns current at the time of every transaction."],
      ["D3", "positive", 0, "All payments through banking channels."],
    ]);
  });

  it("D1 does not fire when a transaction predates the first observation, or when a snapshot on a date was not active", () => {
    const observations = [obs("2026-02-01"), obs("2026-03-01", "Suspended", false)];
    expect(ids(protectiveFindings(observations, [tx("V", "2026-01-15", 1)], "2026-09-01"))).not.toContain("D1");
    expect(ids(protectiveFindings(observations, [tx("V", "2026-03-15", 1)], "2026-09-01"))).not.toContain("D1");
    expect(ids(protectiveFindings(observations, [tx("V", "2026-02-15", 1)], "2026-09-01"))).toContain("D1");
  });

  it("D2 needs returns_current true on every transaction date; D3 needs no cash", () => {
    const observations = [obs("2026-01-01", "Active", null)];
    const findings = protectiveFindings(observations, [tx("V", "2026-01-15", 1, "Cash")], "2026-09-01");
    expect(ids(findings)).toEqual(["D1"]);
  });

  it("protective findings need at least one transaction", () => {
    expect(protectiveFindings([obs("2026-01-01")], [], "2026-09-01")).toEqual([]);
  });
});
