import type { SampleTransaction, SampleVendor } from "./index.js";
import { makeRandom, type Random } from "./random.js";

const RING_KEYS = new Set(["meridian", "kavach", "orbit"]);
const PAIR_KEYS = new Set(["zenith", "apex"]);
const NEVER_CAPTURED_KEYS = new Set(["vaishnavi", "northline"]);

const RING_DATES = ["2025-05-09", "2025-06-21", "2025-08-14", "2025-09-27", "2025-11-06", "2026-01-19", "2026-02-25"];
const PAIR_DATES = ["2025-07-03", "2025-10-17", "2026-02-08"];
const NEVER_CAPTURED_DATES = ["2026-08-05", "2026-08-20"];
const RING_AMOUNTS = [250_000, 500_000, 750_000, 1_000_000];
const RING_MODES = ["NEFT", "NEFT", "Cash"];

const ORDINARY_START = "2025-03-01";
const ORDINARY_SPAN_DAYS = 550;
const DAY_MS = 86_400_000;
const EWAY_THRESHOLD = 50_000;

function drawDigits(rand: Random, count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += String(rand.int(0, 9));
  return out;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d) + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

function invoiceNo(rand: Random, date: string): string {
  const yy = date.slice(2, 4);
  const mm = date.slice(5, 7);
  return `INV/${yy}${mm}/${rand.int(100, 999)}`;
}

function makeTransaction(
  rand: Random,
  vendorKey: string,
  date: string,
  amount: number,
  paymentMode: string,
  ewayBill: string | null,
): SampleTransaction {
  return {
    vendor_key: vendorKey,
    invoice_no: invoiceNo(rand, date),
    date,
    amount,
    itc_claimed: Math.round((amount * 18) / 118),
    payment_mode: paymentMode,
    eway_bill: ewayBill,
  };
}

/** Seven heavy, round-figure invoices, some cash, e-way bill only slightly more often than not. */
function buildRingTransactions(rand: Random, vendor: SampleVendor): SampleTransaction[] {
  return RING_DATES.map((date) => {
    const amount = rand.pick(RING_AMOUNTS);
    const paymentMode = rand.pick(RING_MODES);
    const hasEway = rand.next() > 0.55;
    const ewayBill = hasEway ? `EWB${drawDigits(rand, 12)}` : null;
    return makeTransaction(rand, vendor.key, date, amount, paymentMode, ewayBill);
  });
}

/** Three mid-size invoices. */
function buildPairTransactions(rand: Random, vendor: SampleVendor): SampleTransaction[] {
  return PAIR_DATES.map((date) => {
    const amount = rand.int(16, 84) * 5000;
    const ewayBill = amount > EWAY_THRESHOLD ? `EWB${drawDigits(rand, 12)}` : null;
    return makeTransaction(rand, vendor.key, date, amount, "NEFT", ewayBill);
  });
}

/** Two invoices in August 2026 for vendors that are otherwise never captured. */
function buildNeverCapturedTransactions(rand: Random, vendor: SampleVendor): SampleTransaction[] {
  return NEVER_CAPTURED_DATES.map((date) => {
    const amount = rand.int(34, 890) * 1000;
    const ewayBill = amount > EWAY_THRESHOLD ? `EWB${drawDigits(rand, 12)}` : null;
    return makeTransaction(rand, vendor.key, date, amount, "NEFT", ewayBill);
  });
}

/** 3-8 ordinary invoices dated within 550 days of 2025-03-01, never before registration. */
function buildOrdinaryTransactions(rand: Random, vendor: SampleVendor): SampleTransaction[] {
  const count = rand.int(3, 8);
  const transactions: SampleTransaction[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(ORDINARY_START, rand.int(0, ORDINARY_SPAN_DAYS));
    if (date < vendor.registered_on) continue;
    const amount = rand.int(34, 890) * 1000;
    const ewayBill = amount > EWAY_THRESHOLD ? `EWB${drawDigits(rand, 12)}` : null;
    transactions.push(makeTransaction(rand, vendor.key, date, amount, "NEFT", ewayBill));
  }
  return transactions;
}

export function buildTransactions(vendors: SampleVendor[]): SampleTransaction[] {
  const rand = makeRandom(2026);
  const transactions: SampleTransaction[] = [];

  for (const vendor of vendors) {
    if (RING_KEYS.has(vendor.key)) {
      transactions.push(...buildRingTransactions(rand, vendor));
    } else if (PAIR_KEYS.has(vendor.key)) {
      transactions.push(...buildPairTransactions(rand, vendor));
    } else if (NEVER_CAPTURED_KEYS.has(vendor.key)) {
      transactions.push(...buildNeverCapturedTransactions(rand, vendor));
    } else {
      transactions.push(...buildOrdinaryTransactions(rand, vendor));
    }
  }

  return transactions;
}
