export type Severity = "info" | "low" | "medium" | "high" | "critical" | "positive";
export type Band = "clear" | "watch" | "flagged" | "unknown";
export type EdgeAttribute = "pan" | "bank_account" | "address" | "phone" | "email" | "filing_ip";

export interface VendorInput {
  id: string;
  legal_name: string;
  state: string;
  /** YYYY-MM-DD. A vendor registered after as_of does not exist for that evaluation. */
  registered_on: string;
  pan?: string | null;
  bank_account?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  filing_ip?: string | null;
  /** true or false when the register says so; null or undefined when unknown. */
  aadhaar_authenticated?: boolean | null;
}

export interface SnapshotInput {
  vendor_id: string;
  /** ISO date or datetime. Only the first ten characters are compared. */
  captured_at: string;
  lookup_ok: boolean;
  status: string | null;
  returns_current: boolean | null;
  retrospective_from: string | null;
}

export interface TransactionInput {
  vendor_id: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  itc_claimed: number;
  payment_mode: string;
  eway_bill: string | null;
}

export interface EdgeInput {
  from_vendor: string;
  to_vendor: string;
  attribute: EdgeAttribute;
  value: string;
}

export interface Finding {
  rule_id: string;
  severity: Severity;
  weight: number;
  message: string;
  as_of: string;
}

export interface RiskResult {
  vendor_id: string;
  as_of: string;
  score: number | null;
  band: Band;
  findings: Finding[];
}

export interface RiskInput {
  /** YYYY-MM-DD. Findings are computed from what was known on this date. */
  as_of: string;
  vendors: VendorInput[];
  snapshots: SnapshotInput[];
  transactions: TransactionInput[];
  edges: EdgeInput[];
}

/** A successful capture with a status: the only kind of snapshot the rules read. */
export interface Observation {
  captured_at: string;
  status: string;
  returns_current: boolean | null;
  retrospective_from: string | null;
}
