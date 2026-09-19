import type { EdgeAttribute, EdgeInput, Finding, Severity, VendorInput } from "./types.js";
import { ATTRIBUTE_LABELS, ATTRIBUTE_ORDER, countLabel, listNames } from "./text.js";

export interface Cluster {
  members: Set<string>;
  attributes: Set<EdgeAttribute>;
}

export interface NetworkIndex {
  /** vendor id -> attribute -> ids of vendors sharing that attribute value */
  peers: Map<string, Map<EdgeAttribute, Set<string>>>;
  /** vendor id -> the dense cluster it belongs to (three or more members, two or more attribute types) */
  clusterOf: Map<string, Cluster>;
}

interface Pair {
  left: string;
  right: string;
  attributes: Set<EdgeAttribute>;
}

/**
 * One pass over the edge list. Edges are only counted when both vendors existed on as_of.
 * Everything the network rules need is looked up from this index; no rule scans edges.
 */
export function buildNetworkIndex(
  edges: EdgeInput[],
  vendorById: Map<string, VendorInput>,
  asOf: string,
): NetworkIndex {
  const active: EdgeInput[] = [];
  for (const edge of edges) {
    if (edge.from_vendor === edge.to_vendor) continue;
    const from = vendorById.get(edge.from_vendor);
    const to = vendorById.get(edge.to_vendor);
    if (!from || !to) continue;
    if (from.registered_on > asOf || to.registered_on > asOf) continue;
    active.push(edge);
  }

  const peers = new Map<string, Map<EdgeAttribute, Set<string>>>();
  const addPeer = (vendor: string, attribute: EdgeAttribute, peer: string) => {
    let byAttribute = peers.get(vendor);
    if (!byAttribute) {
      byAttribute = new Map();
      peers.set(vendor, byAttribute);
    }
    let set = byAttribute.get(attribute);
    if (!set) {
      set = new Set();
      byAttribute.set(attribute, set);
    }
    set.add(peer);
  };

  const pairs = new Map<string, Pair>();
  for (const edge of active) {
    addPeer(edge.from_vendor, edge.attribute, edge.to_vendor);
    addPeer(edge.to_vendor, edge.attribute, edge.from_vendor);
    const [left, right] = edge.from_vendor < edge.to_vendor
      ? [edge.from_vendor, edge.to_vendor]
      : [edge.to_vendor, edge.from_vendor];
    const key = `${left} | ${right}`;
    let pair = pairs.get(key);
    if (!pair) {
      pair = { left, right, attributes: new Set() };
      pairs.set(key, pair);
    }
    pair.attributes.add(edge.attribute);
  }

  // Dense adjacency: pairs linked by two or more distinct attribute types.
  const adjacency = new Map<string, Set<string>>();
  for (const pair of pairs.values()) {
    if (pair.attributes.size < 2) continue;
    if (!adjacency.has(pair.left)) adjacency.set(pair.left, new Set());
    if (!adjacency.has(pair.right)) adjacency.set(pair.right, new Set());
    adjacency.get(pair.left)!.add(pair.right);
    adjacency.get(pair.right)!.add(pair.left);
  }

  // Connected components over the dense adjacency, once for the whole evaluation.
  const componentOf = new Map<string, Cluster>();
  const seen = new Set<string>();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const members = new Set<string>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const peer of adjacency.get(current) ?? []) {
        if (members.has(peer)) continue;
        members.add(peer);
        seen.add(peer);
        queue.push(peer);
      }
    }
    if (members.size < 3) continue;
    const cluster: Cluster = { members, attributes: new Set() };
    for (const member of members) componentOf.set(member, cluster);
  }
  for (const edge of active) {
    const cluster = componentOf.get(edge.from_vendor);
    if (cluster && cluster.members.has(edge.to_vendor)) cluster.attributes.add(edge.attribute);
  }

  const clusterOf = new Map<string, Cluster>();
  for (const [member, cluster] of componentOf) {
    if (cluster.attributes.size >= 2) clusterOf.set(member, cluster);
  }
  return { peers, clusterOf };
}

/** Rules A1–A6. Weights, severities and sentences are copied from docs/reference/risk.js. */
export function networkFindings(
  vendor: VendorInput,
  index: NetworkIndex,
  vendorById: Map<string, VendorInput>,
  asOf: string,
): Finding[] {
  const findings: Finding[] = [];
  const add = (rule_id: string, severity: Severity, weight: number, message: string) => {
    findings.push({ rule_id, severity, weight, message, as_of: asOf });
  };
  const peersFor = (attribute: EdgeAttribute): VendorInput[] => {
    const ids = index.peers.get(vendor.id)?.get(attribute);
    if (!ids) return [];
    const peers: VendorInput[] = [];
    for (const id of [...ids].sort()) {
      const peer = vendorById.get(id);
      if (peer) peers.push(peer);
    }
    return peers;
  };
  const names = (peers: VendorInput[]) => listNames(peers.map((p) => p.legal_name));

  const bankPeers = peersFor("bank_account");
  if (bankPeers.length > 0) {
    add(
      "A1",
      "high",
      45,
      `Shares bank account XXXX${String(vendor.bank_account ?? "").slice(-4)} with ${names(bankPeers)} — ${countLabel(bankPeers.length + 1)} entities, one account.`,
    );
  }

  const panPeers = peersFor("pan");
  const panStates = [...new Set([vendor, ...panPeers].map((v) => v.state))];
  if (panPeers.length > 0 && panStates.length > 1) {
    add(
      "A2",
      "info",
      5,
      `Holds ${countLabel(panPeers.length + 1)} GSTINs under one PAN across ${listNames(panStates)}. Normal for multi-state operations.`,
    );
  }

  const addressPeers = peersFor("address").filter((p) => !(vendor.pan && p.pan && vendor.pan === p.pan));
  if (addressPeers.length > 0) {
    add(
      "A3",
      "high",
      30,
      `Registered at the same address as ${names(addressPeers)}. No shared PAN or group structure on record.`,
    );
  }

  const phonePeers = peersFor("phone");
  if (phonePeers.length > 0) {
    add("A4-phone", "medium", 20, `Contact number shared with ${names(phonePeers)}.`);
  }

  const emailPeers = peersFor("email");
  if (emailPeers.length > 0) {
    add("A4-email", "medium", 20, `Email address shared with ${names(emailPeers)}.`);
  }

  const ipPeers = peersFor("filing_ip");
  if (ipPeers.length > 0) {
    add("A5", "high", 25, `Returns filed from the same IP address as ${names(ipPeers)}.`);
  }

  const cluster = index.clusterOf.get(vendor.id);
  if (cluster) {
    const labels = ATTRIBUTE_ORDER.filter((a) => cluster.attributes.has(a)).map((a) => ATTRIBUTE_LABELS[a]);
    add(
      "A6",
      "high",
      25,
      `Part of a ${countLabel(cluster.members.size)}-entity cluster linked by ${listNames(labels)}. This structure matches known circular-trading patterns.`,
    );
  }

  return findings;
}
