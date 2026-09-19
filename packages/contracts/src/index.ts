/** Types shared by the API and the web app. Field names are the contract. */

export type Band = "clear" | "watch" | "flagged" | "unknown";
export type Severity = "info" | "low" | "medium" | "high" | "critical" | "positive";
export type RecordSource = "sample" | "upload" | "check" | "gstinapi";
export type EdgeAttribute = "pan" | "bank_account" | "address" | "phone" | "email" | "filing_ip";

/** GET /api/mode */
export interface ModeInfo {
  /** True when no provider key is configured: every capture is from the sample register. */
  sample: boolean;
  provider: "gstinapi" | "none";
  /** Sentence shown in the app-wide banner when sample is true. */
  banner: string | null;
}

export interface RegisterFacts {
  gstin: string;
  legal_name: string;
  trade_name: string | null;
  status: string;
  taxpayer_type: string | null;
  business_constitution: string | null;
  registration_date: string | null;
  cancellation_date: string | null;
  state: string | null;
  address: string | null;
  einvoice_status: string | null;
  block_status: string | null;
}

export interface FilingPeriod {
  return_type: "GSTR1" | "GSTR3B";
  /** YYYY-MM */
  period: string;
  filing_status: "filed" | "not_filed" | "not_due";
  filing_date: string | null;
}

export interface ChainVerification {
  verified: boolean;
  links: number;
  first_broken: number | null;
}

export interface SealedRecord {
  seq: number;
  /** ISO instant, UTC */
  captured_at: string;
  payload_hash: string;
  prev_hash: string;
  source: RecordSource;
  lookup_ok: boolean;
  error: string | null;
  verification: ChainVerification;
}

export interface FindingView {
  severity: Severity;
  weight: number;
  message: string;
  as_of: string;
}

export interface VendorRef {
  id: string;
  legal_name: string;
  gstin: string;
}

export interface NetworkSignal {
  attribute: EdgeAttribute;
  /** Plain sentence, e.g. "Shares bank account XXXX4471 with Kavach Supplies Co." */
  sentence: string;
  vendors: VendorRef[];
}

export interface Verdict {
  band: Band;
  score: number | null;
  /** One or two complete sentences. */
  sentence: string;
  as_of: string;
}

/** POST /api/checks response and GET /api/checks/:id */
export interface CheckResult {
  id: string;
  vendor: VendorRef & { tracking: "checked" | "tracked"; watched: boolean; source: RecordSource };
  mode: "sample" | "live";
  verdict: Verdict;
  facts: RegisterFacts | null;
  filing: FilingPeriod[];
  network: NetworkSignal[];
  findings: FindingView[];
  sealed: SealedRecord;
}

/** GET /api/vendors rows */
export interface VendorRow {
  id: string;
  gstin: string;
  legal_name: string;
  trade_name: string | null;
  band: Band;
  score: number | null;
  last_capture: string | null;
  filing_status: "current" | "gap" | "unknown";
  /** ITC on transactions inside a retrospectively cancelled period. */
  itc_at_risk: number;
  watched: boolean;
  tracking: "checked" | "tracked";
  source: RecordSource;
}

export interface VendorRecordView {
  id: string;
  gstin: string;
  legal_name: string;
  trade_name: string | null;
  pan: string | null;
  state: string | null;
  address: string | null;
  registered_on: string | null;
  bank_account_masked: string | null;
  phone: string | null;
  email: string | null;
  filing_ip: string | null;
  tracking: "checked" | "tracked";
  watched: boolean;
  source: RecordSource;
}

export interface SnapshotView {
  seq: number;
  captured_at: string;
  source: RecordSource;
  lookup_ok: boolean;
  error: string | null;
  status: string | null;
  returns_current: boolean | null;
  cancellation_date: string | null;
  payload_hash: string;
  prev_hash: string;
}

export interface TransactionView {
  invoice_no: string;
  date: string;
  amount: number;
  itc_claimed: number;
  payment_mode: string;
  eway_bill: string | null;
  status_on_date: string | null;
  returns_current_on_date: boolean | null;
  snapshot_hash: string | null;
  source: RecordSource;
}

/** GET /api/vendors/:id */
export interface VendorDetail {
  vendor: VendorRecordView;
  as_of: string;
  verdict: Verdict;
  findings: FindingView[];
  snapshots: SnapshotView[];
  transactions: TransactionView[];
  chain: ChainVerification;
}

/** GET /api/network */
export interface NetworkNode {
  id: string;
  legal_name: string;
  gstin: string;
  band: Band;
  score: number | null;
  /** Total purchase value up to as_of, for node size. */
  value: number;
  community: number;
  source: RecordSource;
  exists: boolean;
}

export interface NetworkEdge {
  source: string;
  target: string;
  attribute: EdgeAttribute;
}

export interface NetworkConnection {
  sentence: string;
  vendor_ids: string[];
  attribute: EdgeAttribute;
}

export interface NetworkGraph {
  as_of: string;
  months: string[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  connections: NetworkConnection[];
}

/** GET /api/vendors/:id/defence?format=json */
export interface DefenceFile {
  vendor: { legal_name: string; gstin: string; pan: string | null };
  as_of: string;
  sample: boolean;
  transactions: TransactionView[];
  snapshots: SnapshotView[];
  chain: ChainVerification & { root_hash: string; head_hash: string | null };
  /** Sentences computed from the record, never asserted. */
  statement: string[];
  notice: string;
}

/** GET /api/vendors/:id/chain and POST /api/verify body */
export interface ChainExport {
  vendor: VendorRef;
  exported_as_of: string;
  links: Array<{ seq: number; payload_raw: string; payload_hash: string; prev_hash: string }>;
}

export interface VerifyResult {
  verified: boolean;
  links: number;
  first_broken: number | null;
  verdicts: Array<{ seq: number; ok: boolean; reason: string }>;
}

export type AlertKind = "status_changed" | "filing_gap" | "cancellation" | "retrospective_cancellation" | "block_status_changed";

export interface AlertView {
  id: string;
  vendor: VendorRef;
  kind: AlertKind;
  sentence: string;
  date: string;
  itc_at_risk: number;
  source: RecordSource;
}

export interface JobHealth {
  active: boolean;
  last_run: string | null;
  next_run: string | null;
  stale: boolean;
  note: string;
}

export interface ImportError {
  row: number;
  column: string;
  message: string;
}

/** POST /api/vendors/import */
export interface ImportRequest {
  kind: "vendors" | "transactions";
  csv: string;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  errors: ImportError[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; field?: string };
}
