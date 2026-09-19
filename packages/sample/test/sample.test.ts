import { describe, expect, it } from "vitest";
import { isValidGstin } from "@alibi/core";
import { buildSampleDataset } from "@alibi/sample";

const data = buildSampleDataset();

describe("sample register", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(buildSampleDataset())).toBe(JSON.stringify(data));
  });

  it("has 36 vendors, every GSTIN valid and unique, every PAN embedded in its GSTIN", () => {
    expect(data.vendors).toHaveLength(36);
    const gstins = new Set(data.vendors.map((v) => v.gstin));
    expect(gstins.size).toBe(36);
    for (const v of data.vendors) {
      expect(isValidGstin(v.gstin)).toBe(true);
      expect(v.gstin.slice(2, 12)).toBe(v.pan);
      expect(v.gstin.slice(0, 2)).toBe(v.state_code);
    }
  });

  it("covers March 2025 to September 2026 monthly", () => {
    expect(data.months[0]).toBe("2025-03");
    expect(data.months[data.months.length - 1]).toBe("2026-09");
    expect(data.months).toHaveLength(19);
  });

  it("the ring shares bank account, address, phone and filing IP but not email or PAN", () => {
    const ring = data.vendors.filter((v) => ["meridian", "kavach", "orbit"].includes(v.key));
    expect(ring).toHaveLength(3);
    for (const field of ["bank_account", "address", "phone", "filing_ip"] as const) {
      expect(new Set(ring.map((v) => v[field])).size).toBe(1);
    }
    expect(new Set(ring.map((v) => v.email)).size).toBe(3);
    expect(new Set(ring.map((v) => v.pan)).size).toBe(3);
  });

  it("the multi-state pair shares only its PAN", () => {
    const pair = data.vendors.filter((v) => v.key.startsWith("sundaram"));
    expect(pair).toHaveLength(2);
    expect(pair[0]!.pan).toBe(pair[1]!.pan);
    expect(pair[0]!.state).not.toBe(pair[1]!.state);
    for (const field of ["bank_account", "address", "phone", "email", "filing_ip"] as const) {
      expect(pair[0]![field]).not.toBe(pair[1]![field]);
    }
  });

  it("two vendors have never been captured", () => {
    const captured = new Set(data.captures.map((c) => c.vendor_key));
    const never = data.vendors.filter((v) => !captured.has(v.key));
    expect(never.map((v) => v.key).sort()).toEqual(["northline", "vaishnavi"]);
  });

  it("the ring is active with returns current through 2025, stops filing from the March 2026 capture, is suspended in May and cancelled in July with effect from 1 April 2025", () => {
    const meridian = data.captures.filter((c) => c.vendor_key === "meridian").sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    const at = (month: string) => meridian.find((c) => c.captured_at.startsWith(month))!.envelope;
    expect(at("2025-09").taxpayer!["status"]).toBe("Active");
    expect(at("2026-03").taxpayer!["status"]).toBe("Active");
    expect(at("2026-05").taxpayer!["status"]).toBe("Suspended");
    expect(at("2026-07").taxpayer!["status"]).toBe("Cancelled");
    expect(at("2026-07").taxpayer!["cancellation_date"]).toBe("2025-04-01");
    const r3bFeb = (at("2026-03").returns as Array<Record<string, unknown>>).find((r) => r["return_type"] === "GSTR3B" && r["return_period"] === "2026-02");
    expect(r3bFeb?.["filing_status"]).toBe("not_filed");
    const r3bJan = (at("2026-03").returns as Array<Record<string, unknown>>).find((r) => r["return_type"] === "GSTR3B" && r["return_period"] === "2026-01");
    expect(r3bJan?.["filing_status"]).toBe("filed");
  });

  it("every capture carries the provider envelope shape with http_status 200", () => {
    for (const c of data.captures) {
      expect(c.envelope.provider).toBe("sample");
      expect(c.envelope.http_status).toBe(200);
      expect(c.envelope.requested_at).toBe(c.captured_at);
      expect(c.envelope.taxpayer).not.toBeNull();
      expect(Array.isArray(c.envelope.returns)).toBe(true);
    }
  });

  it("transactions reference existing vendors and carry ITC at 18/118 of the amount", () => {
    const keys = new Set(data.vendors.map((v) => v.key));
    expect(data.transactions.length).toBeGreaterThan(150);
    for (const t of data.transactions) {
      expect(keys.has(t.vendor_key)).toBe(true);
      expect(t.itc_claimed).toBe(Math.round((t.amount * 18) / 118));
    }
    const ringCash = data.transactions.filter((t) => ["meridian", "kavach", "orbit"].includes(t.vendor_key) && t.payment_mode === "Cash");
    expect(ringCash.length).toBeGreaterThan(0);
  });
});
