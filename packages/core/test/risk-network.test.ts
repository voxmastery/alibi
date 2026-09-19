import { describe, expect, it } from "vitest";
import { buildNetworkIndex, networkFindings, type VendorInput } from "@alibi/core";
import { edgesFromVendors, multiStateVendors, ringVendors, softPairVendors, vendor } from "./helpers.js";

function run(vendors: VendorInput[], vendorId: string, asOf = "2026-09-01", extraEdges = edgesFromVendors(vendors)) {
  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const index = buildNetworkIndex(extraEdges, vendorById, asOf);
  return networkFindings(vendorById.get(vendorId)!, index, vendorById, asOf);
}

const messages = (findings: { rule_id: string; message: string }[]) =>
  Object.fromEntries(findings.map((f) => [f.rule_id, f.message]));

describe("network rules", () => {
  it("A1, A3, A4-phone, A5 and A6 on the ring, with the exact sentences", () => {
    const findings = run(ringVendors(), "V030");
    expect(messages(findings)).toEqual({
      A1: "Shares bank account XXXX4471 with Kavach Supplies Co and Orbit Metal Corporation — three entities, one account.",
      A3: "Registered at the same address as Kavach Supplies Co and Orbit Metal Corporation. No shared PAN or group structure on record.",
      "A4-phone": "Contact number shared with Kavach Supplies Co and Orbit Metal Corporation.",
      A5: "Returns filed from the same IP address as Kavach Supplies Co and Orbit Metal Corporation.",
      A6: "Part of a three-entity cluster linked by bank account, registered address, contact number, and filing IP. This structure matches known circular-trading patterns.",
    });
    const weights = Object.fromEntries(findings.map((f) => [f.rule_id, [f.severity, f.weight]]));
    expect(weights).toEqual({
      A1: ["high", 45],
      A3: ["high", 30],
      "A4-phone": ["medium", 20],
      A5: ["high", 25],
      A6: ["high", 25],
    });
    expect(findings.every((f) => f.as_of === "2026-09-01")).toBe(true);
  });

  it("A2 at weight 5 for the multi-state pair, and nothing else", () => {
    const findings = run(multiStateVendors(), "V001");
    expect(findings).toEqual([
      {
        rule_id: "A2",
        severity: "info",
        weight: 5,
        message: "Holds two GSTINs under one PAN across Karnataka and Maharashtra. Normal for multi-state operations.",
        as_of: "2026-09-01",
      },
    ]);
  });

  it("A2 does not fire for two GSTINs on one PAN in the same state", () => {
    const vendors = multiStateVendors().map((v) => ({ ...v, state: "Karnataka" }));
    expect(run(vendors, "V001")).toEqual([]);
  });

  it("A3 and A4-email on the soft pair", () => {
    expect(messages(run(softPairVendors(), "V034"))).toEqual({
      A3: "Registered at the same address as Zenith Commodities. No shared PAN or group structure on record.",
      "A4-email": "Email address shared with Zenith Commodities.",
    });
  });

  it("A3 is suppressed between vendors sharing a PAN even if an address edge slipped through", () => {
    const vendors = multiStateVendors().map((v) => ({ ...v, address: "Same Address" }));
    const edges = [
      ...edgesFromVendors(vendors),
      { from_vendor: "V001", to_vendor: "V029", attribute: "address" as const, value: "Same Address" },
    ];
    const findings = run(vendors, "V001", "2026-09-01", edges);
    expect(findings.map((f) => f.rule_id)).toEqual(["A2"]);
  });

  it("names only the peers that existed on as_of", () => {
    const findings = run(ringVendors(), "V030", "2025-02-13");
    expect(messages(findings)).toEqual({
      A1: "Shares bank account XXXX4471 with Orbit Metal Corporation — two entities, one account.",
      A3: "Registered at the same address as Orbit Metal Corporation. No shared PAN or group structure on record.",
      "A4-phone": "Contact number shared with Orbit Metal Corporation.",
      A5: "Returns filed from the same IP address as Orbit Metal Corporation.",
    });
  });

  it("A6 needs three members; a dense pair is not a cluster", () => {
    const vendors = [
      vendor({ id: "P", legal_name: "P", bank_account: "9", phone: "9" }),
      vendor({ id: "Q", legal_name: "Q", bank_account: "9", phone: "9" }),
    ];
    expect(run(vendors, "P").map((f) => f.rule_id).sort()).toEqual(["A1", "A4-phone"]);
  });

  it("returns nothing for a vendor with no edges", () => {
    expect(run([vendor({ id: "X", legal_name: "X" })], "X")).toEqual([]);
  });
});
