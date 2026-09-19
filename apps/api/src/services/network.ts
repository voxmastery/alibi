import { listNames } from "@alibi/core";
import type { Band, EdgeAttribute, NetworkConnection, NetworkEdge, NetworkGraph, NetworkNode, NetworkSignal, VendorRef } from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import type { VendorRecord } from "../store/types.js";
import { evaluateOrg } from "./risk.js";
import { maskAccount } from "./format.js";

/** The order attributes are named in, strongest shared identity first. */
const SIGNAL_ORDER: EdgeAttribute[] = ["bank_account", "address", "filing_ip", "phone", "email", "pan"];

/** pan is left out: a shared PAN is a sentence about one taxpayer, not a connection between two. */
const CONNECTION_ORDER: EdgeAttribute[] = ["bank_account", "address", "filing_ip", "phone", "email"];

const MAX_CONNECTIONS = 12;

const ref = (vendor: VendorRecord): VendorRef => ({ id: vendor.id, legal_name: vendor.legal_name, gstin: vendor.gstin });

const existsOn = (vendor: VendorRecord, asOf: string): boolean => (vendor.registered_on ?? "1900-01-01") <= asOf;

function sentenceFor(attribute: EdgeAttribute, value: string, names: string[]): string {
  const list = listNames(names);
  switch (attribute) {
    case "bank_account":
      return `Shares bank account ${maskAccount(value)} with ${list}.`;
    case "address":
      return `Registered at the same address as ${list}.`;
    case "filing_ip":
      return `Returns filed from the same IP address as ${list}.`;
    case "phone":
      return `Contact number shared with ${list}.`;
    case "email":
      return `Email address shared with ${list}.`;
    case "pan":
      return `Holds a GSTIN under the same PAN as ${list}. Normal for multi-state operations.`;
  }
}

/**
 * The shared-attribute sentences for one vendor. Only peers that already existed on as_of
 * are named, so a screen dated before a vendor's registration never mentions it.
 */
export function networkSignalsFor(store: MemoryStore, vendorId: string, asOf: string): NetworkSignal[] {
  const subject = store.vendor(vendorId);
  if (!subject) return [];
  const byAttribute = new Map<EdgeAttribute, { value: string; peers: VendorRecord[] }>();
  for (const edge of store.edges()) {
    if (edge.from_vendor !== vendorId && edge.to_vendor !== vendorId) continue;
    const peerId = edge.from_vendor === vendorId ? edge.to_vendor : edge.from_vendor;
    const peer = store.vendor(peerId);
    if (!peer || !existsOn(peer, asOf)) continue;
    const group = byAttribute.get(edge.attribute) ?? { value: edge.value, peers: [] };
    group.peers.push(peer);
    byAttribute.set(edge.attribute, group);
  }
  const signals: NetworkSignal[] = [];
  for (const attribute of SIGNAL_ORDER) {
    const group = byAttribute.get(attribute);
    if (!group || group.peers.length === 0) continue;
    const peers = [...group.peers].sort((a, b) => a.legal_name.localeCompare(b.legal_name));
    signals.push({
      attribute,
      sentence: sentenceFor(attribute, group.value, peers.map((p) => p.legal_name)),
      vendors: peers.map(ref),
    });
  }
  return signals;
}

function connectionSentence(attribute: EdgeAttribute, first: string, second: string): string {
  const pair = `${first} and ${second}`;
  switch (attribute) {
    case "bank_account":
      return `${pair} share a bank account.`;
    case "address":
      return `${pair} are registered at the same address.`;
    case "filing_ip":
      return `${pair} file returns from the same IP address.`;
    case "phone":
      return `${pair} share a contact number.`;
    case "email":
      return `${pair} share an email address.`;
    case "pan":
      return `${pair} hold GSTINs under the same PAN.`;
  }
}

