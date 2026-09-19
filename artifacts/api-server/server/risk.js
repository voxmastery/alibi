const NETWORK_ATTRIBUTES = [
  "pan",
  "bank_account",
  "address",
  "phone",
  "email",
  "filing_ip",
];

const ATTRIBUTE_LABELS = {
  pan: "PAN",
  bank_account: "bank account",
  address: "registered address",
  phone: "contact number",
  email: "email address",
  filing_ip: "filing IP",
};

const numberWords = new Map([
  [2, "two"],
  [3, "three"],
  [4, "four"],
  [5, "five"],
  [6, "six"],
  [7, "seven"],
  [8, "eight"],
  [9, "nine"],
  [10, "ten"],
]);

function countLabel(value) {
  return numberWords.get(value) ?? String(value);
}

function listNames(names) {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function monthIndex(date) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return year * 12 + month;
}

function monthsBetween(from, to) {
  return Math.max(0, monthIndex(to) - monthIndex(from));
}

function addMonths(date, amount) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 10);
}

function snapshotOnDate(chain, date) {
  return chain.filter((snapshot) => snapshot.captured_at <= date).at(-1);
}

export function buildEdges(vendors) {
  const edges = [];
  for (let left = 0; left < vendors.length; left += 1) {
    for (let right = left + 1; right < vendors.length; right += 1) {
      const source = vendors[left];
      const target = vendors[right];
      for (const attribute of NETWORK_ATTRIBUTES) {
        const sourceValue = source[attribute];
        if (!sourceValue || sourceValue !== target[attribute]) continue;
        if (attribute === "address" && source.pan === target.pan) continue;
        edges.push({
          source: source.id,
          target: target.id,
          attribute,
          value: sourceValue,
        });
      }
    }
  }
  return edges;
}

function edgePeers(vendorId, attribute, edges, vendorById) {
  const peerIds = new Set();
  for (const edge of edges) {
    if (edge.attribute !== attribute) continue;
    if (edge.source === vendorId) peerIds.add(edge.target);
    if (edge.target === vendorId) peerIds.add(edge.source);
  }
  return [...peerIds].map((id) => vendorById.get(id)).filter(Boolean);
}

function denseClusterFor(vendorId, edges) {
  const qualifyingPairs = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(":");
    if (!qualifyingPairs.has(key)) qualifyingPairs.set(key, new Set());
    qualifyingPairs.get(key).add(edge.attribute);
  }

  const adjacency = new Map();
  for (const [pair, attributes] of qualifyingPairs) {
    if (attributes.size < 2) continue;
    const [left, right] = pair.split(":");
    if (!adjacency.has(left)) adjacency.set(left, new Set());
    if (!adjacency.has(right)) adjacency.set(right, new Set());
    adjacency.get(left).add(right);
    adjacency.get(right).add(left);
  }

  if (!adjacency.has(vendorId)) return null;
  const members = new Set([vendorId]);
  const queue = [vendorId];
  while (queue.length) {
    const current = queue.shift();
    for (const peer of adjacency.get(current) ?? []) {
      if (members.has(peer)) continue;
      members.add(peer);
      queue.push(peer);
    }
  }
  if (members.size < 3) return null;

  const attributes = new Set();
  for (const edge of edges) {
    if (members.has(edge.source) && members.has(edge.target)) {
      attributes.add(edge.attribute);
    }
  }
  return attributes.size >= 2 ? { members, attributes } : null;
}

