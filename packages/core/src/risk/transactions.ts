import type { Finding, Observation, Severity, TransactionInput } from "./types.js";
import { countLabel, dateOnly, formatMoney } from "./text.js";

const sum = (items: TransactionInput[], pick: (t: TransactionInput) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

const isCash = (t: TransactionInput): boolean => t.payment_mode.toLowerCase() === "cash";

/** The latest observation captured on or before the date, if any. */
export function snapshotOnDate(observations: Observation[], date: string): Observation | undefined {
  let found: Observation | undefined;
  for (const observation of observations) {
    if (dateOnly(observation.captured_at) <= date) found = observation;
    else break;
  }
  return found;
}

/** Rules C1–C3. transactions: dated on or before as_of. */
export function transactionFindings(transactions: TransactionInput[], asOf: string): Finding[] {
  const findings: Finding[] = [];
  const add = (rule_id: string, severity: Severity, weight: number, message: string) => {
    findings.push({ rule_id, severity, weight, message, as_of: asOf });
  };

  const cash = transactions.filter(isCash);
  if (cash.length > 0) {
    add(
      "C1",
      "high",
      25,
      `₹${formatMoney(sum(cash, (t) => t.amount))} paid in cash. Payment through banking channels is what protects an ITC claim.`,
    );
  }

  const missingEway = transactions.filter((t) => t.amount > 50_000 && !t.eway_bill);
  if (missingEway.length > 0) {
    add(
      "C2",
      "medium",
      20,
      `No e-way bill recorded for ${countLabel(missingEway.length)} consignments above ₹50,000. Movement of goods cannot be evidenced.`,
    );
  }

  if (transactions.length > 0) {
    const roundCount = transactions.filter((t) => t.amount % 10_000 === 0).length;
    const roundPercent = Math.round((roundCount / transactions.length) * 100);
    if (roundPercent > 80) {
      add("C3", "low", 10, `${roundPercent}% of invoices are round figures.`);
    }
  }

  return findings;
}

/** Rules D1–D3: protective, weight zero. */
export function protectiveFindings(
  observations: Observation[],
  transactions: TransactionInput[],
  asOf: string,
): Finding[] {
  const findings: Finding[] = [];
  if (transactions.length === 0) return findings;
  const add = (rule_id: string, message: string) => {
    findings.push({ rule_id, severity: "positive", weight: 0, message, as_of: asOf });
  };

  const onDate = transactions.map((t) => snapshotOnDate(observations, t.date));

  if (onDate.every((o) => o?.status.toLowerCase() === "active")) {
    add("D1", `Active on the public register on every transaction date. ${countLabel(observations.length)} snapshots on file.`);
  }
  if (onDate.every((o) => o?.returns_current === true)) {
    add("D2", "Returns current at the time of every transaction.");
  }
  if (transactions.every((t) => !isCash(t))) {
    add("D3", "All payments through banking channels.");
  }
  return findings;
}
