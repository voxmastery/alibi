import { isValidGstin, normaliseGstin } from "@alibi/core";
import type { ImportError } from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import type { TransactionRecord, VendorInputRecord } from "../store/types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The shape has to be right and the day has to exist: 2023-13-40 is not a date. */
function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const VENDOR_REQUIRED = ["gstin", "legal_name"] as const;
const VENDOR_OPTIONAL = [
  "trade_name", "pan", "state", "address", "registered_on", "bank_account", "phone", "email", "filing_ip",
] as const;

const TRANSACTION_REQUIRED = ["gstin", "invoice_no", "date", "amount", "itc_claimed", "payment_mode"] as const;
const TRANSACTION_OPTIONAL = ["eway_bill"] as const;

/**
 * RFC 4180: quoted fields may hold commas and newlines, a doubled quote is one quote,
 * CR LF and LF both end a record. A leading byte-order mark and blank records are dropped.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.some((value) => value.length > 0)) rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      if (input[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

interface Header {
  index: Map<string, number>;
  errors: ImportError[];
}

/** Reads the header row, naming every column it does not recognise and every required one it misses. */
function readHeader(rows: string[][], required: readonly string[], optional: readonly string[]): Header {
  const errors: ImportError[] = [];
  const index = new Map<string, number>();
  const header = rows[0] ?? [];
  const known = new Set<string>([...required, ...optional]);
  const unknown: ImportError[] = [];
  header.forEach((raw, position) => {
    const column = raw.trim().toLowerCase();
    if (!known.has(column)) {
      unknown.push({ row: 1, column: raw.trim(), message: "Unknown column." });
      return;
    }
    if (!index.has(column)) index.set(column, position);
  });
  // A missing required column stops the import, so it is named before the columns that
  // are merely ignored.
  for (const column of required) {
    if (!index.has(column)) errors.push({ row: 1, column, message: "Missing required column." });
  }
  errors.push(...unknown);
  return { index, errors };
}

const cell = (row: string[], index: Map<string, number>, column: string): string => {
  const position = index.get(column);
  return position === undefined ? "" : (row[position] ?? "").trim();
};

/** The vendor master: one row per GSTIN, every rejected row named by row number and column. */
export function validateVendorsCsv(rows: string[][]): { records: VendorInputRecord[]; errors: ImportError[] } {
  const { index, errors } = readHeader(rows, VENDOR_REQUIRED, VENDOR_OPTIONAL);
  const records: VendorInputRecord[] = [];
  if (!index.has("gstin") || !index.has("legal_name")) return { records, errors };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 1;
    const rowErrors: ImportError[] = [];
    const gstin = normaliseGstin(cell(row, index, "gstin"));
    const legalName = cell(row, index, "legal_name");
    const registeredOn = cell(row, index, "registered_on");

    if (!isValidGstin(gstin)) rowErrors.push({ row: rowNumber, column: "gstin", message: "Not a valid GSTIN." });
    if (legalName.length === 0) rowErrors.push({ row: rowNumber, column: "legal_name", message: "Required." });
    if (registeredOn.length > 0 && !isIsoDate(registeredOn)) {
      rowErrors.push({ row: rowNumber, column: "registered_on", message: "Must be a date in YYYY-MM-DD form." });
    }
    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    const optional = (column: string): string | null => {
      const value = cell(row, index, column);
      return value.length > 0 ? value : null;
    };
    records.push({
      gstin,
      legal_name: legalName,
      trade_name: optional("trade_name"),
      pan: optional("pan") ?? gstin.slice(2, 12),
      state: optional("state"),
      address: optional("address"),
      registered_on: registeredOn.length > 0 ? registeredOn : null,
      bank_account: optional("bank_account"),
      phone: optional("phone"),
      email: optional("email"),
      filing_ip: optional("filing_ip"),
      aadhaar_authenticated: null,
      tracking: "tracked",
      watched: false,
      source: "upload",
    });
  }
  return { records, errors };
}

function parseAmount(value: string): number | null {
  if (value.length === 0) return null;
  const amount = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

/** The invoice history: every row must point at a vendor that is already in the register. */
export function validateTransactionsCsv(
  rows: string[][],
  store: MemoryStore,
): { records: Array<Omit<TransactionRecord, "id" | "org_id">>; errors: ImportError[] } {
  const { index, errors } = readHeader(rows, TRANSACTION_REQUIRED, TRANSACTION_OPTIONAL);
  const records: Array<Omit<TransactionRecord, "id" | "org_id">> = [];
  if (TRANSACTION_REQUIRED.some((column) => !index.has(column))) return { records, errors };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNumber = i + 1;
    const rowErrors: ImportError[] = [];
    const gstin = normaliseGstin(cell(row, index, "gstin"));
    const vendor = isValidGstin(gstin) ? store.vendorByGstin(gstin) : undefined;
    const invoiceNo = cell(row, index, "invoice_no");
    const date = cell(row, index, "date");
    const amount = parseAmount(cell(row, index, "amount"));
    const itc = parseAmount(cell(row, index, "itc_claimed"));
    const paymentMode = cell(row, index, "payment_mode");
    const ewayBill = cell(row, index, "eway_bill");

    if (!vendor) {
      rowErrors.push({
        row: rowNumber,
        column: "gstin",
        message: "No vendor with this GSTIN. Import the vendor master first.",
      });
    }
    if (invoiceNo.length === 0) rowErrors.push({ row: rowNumber, column: "invoice_no", message: "Required." });
    if (!isIsoDate(date)) {
      rowErrors.push({ row: rowNumber, column: "date", message: "Must be a date in YYYY-MM-DD form." });
    }
    if (amount === null) {
      rowErrors.push({ row: rowNumber, column: "amount", message: "Must be a number of rupees, zero or more." });
    }
    if (itc === null) {
      rowErrors.push({ row: rowNumber, column: "itc_claimed", message: "Must be a number of rupees, zero or more." });
    }
    if (paymentMode.length === 0) rowErrors.push({ row: rowNumber, column: "payment_mode", message: "Required." });
    if (rowErrors.length > 0 || !vendor || amount === null || itc === null) {
      errors.push(...rowErrors);
      continue;
    }

    records.push({
      vendor_id: vendor.id,
      invoice_no: invoiceNo,
      date,
      amount,
      itc_claimed: itc,
      payment_mode: paymentMode,
      eway_bill: ewayBill.length > 0 ? ewayBill : null,
      source: "upload",
    });
  }
  return { records, errors };
}
