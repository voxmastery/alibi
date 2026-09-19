import { describe, expect, it } from "vitest";
import { buildNetworkIndex, type VendorInput } from "@alibi/core";
import { edgesFromVendors, multiStateVendors, ringVendors, softPairVendors, vendor } from "./helpers.js";

function byId(vendors: VendorInput[]): Map<string, VendorInput> {
  return new Map(vendors.map((v) => [v.id, v]));
}

describe("buildNetworkIndex", () => {
  it("records peers per attribute in both directions", () => {
    const vendors = ringVendors();
    const index = buildNetworkIndex(edgesFromVendors(vendors), byId(vendors), "2026-09-01");
    expect([...index.peers.get("V030")!.get("bank_account")!].sort()).toEqual(["V031", "V032"]);
    expect([...index.peers.get("V032")!.get("phone")!].sort()).toEqual(["V030", "V031"]);
    expect(index.peers.get("V030")!.get("email")).toBeUndefined();
  });

  it("finds a cluster when three vendors are mutually linked by two or more attribute types", () => {
    const vendors = ringVendors();
    const index = buildNetworkIndex(edgesFromVendors(vendors), byId(vendors), "2026-09-01");
    const cluster = index.clusterOf.get("V031");
    expect(cluster).toBeDefined();
    expect([...cluster!.members].sort()).toEqual(["V030", "V031", "V032"]);
    expect([...cluster!.attributes].sort()).toEqual(["address", "bank_account", "filing_ip", "phone"]);
    expect(index.clusterOf.get("V030")).toBe(cluster);
  });

  it("does not call a pair a cluster, however many attributes they share", () => {
    const vendors = softPairVendors();
    const index = buildNetworkIndex(edgesFromVendors(vendors), byId(vendors), "2026-09-01");
    expect(index.clusterOf.size).toBe(0);
    expect(index.peers.get("V033")!.get("email")).toEqual(new Set(["V034"]));
  });

  it("does not call three vendors a cluster when each pair shares only one attribute", () => {
    const vendors = [
      vendor({ id: "A", legal_name: "A", bank_account: "1", phone: "p1" }),
      vendor({ id: "B", legal_name: "B", bank_account: "1", phone: "p2", email: "e1" }),
      vendor({ id: "C", legal_name: "C", phone: "p2", email: "e1" }),
    ];
    // A-B share bank only; B-C share phone and email (dense); A-C share nothing.
    const index = buildNetworkIndex(edgesFromVendors(vendors), byId(vendors), "2026-09-01");
    expect(index.clusterOf.size).toBe(0);
  });

  it("ignores edges to vendors not yet registered on as_of", () => {
    const vendors = ringVendors(); // V032 registered 2025-01-30, V030 2025-02-12, V031 2025-02-15
    const index = buildNetworkIndex(edgesFromVendors(vendors), byId(vendors), "2025-02-13");
    expect(index.peers.get("V030")!.get("bank_account")).toEqual(new Set(["V032"]));
    expect(index.clusterOf.size).toBe(0);
  });

  it("ignores edges that mention unknown vendors or self-loops", () => {
    const vendors = multiStateVendors();
    const edges = [
      { from_vendor: "V001", to_vendor: "GHOST", attribute: "bank_account" as const, value: "x" },
      { from_vendor: "V001", to_vendor: "V001", attribute: "phone" as const, value: "y" },
      ...edgesFromVendors(vendors),
    ];
    const index = buildNetworkIndex(edges, byId(vendors), "2026-09-01");
    expect(index.peers.get("V001")!.get("bank_account")).toBeUndefined();
    expect(index.peers.get("V001")!.get("phone")).toBeUndefined();
    expect(index.peers.get("V001")!.get("pan")).toEqual(new Set(["V029"]));
  });
});
