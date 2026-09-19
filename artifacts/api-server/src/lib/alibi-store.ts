import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dataDirectory } from "../resource-paths";
// The risk engine intentionally remains plain JavaScript as the product contract requires.
// @ts-expect-error The adjacent JavaScript module has a runtime-only interface.
import { buildEdges, evaluateRisk } from "../../server/risk.js";

type Row = Record<string, string>;

export type Vendor = Row & {
  id: string;
  aadhaar_authenticated: string;
};

export type Transaction = Row & {
  amount: string;
  itc_claimed: string;
};

export type Snapshot = {
  id: string;
  vendor_id: string;
  captured_at: string;
  status: string;
  returns_current: boolean;
  last_return_filed: string;
  retrospective_from: string | null;
  payload_hash: string;
  prev_hash: string;
};

export type Finding = {
  rule_id: string;
  severity: "info" | "low" | "medium" | "high" | "critical" | "positive";
  weight: number;
  message: string;
  as_of: string;
};

const dataPath = (name: string) => resolve(dataDirectory, name);

function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers = [], ...records] = rows;
  return records.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

const vendors = parseCsv(readFileSync(dataPath("vendors.csv"), "utf8")) as Vendor[];
const transactions = parseCsv(
  readFileSync(dataPath("transactions.csv"), "utf8"),
) as Transaction[];
const snapshots = JSON.parse(
  readFileSync(dataPath("snapshots.json"), "utf8"),
) as Snapshot[];

const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
const riskResults = (asOf = "9999-99") =>
  evaluateRisk({ vendors, snapshots, transactions, asOf }) as Array<{
    vendor_id: string;
    score: number | null;
    band: "clear" | "watch" | "flagged" | "unknown";
    findings: Array<{
      rule_id: string;
      severity: Finding["severity"];
      weight: number;
      message: string;
    }>;
  }>;

const attributes = [
  "bank_account",
  "pan",
  "address",
  "phone",
  "email",
  "filing_ip",
] as const;

function latestSnapshot(vendorId: string, asOf = "9999-99-99") {
  return snapshots
    .filter(
      (snapshot) =>
        snapshot.vendor_id === vendorId && snapshot.captured_at.slice(0, 7) <= asOf,
    )
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at))[0];
}

