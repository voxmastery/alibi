import { toHex, verifyChain } from "@alibi/core";
import type {
  ChainExport, ChainVerification, SnapshotView, TransactionView, VendorDetail, VendorRecordView, VendorRow,
} from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import type { SnapshotRecord, VendorRecord } from "../store/types.js";
import { evaluateOrg, toFindingViews, verdictFor } from "./risk.js";
import { maskAccount, todayIso } from "./format.js";

/** The capture in force on a date: the latest successful one captured on or before it. */
export function observationOnDate(snapshots: readonly SnapshotRecord[], date: string): SnapshotRecord | undefined {
  let found: SnapshotRecord | undefined;
  for (const snapshot of snapshots) {
    if (!snapshot.lookup_ok) continue;
    if (snapshot.captured_at.slice(0, 10) > date) continue;
    if (!found || snapshot.captured_at > found.captured_at) found = snapshot;
  }
  return found;
}

const ascending = (snapshots: readonly SnapshotRecord[]): SnapshotRecord[] =>
  [...snapshots].sort((a, b) => a.seq - b.seq);

/** ITC claimed on invoices dated inside a retrospectively cancelled window that the capture revealed. */
function itcAtRisk(store: MemoryStore, vendorId: string, from: string, captureDate: string): number {
  let total = 0;
  for (const transaction of store.transactions(vendorId)) {
    if (transaction.date >= from && transaction.date < captureDate) total += transaction.itc_claimed;
  }
  return total;
}

export function vendorRecordView(vendor: VendorRecord): VendorRecordView {
  return {
    id: vendor.id,
    gstin: vendor.gstin,
    legal_name: vendor.legal_name,
    trade_name: vendor.trade_name,
    pan: vendor.pan,
    state: vendor.state,
    address: vendor.address,
    registered_on: vendor.registered_on,
    bank_account_masked: maskAccount(vendor.bank_account),
    phone: vendor.phone,
    email: vendor.email,
    filing_ip: vendor.filing_ip,
    tracking: vendor.tracking,
    watched: vendor.watched,
    source: vendor.source,
  };
}

export function snapshotView(snapshot: SnapshotRecord): SnapshotView {
  return {
    seq: snapshot.seq,
    captured_at: snapshot.captured_at,
    source: snapshot.source,
    lookup_ok: snapshot.lookup_ok,
    error: snapshot.error,
    status: snapshot.status,
    returns_current: snapshot.returns_current,
    cancellation_date: snapshot.cancellation_date,
    payload_hash: toHex(snapshot.payload_hash),
    prev_hash: toHex(snapshot.prev_hash),
  };
}

/** The table rows: one line per vendor, every number derived from the sealed record. */
export function vendorRows(store: MemoryStore, asOf: string): VendorRow[] {
  const results = evaluateOrg(store, asOf);
  return store.vendors().map((vendor) => {
    const snapshots = ascending(store.snapshots(vendor.id));
    const latest = snapshots[snapshots.length - 1];
    const observation = observationOnDate(snapshots, asOf);
    const result = results.get(vendor.id);
    const filing_status =
      observation && observation.returns_current === true
        ? "current"
        : observation && observation.returns_current === false
          ? "gap"
          : "unknown";
    const retrospective = observation?.retrospective_from ?? null;
    return {
      id: vendor.id,
      gstin: vendor.gstin,
      legal_name: vendor.legal_name,
      trade_name: vendor.trade_name,
      band: result?.band ?? "unknown",
      score: result?.score ?? null,
      last_capture: latest?.captured_at ?? null,
      filing_status,
      itc_at_risk:
        retrospective && observation ? itcAtRisk(store, vendor.id, retrospective, observation.captured_at.slice(0, 10)) : 0,
      watched: vendor.watched,
      tracking: vendor.tracking,
      source: vendor.source,
    };
  });
}

/** Builds the transaction views for one vendor, each stamped with the capture in force on its date. */
export function transactionViews(store: MemoryStore, vendorId: string, snapshots: readonly SnapshotRecord[], upTo: string | null): TransactionView[] {
  return [...store.transactions(vendorId)]
    .filter((transaction) => upTo === null || transaction.date <= upTo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.invoice_no.localeCompare(b.invoice_no))
    .map((transaction) => {
      const observation = observationOnDate(snapshots, transaction.date);
      return {
        invoice_no: transaction.invoice_no,
        date: transaction.date,
        amount: transaction.amount,
        itc_claimed: transaction.itc_claimed,
        payment_mode: transaction.payment_mode,
        eway_bill: transaction.eway_bill,
        status_on_date: observation?.status ?? null,
        returns_current_on_date: observation?.returns_current ?? null,
        snapshot_hash: observation ? toHex(observation.payload_hash) : null,
      source: transaction.source,
      };
    });
}

export function toChainVerification(verdict: { verified: boolean; links: number; firstBroken: number | null }): ChainVerification {
  return { verified: verdict.verified, links: verdict.links, first_broken: verdict.firstBroken };
}

/** Everything one vendor page shows, as of a date. */
export async function vendorDetail(store: MemoryStore, id: string, asOf: string): Promise<VendorDetail | null> {
  const vendor = store.vendor(id);
  if (!vendor) return null;
  const snapshots = ascending(store.snapshots(id));
  const result = evaluateOrg(store, asOf).get(id);
  const verdict = result
    ? verdictFor(result, { sample: vendor.source === "sample", hasCapture: snapshots.some((s) => s.lookup_ok) })
    : { band: "unknown" as const, score: null, as_of: asOf, sentence: "No successful capture exists for this GSTIN yet, so nothing can be said about it. Absence of record is stated as absence." };
  const chain = await verifyChain(store.chainFor(id));
  return {
    vendor: vendorRecordView(vendor),
    as_of: asOf,
    verdict,
    findings: toFindingViews(result?.findings ?? []),
    snapshots: snapshots.map(snapshotView),
    transactions: transactionViews(store, id, snapshots, null),
    chain: toChainVerification(chain),
  };
}

/** The portable chain: hex hashes and the raw payloads, verifiable by anyone. */
export function chainExport(store: MemoryStore, id: string, now: Date = new Date()): ChainExport | null {
  const vendor = store.vendor(id);
  if (!vendor) return null;
  return {
    vendor: { id: vendor.id, legal_name: vendor.legal_name, gstin: vendor.gstin },
    exported_as_of: todayIso(now),
    links: store.chainFor(id).map((link) => ({
      seq: link.seq,
      payload_raw: link.payload_raw,
      payload_hash: toHex(link.payload_hash),
      prev_hash: toHex(link.prev_hash),
    })),
  };
}
