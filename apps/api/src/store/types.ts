import type { CheckResult, EdgeAttribute, FilingPeriod, RecordSource } from "@alibi/contracts";

export interface VendorRecord {
  readonly id: string;
  readonly org_id: string;
  readonly gstin: string;
  readonly legal_name: string;
  readonly trade_name: string | null;
  readonly pan: string | null;
  readonly state: string | null;
  readonly address: string | null;
  readonly registered_on: string | null;
  readonly bank_account: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly filing_ip: string | null;
  readonly aadhaar_authenticated: boolean | null;
  readonly tracking: "checked" | "tracked";
  readonly watched: boolean;
  readonly source: RecordSource;
  readonly created_at: string;
}

export type VendorInputRecord = Omit<VendorRecord, "id" | "org_id" | "created_at"> & { id?: string };

export interface ParsedSnapshot {
  readonly status: string | null;
  readonly taxpayer_type: string | null;
  readonly business_constitution: string | null;
  readonly registration_date: string | null;
  readonly cancellation_date: string | null;
  /** cancellation_date when it precedes the capture date and status is Cancelled. */
  readonly retrospective_from: string | null;
  readonly returns_current: boolean | null;
  /** YYYY-MM of the latest period with GSTR-3B filed. */
  readonly last_return_filed: string | null;
  readonly filing: readonly FilingPeriod[];
  readonly legal_name: string | null;
  readonly trade_name: string | null;
  readonly state: string | null;
  readonly address: string | null;
  readonly einvoice_status: string | null;
  readonly block_status: string | null;
}

export interface SnapshotRecord extends ParsedSnapshot {
  readonly id: string;
  readonly org_id: string;
  readonly vendor_id: string;
  readonly seq: number;
  readonly captured_at: string;
  readonly source: RecordSource;
  readonly lookup_ok: boolean;
  readonly error: string | null;
  readonly payload_raw: string;
  readonly payload_hash: Uint8Array;
  readonly prev_hash: Uint8Array;
  readonly parser_version: number;
}

export interface SnapshotInputRecord {
  captured_at: string;
  source: RecordSource;
  lookup_ok: boolean;
  error: string | null;
  payload_raw: string;
  parsed: ParsedSnapshot;
  parser_version: number;
}

export interface TransactionRecord {
  readonly id: string;
  readonly org_id: string;
  readonly vendor_id: string;
  readonly invoice_no: string;
  readonly date: string;
  readonly amount: number;
  readonly itc_claimed: number;
  readonly payment_mode: string;
  readonly eway_bill: string | null;
  readonly source: RecordSource;
}

export interface EdgeRecord {
  readonly org_id: string;
  readonly from_vendor: string;
  readonly to_vendor: string;
  readonly attribute: EdgeAttribute;
  readonly value: string;
}

export interface CheckRecord {
  readonly id: string;
  readonly vendor_id: string;
  readonly created_at: string;
  readonly result: CheckResult;
}