function related(vendor: Vendor, attribute: (typeof attributes)[number]) {
  return vendors.filter(
    (candidate) =>
      candidate.id !== vendor.id &&
      Boolean(vendor[attribute]) &&
      candidate[attribute] === vendor[attribute],
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function findingsFor(vendor: Vendor, asOf = "9999-99") {
  const findings: Finding[] = [];
  const snapshot = latestSnapshot(vendor.id, asOf);
  const asOfDate = snapshot?.captured_at ?? `${asOf}-01`;

  if (!snapshot) return findings;

  const addShared = (
    attribute: (typeof attributes)[number],
    rule_id: string,
    severity: Finding["severity"],
    weight: number,
    message: (names: string[], count: number) => string,
    suppress = false,
  ) => {
    const matches = related(vendor, attribute);
    if (matches.length && !suppress) {
      findings.push({
        rule_id,
        severity,
        weight,
        message: message(
          matches.map((item) => item.legal_name),
          matches.length + 1,
        ),
        as_of: asOfDate,
      });
    }
  };

  addShared("bank_account", "A1", "high", 45, (names, count) =>
    `Shares bank account ending ${vendor.bank_account.slice(-4)} with ${names.join(", ")} — ${count} entities, one account.`,
  );
  addShared("pan", "A2", "info", 5, (_names, count) => {
    const states = [vendor, ...related(vendor, "pan")].map((item) => item.state);
    return `Holds ${count} GSTINs under one PAN across ${[...new Set(states)].join(", ")}. Normal for multi-state operations.`;
  });
  addShared(
    "address",
    "A3",
    "high",
    30,
    (names) =>
      `Registered at the same address as ${names.join(", ")}. No shared PAN or group structure on record.`,
    related(vendor, "pan").length > 0,
  );
  addShared("phone", "A4-phone", "medium", 20, (names) =>
    `Contact number shared with ${names.join(", ")}.`,
  );
  addShared("email", "A4-email", "medium", 20, (names) =>
    `Email address shared with ${names.join(", ")}.`,
  );
  addShared("filing_ip", "A5", "high", 25, (names) =>
    `Returns filed from the same IP address as ${names.join(", ")}.`,
  );

  const vendorTransactions = transactions.filter(
    (transaction) =>
      transaction.vendor_id === vendor.id && transaction.date.slice(0, 7) <= asOf,
  );
  const cash = vendorTransactions.filter(
    (transaction) => transaction.payment_mode.toLowerCase() === "cash",
  );
  if (cash.length) {
    findings.push({
      rule_id: "C1",
      severity: "high",
      weight: 25,
      message: `₹${money(cash.reduce((sum, item) => sum + Number(item.amount), 0))} paid in cash. Payment through banking channels is what protects an ITC claim.`,
      as_of: cash.map((item) => item.date).sort().at(-1) ?? asOfDate,
    });
  }

  const missingEway = vendorTransactions.filter(
    (transaction) => Number(transaction.amount) > 50_000 && !transaction.eway_bill,
  );
  if (missingEway.length) {
    findings.push({
      rule_id: "C2",
      severity: "medium",
      weight: 20,
      message: `No e-way bill recorded for ${missingEway.length} consignments above ₹50,000. Movement of goods cannot be evidenced.`,
      as_of: missingEway.map((item) => item.date).sort().at(-1) ?? asOfDate,
    });
  }

  if (vendor.aadhaar_authenticated.toLowerCase() !== "true") {
    findings.push({
      rule_id: "B5",
      severity: "medium",
      weight: 15,
      message: "GSTIN not Aadhaar-authenticated.",
      as_of: asOfDate,
    });
  }

  if (snapshot.status.toLowerCase() === "suspended") {
    findings.push({
      rule_id: "B3",
      severity: "high",
      weight: 35,
      message: `Registration suspended on ${snapshot.captured_at}.`,
      as_of: snapshot.captured_at,
    });
  }

  if (snapshot.status.toLowerCase() === "cancelled" && snapshot.retrospective_from) {
    const exposed = vendorTransactions.filter(
      (transaction) => transaction.date >= snapshot.retrospective_from!,
    );
    findings.push({
      rule_id: "B1",
      severity: "critical",
      weight: 50,
      message: `Registration cancelled with retrospective effect from ${snapshot.retrospective_from}. ${exposed.length} transactions worth ₹${money(exposed.reduce((sum, item) => sum + Number(item.amount), 0))} fall inside the cancelled period. ITC of ₹${money(exposed.reduce((sum, item) => sum + Number(item.itc_claimed), 0))} is exposed.`,
      as_of: snapshot.captured_at,
    });
  }

  if (
    vendorTransactions.length &&
    vendorTransactions.every((transaction) => transaction.payment_mode.toLowerCase() !== "cash")
  ) {
    findings.push({
      rule_id: "D3",
      severity: "positive",
      weight: 0,
      message: "All payments through banking channels.",
      as_of: asOfDate,
    });
  }

  return findings.sort((a, b) => b.weight - a.weight);
}

export function riskFor(vendor: Vendor, asOf = "9999-99") {
  return (
    riskResults(asOf).find((result) => result.vendor_id === vendor.id) ?? {
      score: null,
      band: "unknown",
      findings: [],
    }
  );
}

export function listVendors() {
  return vendors.map((vendor) => ({ ...vendor, ...riskFor(vendor) }));
}

export function graphAt(asOf: string) {
  const results = new Map(
    riskResults(asOf).map((result) => [result.vendor_id, result]),
  );
  const nodes = vendors.map((vendor) => {
    const snapshot = latestSnapshot(vendor.id, asOf);
    const risk = results.get(vendor.id);
    const visible = vendor.registered_on.slice(0, 7) <= asOf;
    const recordedTransactions = transactions.filter(
      (transaction) =>
        transaction.vendor_id === vendor.id &&
        transaction.date.slice(0, 7) <= asOf,
    );
    const totalItc = recordedTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.itc_claimed),
      0,
    );
    return {
      id: vendor.id,
      name: vendor.trade_name || vendor.legal_name,
      legal_name: vendor.legal_name,
      gstin: vendor.gstin,
      pan: vendor.pan,
      state: vendor.state,
      registered_on: vendor.registered_on,
      status: snapshot?.status ?? "Unknown",
      total_value: recordedTransactions.reduce(
        (sum, transaction) => sum + Number(transaction.amount),
        0,
      ),
      total_itc: totalItc,
      // Exposure is all recorded ITC with currently flagged vendors, not an
      // assertion that those claims have been denied.
      itc_exposed: visible && risk?.band === "flagged" ? totalItc : 0,
      snapshot_count: snapshots.filter(
        (item) =>
          item.vendor_id === vendor.id &&
          item.captured_at.slice(0, 7) <= asOf,
      ).length,
      visible_at_selected_month: visible,
      ...risk,
    };
  });

  const links = buildEdges(vendors);
  return { nodes, links };
}

