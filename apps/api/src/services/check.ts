import { randomUUID } from "node:crypto";
import { isValidGstin, normaliseGstin, toHex, verifyChain } from "@alibi/core";
import type { CheckResult, RegisterFacts } from "@alibi/contracts";
import { ApiError } from "../errors.js";
import { PARSER_VERSION, emptyParsed, parseEnvelope } from "../lookup/parse.js";
import type { RegisterLookup } from "../lookup/types.js";
import type { MemoryStore } from "../store/memory.js";
import type { VendorRecord } from "../store/types.js";
import { networkSignalsFor } from "./network.js";
import { evaluateOrg, toFindingViews, verdictFor } from "./risk.js";
import { todayIso } from "./format.js";

export interface CheckContext {
  store: MemoryStore;
  lookup: RegisterLookup;
  sample: boolean;
  now(): Date;
}

/**
 * One check: validate, spend a lookup, seal whatever came back — success or failure —
 * then evaluate the whole register and report a verdict in sentences.
 */
export async function runCheck(ctx: CheckContext, gstinInput: string): Promise<CheckResult> {
  const gstin = normaliseGstin(gstinInput);
  if (!isValidGstin(gstin)) {
    throw new ApiError(
      400,
      "invalid_gstin",
      "That is not a valid GSTIN: it must be 15 characters and the last character is a check digit.",
      "gstin",
    );
  }

  const { store } = ctx;
  const requestedAt = ctx.now().toISOString();
  const outcome = await ctx.lookup.lookup(gstin, requestedAt);
  const parsed = outcome.ok ? parseEnvelope(outcome.envelope, requestedAt) : emptyParsed();

  const existing = store.vendorByGstin(gstin);
  let vendor: VendorRecord;
  if (!existing) {
    vendor = store.upsertVendor({
      gstin,
      legal_name: parsed.legal_name ?? gstin,
      trade_name: parsed.trade_name,
      pan: gstin.slice(2, 12),
      state: parsed.state,
      address: parsed.address,
      registered_on: parsed.registration_date,
      bank_account: null,
      phone: null,
      email: null,
      filing_ip: null,
      aadhaar_authenticated: null,
      tracking: "checked",
      watched: false,
      source: "check",
    });
  } else if (outcome.ok) {
    // The register is authoritative for the name, state, address and registration date;
    // the store keeps the attributes the operator supplied.
    vendor = store.upsertVendor({
      gstin: existing.gstin,
      legal_name: parsed.legal_name ?? existing.legal_name,
      trade_name: parsed.trade_name ?? existing.trade_name,
      pan: existing.pan ?? gstin.slice(2, 12),
      state: parsed.state ?? existing.state,
      address: parsed.address ?? existing.address,
      registered_on: parsed.registration_date ?? existing.registered_on,
      bank_account: existing.bank_account,
      phone: existing.phone,
      email: existing.email,
      filing_ip: existing.filing_ip,
      aadhaar_authenticated: existing.aadhaar_authenticated,
      tracking: existing.tracking,
      watched: existing.watched,
      source: existing.source,
    });
  } else {
    vendor = existing;
  }

  const snapshot = await store.appendSnapshot(vendor.id, {
    captured_at: requestedAt,
    source: ctx.lookup.provider,
    lookup_ok: outcome.ok,
    error: outcome.error,
    payload_raw: JSON.stringify(outcome.envelope),
    parsed,
    parser_version: PARSER_VERSION,
  });

  const verification = await verifyChain(store.chainFor(vendor.id));
  const asOf = todayIso(ctx.now());
  const risk = evaluateOrg(store, asOf).get(vendor.id)!;

  const facts: RegisterFacts | null = outcome.ok
    ? {
        gstin,
        legal_name: parsed.legal_name ?? vendor.legal_name,
        trade_name: parsed.trade_name,
        status: parsed.status ?? "",
        taxpayer_type: parsed.taxpayer_type,
        business_constitution: parsed.business_constitution,
        registration_date: parsed.registration_date,
        cancellation_date: parsed.cancellation_date,
        state: parsed.state,
        address: parsed.address,
        einvoice_status: parsed.einvoice_status,
        block_status: parsed.block_status,
      }
    : null;

  const result: CheckResult = {
    id: randomUUID(),
    vendor: {
      id: vendor.id,
      legal_name: vendor.legal_name,
      gstin: vendor.gstin,
      tracking: vendor.tracking,
      watched: vendor.watched,
      source: vendor.source,
    },
    mode: ctx.sample ? "sample" : "live",
    verdict: verdictFor(risk, { sample: ctx.sample, hasCapture: outcome.ok }),
    facts,
    filing: parsed.filing.slice(-24),
    network: networkSignalsFor(store, vendor.id, asOf),
    findings: toFindingViews(risk.findings),
    sealed: {
      seq: snapshot.seq,
      captured_at: snapshot.captured_at,
      payload_hash: toHex(snapshot.payload_hash),
      prev_hash: toHex(snapshot.prev_hash),
      source: snapshot.source,
      lookup_ok: snapshot.lookup_ok,
      error: snapshot.error,
      verification: {
        verified: verification.verified,
        links: verification.links,
        first_broken: verification.firstBroken,
      },
    },
  };

  store.saveCheck({ id: result.id, vendor_id: vendor.id, created_at: requestedAt, result });
  return result;
}
