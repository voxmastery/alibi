import { evaluateRisk, type Finding, type RiskInput, type RiskResult } from "@alibi/core";
import type { FindingView, Verdict } from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import { humanDate } from "./format.js";

/** A vendor with no recorded registration date still exists: it is simply older than any as_of. */
const UNKNOWN_REGISTRATION = "1900-01-01";

/** Everything the rule engine reads, assembled from the store. Nothing here is provider specific. */
export function riskInputs(store: MemoryStore, asOf: string): RiskInput {
  const vendors = store.vendors();
  return {
    as_of: asOf,
    vendors: vendors.map((v) => ({
      id: v.id,
      legal_name: v.legal_name,
      state: v.state ?? "",
      registered_on: v.registered_on ?? UNKNOWN_REGISTRATION,
      pan: v.pan,
      bank_account: v.bank_account,
      address: v.address,
      phone: v.phone,
      email: v.email,
      filing_ip: v.filing_ip,
      aadhaar_authenticated: v.aadhaar_authenticated,
    })),
    snapshots: vendors.flatMap((v) =>
      store.snapshots(v.id).map((s) => ({
        vendor_id: v.id,
        captured_at: s.captured_at,
        lookup_ok: s.lookup_ok,
        status: s.status,
        returns_current: s.returns_current,
        retrospective_from: s.retrospective_from,
      })),
    ),
    transactions: store.allTransactions().map((t) => ({
      vendor_id: t.vendor_id,
      date: t.date,
      amount: t.amount,
      itc_claimed: t.itc_claimed,
      payment_mode: t.payment_mode,
      eway_bill: t.eway_bill,
    })),
    edges: store.edges().map((e) => ({
      from_vendor: e.from_vendor,
      to_vendor: e.to_vendor,
      attribute: e.attribute,
      value: e.value,
    })),
  };
}

/** One evaluation of the whole register, keyed by vendor id. */
export function evaluateOrg(store: MemoryStore, asOf: string): Map<string, RiskResult> {
  return new Map(evaluateRisk(riskInputs(store, asOf)).map((result) => [result.vendor_id, result]));
}

/** The view of a finding the app may show: the rule id stays on this side of the wire. */
export function toFindingViews(findings: readonly Finding[]): FindingView[] {
  return findings.map((f) => ({ severity: f.severity, weight: f.weight, message: f.message, as_of: f.as_of }));
}

/**
 * Turns a band into sentences a reader can repeat. Absence of record is stated as absence;
 * the words "safe" and "fraud" are never used, and no rule id ever appears.
 */
export function verdictFor(result: RiskResult, ctx: { sample: boolean; hasCapture: boolean }): Verdict {
  const date = humanDate(result.as_of);
  const top = result.findings.find((f) => f.severity !== "positive")?.message ?? null;
  const plus = result.findings.find((f) => f.severity === "positive")?.message ?? null;
  const base = { band: result.band, score: result.score, as_of: result.as_of };

  if (result.band === "unknown") {
    return {
      ...base,
      sentence:
        ctx.sample && !ctx.hasCapture
          ? "This GSTIN has no sealed capture in the sample register, so nothing can be said about it. Absence of record is stated as absence."
          : "No successful capture exists for this GSTIN yet, so nothing can be said about it. Absence of record is stated as absence.",
    };
  }
  if (result.band === "clear") {
    return { ...base, sentence: `Nothing adverse on record as of ${date}.${plus ? ` ${plus}` : ""}` };
  }
  if (result.band === "watch") {
    return { ...base, sentence: `One or more soft signals as of ${date}.${top ? ` ${top}` : ""}` };
  }
  return { ...base, sentence: `Pattern consistent with known shell structures as of ${date}.${top ? ` ${top}` : ""}` };
}
