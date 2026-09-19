import { buildSampleDataset } from "@alibi/sample";
import { PARSER_VERSION, parseEnvelope } from "../lookup/parse.js";
import type { MemoryStore } from "./memory.js";

export interface SampleLoadResult {
  vendors: number;
  captures: number;
  transactions: number;
}

/** Loads the sample register once. Every record is source "sample". A second call inserts nothing. */
export async function loadSample(store: MemoryStore): Promise<SampleLoadResult> {
  const data = buildSampleDataset();
  if (store.vendors().some((v) => v.source === "sample")) return { vendors: 0, captures: 0, transactions: 0 };
  const idByKey = new Map<string, string>();
  for (const v of data.vendors) {
    const record = store.upsertVendor({
      gstin: v.gstin, legal_name: v.legal_name, trade_name: v.trade_name, pan: v.pan, state: v.state,
      address: v.address, registered_on: v.registered_on, bank_account: v.bank_account, phone: v.phone,
      email: v.email, filing_ip: v.filing_ip, aadhaar_authenticated: v.aadhaar_authenticated,
      tracking: "tracked", watched: ["meridian", "kavach", "orbit", "trimurti"].includes(v.key), source: "sample",
    });
    idByKey.set(v.key, record.id);
  }
  const captures = [...data.captures].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  for (const c of captures) {
    await store.appendSnapshot(idByKey.get(c.vendor_key)!, {
      captured_at: c.captured_at, source: "sample", lookup_ok: true, error: null,
      payload_raw: JSON.stringify(c.envelope), parsed: parseEnvelope(c.envelope, c.captured_at), parser_version: PARSER_VERSION,
    });
  }
  store.addTransactions(data.transactions.map((t) => ({
    vendor_id: idByKey.get(t.vendor_key)!, invoice_no: t.invoice_no, date: t.date, amount: t.amount,
    itc_claimed: t.itc_claimed, payment_mode: t.payment_mode, eway_bill: t.eway_bill, source: "sample",
  })));
  return { vendors: data.vendors.length, captures: data.captures.length, transactions: data.transactions.length };
}