export function debugRiskText() {
  const results = riskResults();
  return results
    .map((result) => {
      const vendor = vendorById.get(result.vendor_id);
      const header = `${result.vendor_id} | ${vendor?.legal_name ?? "Unknown vendor"} | score=${result.score ?? "n/a"} | band=${result.band}`;
      const lines = result.findings.length
        ? result.findings.map(
            (finding) =>
              `  ${finding.rule_id} | ${finding.severity} | +${finding.weight} | ${finding.message}`,
          )
        : ["  No findings."];
      return [header, ...lines].join("\n");
    })
    .join("\n\n");
}

export function vendorDetail(id: string) {
  const vendor = vendorById.get(id);
  if (!vendor) return null;
  return {
    ...vendor,
    ...riskFor(vendor),
    snapshots: snapshots
      .filter((snapshot) => snapshot.vendor_id === id)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at)),
  };
}

export function verifyChain(vendorId?: string) {
  const ids = vendorId ? [vendorId] : vendors.map((vendor) => vendor.id);
  const failures: Array<{ vendor_id: string; snapshot_id: string }> = [];
  let links = 0;

  for (const id of ids) {
    const chain = snapshots
      .filter((snapshot) => snapshot.vendor_id === id)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    for (let index = 0; index < chain.length; index += 1) {
      links += 1;
      const expected = index === 0 ? "0000000000000000" : chain[index - 1]!.payload_hash;
      if (chain[index]!.prev_hash !== expected) {
        failures.push({ vendor_id: id, snapshot_id: chain[index]!.id });
      }
    }
  }

  return { verified: failures.length === 0, links, failures };
}

export function defenceFile(id: string) {
  const vendor = vendorById.get(id);
  if (!vendor) return null;
  const chain = snapshots
    .filter((snapshot) => snapshot.vendor_id === id)
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const vendorTransactions = transactions.filter(
    (transaction) => transaction.vendor_id === id,
  );
  const mappedTransactions = vendorTransactions.map((transaction) => {
    const snapshot = chain
      .filter((item) => item.captured_at <= transaction.date)
      .at(-1);
    return {
      invoice_no: transaction.invoice_no,
      date: transaction.date,
      amount: Number(transaction.amount),
      itc_claimed: Number(transaction.itc_claimed),
      status_on_date: snapshot?.status ?? "No snapshot on file",
      returns_current_on_date: snapshot?.returns_current ?? null,
      payment_mode: transaction.payment_mode,
      snapshot_hash: snapshot?.payload_hash ?? null,
    };
  });
  const verification = verifyChain(id);
  const cancellation = [...chain]
    .reverse()
    .find((snapshot) => snapshot.status.toLowerCase() === "cancelled");
  const statement = cancellation
    ? `On each transaction date listed above, this GSTIN's recorded status is shown from the snapshot ledger. Registration was cancelled with retrospective effect on ${cancellation.captured_at}, after the listed transactions.`
    : "On each transaction date listed above, this GSTIN's recorded status and return-filing position are shown from the snapshot ledger. Payments made through banking channels are identified in the transaction record.";

  return {
    vendor: {
      legal_name: vendor.legal_name,
      gstin: vendor.gstin,
      pan: vendor.pan,
    },
    exported_at: new Date().toISOString(),
    transactions: mappedTransactions,
    chain: {
      verified: verification.verified,
      links: verification.links,
      root_hash: chain[0]?.prev_hash ?? null,
    },
    statement,
  };
}