function monthRange(from: string, to: string): string[] {
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let i = index(from); i <= index(to); i++) {
    months.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

/** Connected components over the edges that count on as_of. Pairs and larger get a number; loners get 0. */
function communities(vendors: VendorRecord[], edges: Array<{ from: string; to: string }>): Map<string, number> {
  const parent = new Map<string, string>(vendors.map((v) => [v.id, v.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let walk = id;
    while (parent.get(walk) !== walk) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  for (const edge of edges) {
    if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
    const left = find(edge.from);
    const right = find(edge.to);
    if (left !== right) parent.set(left, right);
  }
  const members = new Map<string, VendorRecord[]>();
  for (const vendor of vendors) {
    const root = find(vendor.id);
    const list = members.get(root) ?? [];
    list.push(vendor);
    members.set(root, list);
  }
  const groups = [...members.values()].filter((group) => group.length > 1);
  groups.sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    const nameA = [...a].map((v) => v.legal_name).sort()[0]!;
    const nameB = [...b].map((v) => v.legal_name).sort()[0]!;
    return nameA.localeCompare(nameB);
  });
  const numbers = new Map<string, number>(vendors.map((v) => [v.id, 0]));
  groups.forEach((group, i) => {
    for (const vendor of group) numbers.set(vendor.id, i + 1);
  });
  return numbers;
}

/** The whole register as a graph, evaluated once for as_of. */
export function networkGraph(store: MemoryStore, asOf: string): NetworkGraph {
  const vendors = store.vendors();
  const results = evaluateOrg(store, asOf);
  const exists = new Map(vendors.map((v) => [v.id, existsOn(v, asOf)]));

  const captureMonths: string[] = [];
  for (const vendor of vendors) {
    for (const snapshot of store.snapshots(vendor.id)) captureMonths.push(snapshot.captured_at.slice(0, 7));
  }
  captureMonths.sort();
  const asOfMonth = asOf.slice(0, 7);
  const firstMonth = captureMonths[0] ?? asOfMonth;
  const lastCapture = captureMonths[captureMonths.length - 1] ?? asOfMonth;
  const lastMonth = asOfMonth > lastCapture ? asOfMonth : lastCapture;
  const months = monthRange(firstMonth, lastMonth > firstMonth ? lastMonth : firstMonth);

  const liveEdges = store.edges().filter((e) => exists.get(e.from_vendor) === true && exists.get(e.to_vendor) === true);
  const community = communities(
    vendors.filter((v) => exists.get(v.id) === true),
    liveEdges.map((e) => ({ from: e.from_vendor, to: e.to_vendor })),
  );

  const valueByVendor = new Map<string, number>();
  for (const transaction of store.allTransactions()) {
    if (transaction.date > asOf) continue;
    valueByVendor.set(transaction.vendor_id, (valueByVendor.get(transaction.vendor_id) ?? 0) + transaction.amount);
  }

  const nodes: NetworkNode[] = vendors.map((vendor) => {
    const present = exists.get(vendor.id) === true;
    const result = results.get(vendor.id);
    const band: Band = present ? (result?.band ?? "unknown") : "unknown";
    return {
      id: vendor.id,
      legal_name: vendor.legal_name,
      gstin: vendor.gstin,
      band,
      score: present ? (result?.score ?? null) : null,
      value: valueByVendor.get(vendor.id) ?? 0,
      community: present ? (community.get(vendor.id) ?? 0) : 0,
      source: vendor.source,
      exists: present,
    };
  });

  const edges: NetworkEdge[] = liveEdges.map((e) => ({ source: e.from_vendor, target: e.to_vendor, attribute: e.attribute }));

  const connections: NetworkConnection[] = [];
  for (const attribute of CONNECTION_ORDER) {
    const forAttribute: NetworkConnection[] = [];
    for (const edge of liveEdges) {
      if (edge.attribute !== attribute) continue;
      const left = store.vendor(edge.from_vendor);
      const right = store.vendor(edge.to_vendor);
      if (!left || !right) continue;
      const [first, second] = left.legal_name.localeCompare(right.legal_name) <= 0 ? [left, right] : [right, left];
      forAttribute.push({
        sentence: connectionSentence(attribute, first.legal_name, second.legal_name),
        vendor_ids: [first.id, second.id],
        attribute,
      });
    }
    forAttribute.sort((a, b) => a.sentence.localeCompare(b.sentence));
    connections.push(...forAttribute);
  }

  return { as_of: asOf, months, nodes, edges, connections: connections.slice(0, MAX_CONNECTIONS) };
}
