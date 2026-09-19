import type { Finding, Observation, Severity, TransactionInput, VendorInput } from "./types.js";
import { addMonths, countLabel, dateOnly, formatMoney, monthsBetween } from "./text.js";

const sum = (items: TransactionInput[], pick: (t: TransactionInput) => number): number =>
  items.reduce((total, item) => total + pick(item), 0);

/**
 * Rules B1–B6 over successful observations only.
 * observations: ascending by captured_at, non-empty. transactions: dated on or before as_of.
 */
export function historyFindings(
  vendor: VendorInput,
  observations: Observation[],
  transactions: TransactionInput[],
  asOf: string,
): Finding[] {
  const findings: Finding[] = [];
  const add = (rule_id: string, severity: Severity, weight: number, message: string) => {
    findings.push({ rule_id, severity, weight, message, as_of: asOf });
  };
  const latest = observations[observations.length - 1];
  if (!latest) return findings;

  // B1 — retrospective cancellation with transactions inside the cancelled period.
  const cancellation = observations.find(
    (o) => o.status.toLowerCase() === "cancelled" && o.retrospective_from !== null,
  );
  if (cancellation && cancellation.retrospective_from) {
    const from = cancellation.retrospective_from;
    const capturedOn = dateOnly(cancellation.captured_at);
    const exposed = transactions.filter((t) => t.date >= from && t.date < capturedOn);
    if (exposed.length > 0) {
      add(
        "B1",
        "critical",
        50,
        `Registration cancelled with retrospective effect from ${from}. ${countLabel(exposed.length)} transactions worth ₹${formatMoney(sum(exposed, (t) => t.amount))} fall inside the cancelled period. ITC of ₹${formatMoney(sum(exposed, (t) => t.itc_claimed))} is exposed.`,
      );
    }
  }

  // B2 — longest run of consecutive active observations with returns not current.
  let run: Observation[] = [];
  let longest: Observation[] = [];
  for (const observation of observations) {
    if (observation.status.toLowerCase() === "active" && observation.returns_current === false) {
      run.push(observation);
      if (run.length > longest.length) longest = [...run];
    } else {
      run = [];
    }
  }
  if (longest.length >= 2) {
    add(
      "B2",
      "high",
      30,
      `No GSTR-3B filed for ${countLabel(longest.length)} periods to ${dateOnly(longest[longest.length - 1]!.captured_at)}. A supplier not filing is likely not remitting the tax you paid them.`,
    );
  }

  // B3 — first suspension.
  const suspension = observations.find((o) => o.status.toLowerCase() === "suspended");
  if (suspension) {
    add("B3", "high", 35, `Registration suspended on ${dateOnly(suspension.captured_at)}.`);
  }

  // B4 — under six months old on as_of and more than ten lakh transacted since registration.
  const ageMonths = monthsBetween(vendor.registered_on, asOf);
  if (ageMonths < 6) {
    const since = transactions.filter((t) => t.date >= vendor.registered_on);
    const amount = sum(since, (t) => t.amount);
    if (amount > 1_000_000) {
      add(
        "B4",
        "medium",
        15,
        `Registered ${countLabel(ageMonths)} months ago. ₹${formatMoney(amount)} transacted since — high value against a short history.`,
      );
    }
  }

  // B5 — Aadhaar authentication known to be false.
  if (vendor.aadhaar_authenticated === false) {
    add("B5", "medium", 15, "GSTIN not Aadhaar-authenticated.");
  }

  // B6 — three or more status changes in the twelve months before the latest observation.
  const trailingStart = addMonths(latest.captured_at, -12);
  const trailing = observations.filter((o) => dateOnly(o.captured_at) >= trailingStart);
  let changes = 0;
  for (let i = 1; i < trailing.length; i++) {
    if (trailing[i]!.status !== trailing[i - 1]!.status) changes += 1;
  }
  if (changes >= 3) {
    add("B6", "medium", 20, `Registration status changed ${countLabel(changes)} times in the last year.`);
  }

  return findings;
}