function evaluateVendor(vendor, context) {
  const {
    asOf,
    edges,
    snapshotsByVendor,
    transactionsByVendor,
    vendorById,
  } = context;
  const chain = (snapshotsByVendor.get(vendor.id) ?? [])
    .filter((snapshot) => snapshot.captured_at.slice(0, 7) <= asOf)
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  if (chain.length === 0) {
    return {
      vendor_id: vendor.id,
      score: null,
      band: "unknown",
      findings: [],
    };
  }

  const findings = [];
  const transactions = (transactionsByVendor.get(vendor.id) ?? [])
    .filter((transaction) => transaction.date.slice(0, 7) <= asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = chain.at(-1);
  const add = (rule_id, severity, weight, message) => {
    findings.push({ rule_id, severity, weight, message });
  };

  const bankPeers = edgePeers(vendor.id, "bank_account", edges, vendorById);
  if (bankPeers.length) {
    add(
      "A1",
      "high",
      45,
      `Shares bank account XXXX${String(vendor.bank_account).slice(-4)} with ${listNames(bankPeers.map((peer) => peer.legal_name))} — ${countLabel(bankPeers.length + 1)} entities, one account.`,
    );
  }

  const panPeers = edgePeers(vendor.id, "pan", edges, vendorById);
  const panStates = [...new Set([vendor, ...panPeers].map((item) => item.state))];
  if (panPeers.length && panStates.length > 1) {
    add(
      "A2",
      "info",
      5,
      `Holds ${countLabel(panPeers.length + 1)} GSTINs under one PAN across ${listNames(panStates)}. Normal for multi-state operations.`,
    );
  }

  const addressPeers = edgePeers(vendor.id, "address", edges, vendorById);
  if (addressPeers.length) {
    add(
      "A3",
      "high",
      30,
      `Registered at the same address as ${listNames(addressPeers.map((peer) => peer.legal_name))}. No shared PAN or group structure on record.`,
    );
  }

  const phonePeers = edgePeers(vendor.id, "phone", edges, vendorById);
  if (phonePeers.length) {
    add(
      "A4-phone",
      "medium",
      20,
      `Contact number shared with ${listNames(phonePeers.map((peer) => peer.legal_name))}.`,
    );
  }

  const emailPeers = edgePeers(vendor.id, "email", edges, vendorById);
  if (emailPeers.length) {
    add(
      "A4-email",
      "medium",
      20,
      `Email address shared with ${listNames(emailPeers.map((peer) => peer.legal_name))}.`,
    );
  }

  const ipPeers = edgePeers(vendor.id, "filing_ip", edges, vendorById);
  if (ipPeers.length) {
    add(
      "A5",
      "high",
      25,
      `Returns filed from the same IP address as ${listNames(ipPeers.map((peer) => peer.legal_name))}.`,
    );
  }

  const cluster = denseClusterFor(vendor.id, edges);
  if (cluster) {
    const labels = [...cluster.attributes].map(
      (attribute) => ATTRIBUTE_LABELS[attribute],
    );
    add(
      "A6",
      "high",
      25,
      `Part of a ${countLabel(cluster.members.size)}-entity cluster linked by ${listNames(labels)}. This structure matches known circular-trading patterns.`,
    );
  }

  const cancellation = chain.find(
    (snapshot) =>
      snapshot.status.toLowerCase() === "cancelled" &&
      snapshot.retrospective_from,
  );
  if (cancellation) {
    const exposed = transactions.filter(
      (transaction) =>
        transaction.date >= cancellation.retrospective_from &&
        transaction.date < cancellation.captured_at,
    );
    if (exposed.length) {
      add(
        "B1",
        "critical",
        50,
        `Registration cancelled with retrospective effect from ${cancellation.retrospective_from}. ${countLabel(exposed.length)} transactions worth ₹${formatMoney(exposed.reduce((sum, item) => sum + Number(item.amount), 0))} fall inside the cancelled period. ITC of ₹${formatMoney(exposed.reduce((sum, item) => sum + Number(item.itc_claimed), 0))} is exposed.`,
      );
    }
  }

  let currentGap = [];
  let longestGap = [];
  for (const snapshot of chain) {
    if (
      snapshot.status.toLowerCase() === "active" &&
      snapshot.returns_current === false
    ) {
      currentGap.push(snapshot);
      if (currentGap.length > longestGap.length) longestGap = [...currentGap];
    } else {
      currentGap = [];
    }
  }
  if (longestGap.length >= 2) {
    add(
      "B2",
      "high",
      30,
      `No GSTR-3B filed for ${countLabel(longestGap.length)} periods to ${longestGap.at(-1).captured_at}. A supplier not filing is likely not remitting the tax you paid them.`,
    );
  }

  const suspension = chain.find(
    (snapshot) => snapshot.status.toLowerCase() === "suspended",
  );
  if (suspension) {
    add(
      "B3",
      "high",
      35,
      `Registration suspended on ${suspension.captured_at}.`,
    );
  }

  const firstSixMonthsEnd = addMonths(vendor.registered_on, 6);
  const earlyTransactions = transactions.filter(
    (transaction) =>
      transaction.date >= vendor.registered_on &&
      transaction.date < firstSixMonthsEnd,
  );
  const earlyAmount = earlyTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  if (earlyAmount > 1_000_000) {
    const newestEarlyDate = earlyTransactions.at(-1)?.date ?? latest.captured_at;
    add(
      "B4",
      "medium",
      15,
      `Registered ${countLabel(monthsBetween(vendor.registered_on, newestEarlyDate))} months ago. ₹${formatMoney(earlyAmount)} transacted since — high value against a short history.`,
    );
  }

  if (String(vendor.aadhaar_authenticated).toLowerCase() !== "true") {
    add("B5", "medium", 15, "GSTIN not Aadhaar-authenticated.");
  }

  const trailingStart = addMonths(latest.captured_at, -12);
  const trailing = chain.filter(
    (snapshot) => snapshot.captured_at >= trailingStart,
  );
  let statusChanges = 0;
  for (let index = 1; index < trailing.length; index += 1) {
    if (trailing[index].status !== trailing[index - 1].status) statusChanges += 1;
  }
  if (statusChanges >= 3) {
    add(
      "B6",
      "medium",
      20,
      `Registration status changed ${countLabel(statusChanges)} times in the last year.`,
    );
  }

  const cashTransactions = transactions.filter(
    (transaction) => transaction.payment_mode.toLowerCase() === "cash",
  );
  if (cashTransactions.length) {
    add(
      "C1",
      "high",
      25,
      `₹${formatMoney(cashTransactions.reduce((sum, item) => sum + Number(item.amount), 0))} paid in cash. Payment through banking channels is what protects an ITC claim.`,
    );
  }

  const missingEway = transactions.filter(
    (transaction) =>
      Number(transaction.amount) > 50_000 && !transaction.eway_bill,
  );
  if (missingEway.length) {
    add(
      "C2",
      "medium",
      20,
      `No e-way bill recorded for ${countLabel(missingEway.length)} consignments above ₹50,000. Movement of goods cannot be evidenced.`,
    );
  }

  if (transactions.length) {
    const roundCount = transactions.filter(
      (transaction) => Number(transaction.amount) % 10_000 === 0,
    ).length;
    const roundPercent = Math.round((roundCount / transactions.length) * 100);
    if (roundPercent > 80) {
      add(
        "C3",
        "low",
        10,
        `${roundPercent}% of invoices are round figures.`,
      );
    }
  }

  const transactionSnapshots = transactions.map((transaction) =>
    snapshotOnDate(chain, transaction.date),
  );
  if (
    transactions.length &&
    transactionSnapshots.every(
      (snapshot) => snapshot?.status.toLowerCase() === "active",
    )
  ) {
    add(
      "D1",
      "positive",
      0,
      `Active on the public register on every transaction date. ${countLabel(chain.length)} snapshots on file.`,
    );
  }
  if (
    transactions.length &&
    transactionSnapshots.every(
      (snapshot) => snapshot?.returns_current === true,
    )
  ) {
    add(
      "D2",
      "positive",
      0,
      "Returns current at the time of every transaction.",
    );
  }
  if (
    transactions.length &&
    transactions.every(
      (transaction) => transaction.payment_mode.toLowerCase() !== "cash",
    )
  ) {
    add("D3", "positive", 0, "All payments through banking channels.");
  }

  findings.sort((left, right) => {
    if (left.rule_id === "A1" && right.rule_id === "A6") return -1;
    if (left.rule_id === "A6" && right.rule_id === "A1") return 1;
    return right.weight - left.weight;
  });
  const rawScore = findings.reduce(
    (total, finding) => total + finding.weight,
    0,
  );
  const score = Math.min(100, rawScore);
  const band = score >= 55 ? "flagged" : score >= 25 ? "watch" : "clear";
  return { vendor_id: vendor.id, score, band, findings };
}

export function evaluateRisk({
  vendors,
  snapshots,
  transactions,
  asOf = "9999-99",
}) {
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const snapshotsByVendor = new Map();
  const transactionsByVendor = new Map();
  for (const snapshot of snapshots) {
    if (!snapshotsByVendor.has(snapshot.vendor_id)) {
      snapshotsByVendor.set(snapshot.vendor_id, []);
    }
    snapshotsByVendor.get(snapshot.vendor_id).push(snapshot);
  }
  for (const transaction of transactions) {
    if (!transactionsByVendor.has(transaction.vendor_id)) {
      transactionsByVendor.set(transaction.vendor_id, []);
    }
    transactionsByVendor.get(transaction.vendor_id).push(transaction);
  }

  const edges = buildEdges(vendors);
  const context = {
    asOf,
    edges,
    snapshotsByVendor,
    transactionsByVendor,
    vendorById,
  };
  return vendors.map((vendor) => evaluateVendor(vendor, context));
}