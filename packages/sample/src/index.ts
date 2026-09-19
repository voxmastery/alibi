import { buildVendors } from "./vendors.js";
import { buildCaptures, sampleMonths } from "./payloads.js";
import { buildTransactions } from "./transactions.js";

export interface SampleVendor {
  key: string;
  legal_name: string;
  trade_name: string;
  gstin: string;
  pan: string;
  state: string;
  state_code: string;
  address: string;
  bank_account: string;
  phone: string;
  email: string;
  filing_ip: string;
  registered_on: string;
  aadhaar_authenticated: boolean;
}

export interface LookupEnvelope {
  provider: "sample" | "gstinapi";
  requested_at: string;
  gstin: string;
  http_status: number;
  taxpayer: Record<string, unknown> | null;
  returns: Array<Record<string, unknown>> | null;
}

export interface SampleCapture {
  vendor_key: string;
  captured_at: string;
  envelope: LookupEnvelope;
}

export interface SampleTransaction {
  vendor_key: string;
  invoice_no: string;
  date: string;
  amount: number;
  itc_claimed: number;
  payment_mode: string;
  eway_bill: string | null;
}

export interface SampleDataset {
  vendors: SampleVendor[];
  captures: SampleCapture[];
  transactions: SampleTransaction[];
  months: string[];
}

/**
 * Composes the deterministic sample register: 36 labelled vendors, their monthly
 * GSTIN-lookup captures (provider-shaped envelopes), and their invoice history.
 * Every internal generator is freshly seeded on each call, so two calls to this
 * function always produce byte-identical JSON.
 */
export function buildSampleDataset(): SampleDataset {
  const vendors = buildVendors();
  const captures = buildCaptures(vendors);
  const transactions = buildTransactions(vendors);
  const months = sampleMonths();
  return { vendors, captures, transactions, months };
}
