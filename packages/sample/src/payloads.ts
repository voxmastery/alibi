import type { LookupEnvelope, SampleCapture, SampleVendor } from "./index.js";
import { makeRandom, type Random } from "./random.js";

const RING_KEYS = new Set(["meridian", "kavach", "orbit"]);
const PAIR_KEYS = new Set(["zenith", "apex"]);
const LAPSED_KEY = "trimurti";
const NEVER_CAPTURED_KEYS = new Set(["vaishnavi", "northline"]);

const FIRST_MONTH = "2025-03";
const LAST_MONTH = "2026-09";
const RETURNS_FLOOR_MONTH = "2025-01";

function monthIndex(month: string): number {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  return year * 12 + (mon - 1);
}

function monthFromIndex(index: number): string {
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

function addMonths(month: string, delta: number): string {
  return monthFromIndex(monthIndex(month) + delta);
}

function monthsInclusive(start: string, end: string): string[] {
  const months: string[] = [];
  for (let idx = monthIndex(start); idx <= monthIndex(end); idx++) {
    months.push(monthFromIndex(idx));
  }
  return months;
}

/** March 2025 through September 2026, inclusive — 19 months. */
export function sampleMonths(): string[] {
  return monthsInclusive(FIRST_MONTH, LAST_MONTH);
}

function businessConstitution(legalName: string): string {
  if (legalName.includes("Pvt Ltd")) return "Private Limited Company";
  if (legalName.includes("LLP")) return "Limited Liability Partnership";
  return "Proprietorship";
}

function pincodeFromAddress(address: string): string | null {
  const match = /(\d{6})\s*$/.exec(address);
  return match ? match[1]! : null;
}

function stateRangeNumber(stateCode: string): number {
  return (Number(stateCode) % 9) + 1;
}

/** Filing status for one vendor's return period, per the brief's per-band rules. */
function isFiled(vendorKey: string, period: string): boolean {
  if (RING_KEYS.has(vendorKey)) return period <= "2026-01";
  if (PAIR_KEYS.has(vendorKey)) return !(period >= "2025-12" && period <= "2026-04");
  if (vendorKey === LAPSED_KEY) return period < "2026-03";
  return true;
}

/** Taxpayer status/cancellation as of the given capture month. Only the ring ever moves. */
function taxpayerStatus(vendorKey: string, month: string): { status: string; cancellation_date: string | null } {
  if (RING_KEYS.has(vendorKey)) {
    if (month >= "2026-07") return { status: "Cancelled", cancellation_date: "2025-04-01" };
    if (month >= "2026-05") return { status: "Suspended", cancellation_date: null };
  }
  return { status: "Active", cancellation_date: null };
}

function buildArn(rand: Random, stateCode: string, period: string): string {
  const digits = String(rand.int(0, 9999)).padStart(4, "0");
  return `AA${stateCode}${period.replace("-", "")}${digits}`;
}

function buildReturnsForCapture(rand: Random, vendor: SampleVendor, captureMonth: string): Array<Record<string, unknown>> {
  const registrationMonth = vendor.registered_on.slice(0, 7);
  const start = registrationMonth > RETURNS_FLOOR_MONTH ? registrationMonth : RETURNS_FLOOR_MONTH;
  const end = addMonths(captureMonth, -1);
  if (monthIndex(start) > monthIndex(end)) return [];

  const entries: Array<Record<string, unknown>> = [];
  for (const period of monthsInclusive(start, end)) {
    const filed = isFiled(vendor.key, period);
    const followingMonth = addMonths(period, 1);
    entries.push({
      return_type: "GSTR3B",
      return_period: period,
      filing_status: filed ? "filed" : "not_filed",
      filing_date: filed ? `${followingMonth}-20` : null,
      arn: filed ? buildArn(rand, vendor.state_code, period) : null,
    });
    entries.push({
      return_type: "GSTR1",
      return_period: period,
      filing_status: filed ? "filed" : "not_filed",
      filing_date: filed ? `${followingMonth}-11` : null,
      arn: filed ? buildArn(rand, vendor.state_code, period) : null,
    });
  }
  return entries;
}

function buildEnvelope(rand: Random, vendor: SampleVendor, capturedAt: string, month: string): LookupEnvelope {
  const { status, cancellation_date } = taxpayerStatus(vendor.key, month);
  return {
    provider: "sample",
    requested_at: capturedAt,
    gstin: vendor.gstin,
    http_status: 200,
    taxpayer: {
      gstin: vendor.gstin,
      legal_name: vendor.legal_name,
      trade_name: vendor.trade_name,
      status,
      taxpayer_type: "Regular",
      business_constitution: businessConstitution(vendor.legal_name),
      registration_date: vendor.registered_on,
      cancellation_date,
      state_code: vendor.state_code,
      state_jurisdiction: `${vendor.state} - Range ${stateRangeNumber(vendor.state_code)}`,
      address: vendor.address,
      pincode: pincodeFromAddress(vendor.address),
      nature_of_business: ["Wholesale Business"],
      einvoice_status: "No",
      block_status: "U",
    },
    returns: buildReturnsForCapture(rand, vendor, month),
  };
}

/**
 * One capture per vendor per month, from March 2025 through September 2026, starting no
 * earlier than the vendor's registration month. The two never-captured vendors are skipped
 * entirely.
 */
export function buildCaptures(vendors: SampleVendor[]): SampleCapture[] {
  const rand = makeRandom(20250101);
  const months = sampleMonths();
  const captures: SampleCapture[] = [];

  for (const vendor of vendors) {
    if (NEVER_CAPTURED_KEYS.has(vendor.key)) continue;
    const registrationMonth = vendor.registered_on.slice(0, 7);
    for (const month of months) {
      if (month < registrationMonth) continue;
      const captured_at = `${month}-01T03:30:00.000Z`;
      captures.push({
        vendor_key: vendor.key,
        captured_at,
        envelope: buildEnvelope(rand, vendor, captured_at, month),
      });
    }
  }

  return captures;
}
