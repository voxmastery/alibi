import type { FilingPeriod } from "@alibi/contracts";
import type { LookupEnvelope } from "./types.js";
import type { ParsedSnapshot } from "../store/types.js";

export const PARSER_VERSION = 1;

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function emptyParsed(): ParsedSnapshot {
  return Object.freeze({
    status: null, taxpayer_type: null, business_constitution: null, registration_date: null,
    cancellation_date: null, retrospective_from: null, returns_current: null, last_return_filed: null,
    filing: Object.freeze([]), legal_name: null, trade_name: null, state: null, address: null,
    einvoice_status: null, block_status: null,
  });
}

/** Due date of a monthly GSTR-3B: the 20th of the following month. */
export function gstr3bDueDate(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  const next = new Date(Date.UTC(year, month, 20));
  return next.toISOString().slice(0, 10);
}

const STATE_NAMES: Record<string, string> = {
  "03": "Punjab", "06": "Haryana", "07": "Delhi", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka", "33": "Tamil Nadu",
};

/**
 * Derives the snapshot columns from a provider envelope. Versioned: changing this function
 * bumps PARSER_VERSION and never touches payload_raw or the hash.
 */
export function parseEnvelope(envelope: LookupEnvelope, capturedAt: string): ParsedSnapshot {
  if (!envelope.taxpayer) return emptyParsed();
  const t = envelope.taxpayer;
  const capturedDate = capturedAt.slice(0, 10);
  const filing: FilingPeriod[] = [];
  for (const r of envelope.returns ?? []) {
    const type = r["return_type"] === "GSTR1" ? "GSTR1" : r["return_type"] === "GSTR3B" ? "GSTR3B" : null;
    const period = str(r["return_period"]);
    if (!type || !period) continue;
    const status = r["filing_status"] === "filed" ? "filed" : "not_filed";
    filing.push({ return_type: type, period, filing_status: status, filing_date: str(r["filing_date"]) });
  }
  filing.sort((a, b) => a.period.localeCompare(b.period) || a.return_type.localeCompare(b.return_type));
  const due3b = filing.filter((f) => f.return_type === "GSTR3B" && gstr3bDueDate(f.period) <= capturedDate);
  const latestDue = due3b[due3b.length - 1];
  const returns_current = latestDue ? latestDue.filing_status === "filed" : null;
  const lastFiled = [...filing].reverse().find((f) => f.return_type === "GSTR3B" && f.filing_status === "filed");
  const status = str(t["status"]);
  const cancellation_date = str(t["cancellation_date"]);
  const retrospective_from =
    status?.toLowerCase() === "cancelled" && cancellation_date && cancellation_date < capturedDate ? cancellation_date : null;
  const stateCode = str(t["state_code"]);
  return Object.freeze({
    status,
    taxpayer_type: str(t["taxpayer_type"]),
    business_constitution: str(t["business_constitution"]),
    registration_date: str(t["registration_date"]),
    cancellation_date,
    retrospective_from,
    returns_current,
    last_return_filed: lastFiled?.period ?? null,
    filing: Object.freeze(filing),
    legal_name: str(t["legal_name"]),
    trade_name: str(t["trade_name"]),
    state: stateCode ? (STATE_NAMES[stateCode] ?? stateCode) : null,
    address: str(t["address"]),
    einvoice_status: str(t["einvoice_status"]),
    block_status: str(t["block_status"]),
  });
}
