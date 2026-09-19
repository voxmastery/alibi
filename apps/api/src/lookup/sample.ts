import { buildSampleDataset, type SampleCapture } from "@alibi/sample";
import type { LookupOutcome, RegisterLookup } from "./types.js";

/** Answers from the sample register: the latest sample capture on or before the requested instant. */
export class SampleLookup implements RegisterLookup {
  readonly provider = "sample" as const;
  private readonly capturesByGstin = new Map<string, SampleCapture[]>();

  constructor() {
    const data = buildSampleDataset();
    const gstinByKey = new Map(data.vendors.map((v) => [v.key, v.gstin]));
    for (const capture of data.captures) {
      const gstin = gstinByKey.get(capture.vendor_key)!;
      const list = this.capturesByGstin.get(gstin) ?? [];
      list.push(capture);
      this.capturesByGstin.set(gstin, list);
    }
    for (const list of this.capturesByGstin.values()) list.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  }

  async lookup(gstin: string, requestedAt: string): Promise<LookupOutcome> {
    const list = this.capturesByGstin.get(gstin) ?? [];
    const latest = [...list].reverse().find((c) => c.captured_at <= requestedAt) ?? list[list.length - 1];
    if (!latest) {
      return {
        ok: false,
        error: "This GSTIN is not in the sample register. Live lookups need a provider key.",
        envelope: { provider: "sample", requested_at: requestedAt, gstin, http_status: 404, taxpayer: null, returns: null },
      };
    }
    return { ok: true, error: null, envelope: { ...latest.envelope, requested_at: requestedAt } };
  }
}
