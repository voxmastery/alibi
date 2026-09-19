import type { Band, Finding, Observation, RiskInput, RiskResult, TransactionInput, VendorInput } from "./types.js";
import { dateOnly } from "./text.js";
import { buildNetworkIndex, networkFindings } from "./network.js";
import { historyFindings } from "./history.js";
import { protectiveFindings, transactionFindings } from "./transactions.js";

const AS_OF_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Weight descending; A1 always ahead of A6 (the bank account is the sentence a judge repeats back). Stable. */
export function orderFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((left, right) => {
    if (left.rule_id === "A1" && right.rule_id === "A6") return -1;
    if (left.rule_id === "A6" && right.rule_id === "A1") return 1;
    return right.weight - left.weight;
  });
}

export function scoreAndBand(findings: Finding[]): { score: number; band: Band } {
  const raw = findings.reduce((total, finding) => total + finding.weight, 0);
  const score = Math.min(100, raw);
  const band: Band = score >= 55 ? "flagged" : score >= 25 ? "watch" : "clear";
  return { score, band };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    let group = groups.get(k);
    if (!group) {
      group = [];
      groups.set(k, group);
    }
    group.push(item);
  }
  return groups;
}

/**
 * Deterministic rule evaluation for every vendor as of one date.
 * Only successful observations (lookup_ok with a status) captured on or before as_of are read.
 * A vendor with no such observation, or registered after as_of, is `unknown` with a null score.
 */
export function evaluateRisk(input: RiskInput): RiskResult[] {
  const asOf = input.as_of;
  if (!AS_OF_PATTERN.test(asOf)) {
    throw new TypeError(`as_of must be YYYY-MM-DD, got "${asOf}"`);
  }

  const vendorById = new Map<string, VendorInput>(input.vendors.map((v) => [v.id, v]));

  const observationsByVendor = new Map<string, Observation[]>();
  for (const [vendorId, rows] of groupBy(input.snapshots, (s) => s.vendor_id)) {
    const observations = rows
      .filter((s) => s.lookup_ok && s.status !== null && dateOnly(s.captured_at) <= asOf)
      .map((s) => ({
        captured_at: s.captured_at,
        status: s.status as string,
        returns_current: s.returns_current,
        retrospective_from: s.retrospective_from,
      }))
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    observationsByVendor.set(vendorId, observations);
  }

  const transactionsByVendor = new Map<string, TransactionInput[]>();
  for (const [vendorId, rows] of groupBy(input.transactions, (t) => t.vendor_id)) {
    transactionsByVendor.set(
      vendorId,
      rows.filter((t) => t.date <= asOf).sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  const index = buildNetworkIndex(input.edges, vendorById, asOf);

  return input.vendors.map((vendor): RiskResult => {
    const observations = observationsByVendor.get(vendor.id) ?? [];
    if (vendor.registered_on > asOf || observations.length === 0) {
      return { vendor_id: vendor.id, as_of: asOf, score: null, band: "unknown", findings: [] };
    }
    const transactions = transactionsByVendor.get(vendor.id) ?? [];
    const findings = orderFindings([
      ...networkFindings(vendor, index, vendorById, asOf),
      ...historyFindings(vendor, observations, transactions, asOf),
      ...transactionFindings(transactions, asOf),
      ...protectiveFindings(observations, transactions, asOf),
    ]);
    const { score, band } = scoreAndBand(findings);
    return { vendor_id: vendor.id, as_of: asOf, score, band, findings };
  });
}
