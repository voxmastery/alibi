import { randomUUID } from "node:crypto";
import { ZERO_HASH, sealPayload, type ChainLink } from "@alibi/core";
import type { EdgeAttribute } from "@alibi/contracts";
import type {
  CheckRecord, EdgeRecord, SnapshotInputRecord, SnapshotRecord,
  TransactionRecord, VendorInputRecord, VendorRecord,
} from "./types.js";

export const DEV_ORG_ID = "00000000-0000-4000-8000-000000000001";
const EDGE_ATTRIBUTES: EdgeAttribute[] = ["pan", "bank_account", "address", "phone", "email", "filing_ip"];

/**
 * In-memory store shaped like the Postgres rows the later milestones write.
 * Snapshots are append-only: records are frozen and per-vendor arrays are replaced, never mutated.
 */
export class MemoryStore {
  readonly orgId: string;
  private readonly vendorsById = new Map<string, VendorRecord>();
  private readonly snapshotsByVendor = new Map<string, readonly SnapshotRecord[]>();
  private readonly transactionsByVendor = new Map<string, readonly TransactionRecord[]>();
  private edgeList: readonly EdgeRecord[] = [];
  private readonly checksById = new Map<string, CheckRecord>();

  constructor(orgId: string = DEV_ORG_ID) {
    this.orgId = orgId;
  }

  vendors(): VendorRecord[] {
    return [...this.vendorsById.values()].sort((a, b) => a.legal_name.localeCompare(b.legal_name));
  }

  vendor(id: string): VendorRecord | undefined {
    return this.vendorsById.get(id);
  }

  vendorByGstin(gstin: string): VendorRecord | undefined {
    for (const vendor of this.vendorsById.values()) if (vendor.gstin === gstin) return vendor;
    return undefined;
  }

  /** Insert or update by GSTIN. User-supplied attributes (bank, phone, email, filing IP) are never overwritten with null. */
  upsertVendor(input: VendorInputRecord): VendorRecord {
    const existing = this.vendorByGstin(input.gstin);
    const merged: VendorRecord = Object.freeze({
      ...(existing ?? {}),
      ...input,
      bank_account: input.bank_account ?? existing?.bank_account ?? null,
      phone: input.phone ?? existing?.phone ?? null,
      email: input.email ?? existing?.email ?? null,
      filing_ip: input.filing_ip ?? existing?.filing_ip ?? null,
      id: existing?.id ?? input.id ?? randomUUID(),
      org_id: this.orgId,
      created_at: existing?.created_at ?? new Date().toISOString(),
    });
    this.vendorsById.set(merged.id, merged);
    this.recomputeEdgesFor(merged.id);
    return merged;
  }

  setVendorFlags(id: string, flags: { tracking?: "checked" | "tracked"; watched?: boolean }): VendorRecord {
    const existing = this.vendorsById.get(id);
    if (!existing) throw new Error(`vendor ${id} not found`);
    const updated = Object.freeze({ ...existing, ...flags });
    this.vendorsById.set(id, updated);
    return updated;
  }

  snapshots(vendorId: string): readonly SnapshotRecord[] {
    return this.snapshotsByVendor.get(vendorId) ?? [];
  }

  async appendSnapshot(vendorId: string, input: SnapshotInputRecord): Promise<SnapshotRecord> {
    if (!this.vendorsById.has(vendorId)) throw new Error(`vendor ${vendorId} not found`);
    if (!input.lookup_ok && input.error === null) throw new Error("a failed lookup must carry an error");
    if (!input.lookup_ok && input.parsed.status !== null) throw new Error("a failed lookup must not carry a status");
    const existing = this.snapshots(vendorId);
    const last = existing[existing.length - 1];
    const prev = last ? last.payload_hash : ZERO_HASH;
    const sealed = await sealPayload(prev, input.payload_raw);
    const record: SnapshotRecord = Object.freeze({
      ...input.parsed,
      id: randomUUID(),
      org_id: this.orgId,
      vendor_id: vendorId,
      seq: existing.length + 1,
      captured_at: input.captured_at,
      source: input.source,
      lookup_ok: input.lookup_ok,
      error: input.error,
      payload_raw: input.payload_raw,
      payload_hash: sealed.payload_hash,
      prev_hash: prev,
      parser_version: input.parser_version,
    });
    this.snapshotsByVendor.set(vendorId, Object.freeze([...existing, record]));
    return record;
  }

  chainFor(vendorId: string): ChainLink[] {
    return this.snapshots(vendorId).map((s) => ({
      seq: s.seq, payload_raw: s.payload_raw, payload_hash: s.payload_hash, prev_hash: s.prev_hash,
    }));
  }

  transactions(vendorId: string): readonly TransactionRecord[] {
    return this.transactionsByVendor.get(vendorId) ?? [];
  }

  allTransactions(): TransactionRecord[] {
    return [...this.transactionsByVendor.values()].flat();
  }

  addTransactions(records: Array<Omit<TransactionRecord, "id" | "org_id">>): TransactionRecord[] {
    const added: TransactionRecord[] = [];
    for (const input of records) {
      const record: TransactionRecord = Object.freeze({ ...input, id: randomUUID(), org_id: this.orgId });
      const existing = this.transactions(record.vendor_id);
      this.transactionsByVendor.set(record.vendor_id, Object.freeze([...existing, record]));
      added.push(record);
    }
    return added;
  }

  edges(): readonly EdgeRecord[] {
    return this.edgeList;
  }

  saveCheck(record: CheckRecord): void {
    this.checksById.set(record.id, record);
  }

  check(id: string): CheckRecord | undefined {
    return this.checksById.get(id);
  }

  /** Recompute this vendor's edges against every other vendor. R2 moves this into SQL. */
  private recomputeEdgesFor(vendorId: string): void {
    const vendor = this.vendorsById.get(vendorId)!;
    const kept = this.edgeList.filter((e) => e.from_vendor !== vendorId && e.to_vendor !== vendorId);
    const fresh: EdgeRecord[] = [];
    for (const other of this.vendorsById.values()) {
      if (other.id === vendorId) continue;
      for (const attribute of EDGE_ATTRIBUTES) {
        const value = vendor[attribute];
        if (!value || value !== other[attribute]) continue;
        if (attribute === "address" && vendor.pan && vendor.pan === other.pan) continue;
        const [from_vendor, to_vendor] = vendor.id < other.id ? [vendor.id, other.id] : [other.id, vendor.id];
        fresh.push(Object.freeze({ org_id: this.orgId, from_vendor, to_vendor, attribute, value }));
      }
    }
    this.edgeList = Object.freeze([...kept, ...fresh]);
  }
}
