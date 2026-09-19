import { toHex, verifyChain, type ChainLink } from "@alibi/core";
import type { DefenceFile } from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import { humanDate } from "./format.js";
import { snapshotView, toChainVerification, transactionViews } from "./vendor.js";

export const DEFENCE_NOTICE =
  "This record states what the public register showed on the dates listed. It is evidence, not legal advice.";

const ROOT_HASH = "0".repeat(64);

/**
 * The record one vendor's file rests on, as of a date. Every sentence in `statement` is
 * emitted only when the sealed record supports it; nothing is asserted on the reader's behalf.
 */
export async function defenceFile(
  store: MemoryStore,
  id: string,
  asOf: string,
  sample: boolean,
): Promise<DefenceFile | null> {
  const vendor = store.vendor(id);
  if (!vendor) return null;

  const snapshots = [...store.snapshots(id)]
    .filter((snapshot) => snapshot.captured_at.slice(0, 10) <= asOf)
    .sort((a, b) => a.seq - b.seq);
  const transactions = transactionViews(store, id, snapshots, asOf);

  const links: ChainLink[] = snapshots.map((snapshot) => ({
    seq: snapshot.seq,
    payload_raw: snapshot.payload_raw,
    payload_hash: snapshot.payload_hash,
    prev_hash: snapshot.prev_hash,
  }));
  const verdict = await verifyChain(links);
  const head = snapshots[snapshots.length - 1];

  const statement: string[] = [];
  statement.push(
    "On each transaction date listed, this GSTIN's recorded status and return-filing position are shown from the sealed capture in force on that date.",
  );

  if (transactions.length > 0) {
    const notActive = transactions.filter((t) => t.status_on_date !== "Active");
    statement.push(
      notActive.length === 0
        ? "The register showed this GSTIN as Active on every listed transaction date."
        : `On ${notActive.length} of ${transactions.length} listed dates the register did not show this GSTIN as Active, or no capture was in force.`,
    );
  }

  const cancelled = snapshots.find((snapshot) => snapshot.cancellation_date !== null);
  if (cancelled) {
    statement.push(
      `A cancellation was first recorded on ${humanDate(cancelled.captured_at)} with effect from ${humanDate(cancelled.cancellation_date!)}.`,
    );
    const captureDate = cancelled.captured_at.slice(0, 10);
    const onOrAfter = transactions.filter((t) => t.date >= captureDate);
    statement.push(
      onOrAfter.length === 0
        ? "Every listed transaction predates that capture."
        : `${onOrAfter.length} listed transactions fall on or after that capture.`,
    );
  }

  if (transactions.length > 0) {
    const cash = transactions.filter((t) => t.payment_mode.toLowerCase() === "cash");
    statement.push(
      cash.length === 0
        ? "All listed payments were made through banking channels."
        : `${cash.length} listed payments were made in cash.`,
    );
  }

  if (verdict.links > 0) {
    statement.push(
      verdict.verified
        ? `The capture chain of ${verdict.links} links recomputed correctly at export.`
        : `The capture chain failed verification at link ${verdict.firstBroken}. Every capture from that link onward must be treated as unreliable.`,
    );
  }

  return {
    vendor: { legal_name: vendor.legal_name, gstin: vendor.gstin, pan: vendor.pan },
    as_of: asOf,
    sample,
    transactions,
    snapshots: snapshots.map(snapshotView),
    chain: {
      ...toChainVerification(verdict),
      root_hash: ROOT_HASH,
      head_hash: head ? toHex(head.payload_hash) : null,
    },
    statement,
    notice: DEFENCE_NOTICE,
  };
}
