import type { AlertKind, AlertView, JobHealth } from "@alibi/contracts";
import type { MemoryStore } from "../store/memory.js";
import { humanDate, rupees } from "./format.js";

/** ITC claimed on invoices dated inside the window a retrospective cancellation opened. */
function itcInsideWindow(store: MemoryStore, vendorId: string, from: string, captureDate: string): number {
  let total = 0;
  for (const transaction of store.transactions(vendorId)) {
    if (transaction.date >= from && transaction.date < captureDate) total += transaction.itc_claimed;
  }
  return total;
}

/**
 * Every alert is a difference between two consecutive sealed captures, so nothing is
 * announced that the record cannot show. Newest first.
 */
export function alertsFor(store: MemoryStore): AlertView[] {
  const alerts: AlertView[] = [];

  for (const vendor of store.vendors()) {
    const observations = [...store.snapshots(vendor.id)]
      .filter((snapshot) => snapshot.lookup_ok && snapshot.status !== null)
      .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

    for (let i = 1; i < observations.length; i++) {
      const previous = observations[i - 1]!;
      const current = observations[i]!;
      const date = current.captured_at.slice(0, 10);
      const recorded = humanDate(date);
      const push = (kind: AlertKind, sentence: string, itc_at_risk = 0) => {
        alerts.push({
          id: `${vendor.id}:${current.seq}:${kind}`,
          vendor: { id: vendor.id, legal_name: vendor.legal_name, gstin: vendor.gstin },
          kind,
          sentence,
          date,
          itc_at_risk,
          source: current.source,
        });
      };

      if (previous.cancellation_date === null && current.cancellation_date !== null) {
        const effective = current.cancellation_date;
        if (effective < date) {
          const itc = itcInsideWindow(store, vendor.id, effective, date);
          push(
            "retrospective_cancellation",
            `${vendor.legal_name}'s registration was cancelled with effect from ${humanDate(effective)}, recorded on ${recorded}. ITC of ${rupees(itc)} on transactions inside that period is at risk.`,
            itc,
          );
        } else {
          push(
            "cancellation",
            `${vendor.legal_name}'s registration was cancelled with effect from ${humanDate(effective)}, recorded on ${recorded}.`,
          );
        }
      }

      if (previous.status !== current.status) {
        push(
          "status_changed",
          `${vendor.legal_name}'s registration status changed from ${previous.status} to ${current.status}, recorded on ${recorded}.`,
        );
      }

      if (previous.returns_current === true && current.returns_current === false) {
        push("filing_gap", `${vendor.legal_name} was no longer current on GSTR-3B at the capture on ${recorded}.`);
      }

      if (previous.block_status !== current.block_status) {
        push(
          "block_status_changed",
          `${vendor.legal_name}'s e-way bill block status changed from ${previous.block_status} to ${current.block_status}, recorded on ${recorded}.`,
        );
      }
    }
  }

  return alerts.sort(
    (a, b) => b.date.localeCompare(a.date) || a.vendor.legal_name.localeCompare(b.vendor.legal_name),
  );
}

/** Honest about what is and is not scheduled. Sample mode never re-captures anything. */
export function jobHealth(store: MemoryStore, sample: boolean): JobHealth {
  let last: string | null = null;
  for (const vendor of store.vendors()) {
    for (const snapshot of store.snapshots(vendor.id)) {
      if (last === null || snapshot.captured_at > last) last = snapshot.captured_at;
    }
  }
  return {
    active: !sample,
    last_run: last,
    next_run: null,
    stale: false,
    note: sample
      ? "Scheduled re-captures run in live mode only. The sample register is replayed from its history."
      : "Scheduled re-captures are not configured yet.",
  };
}
