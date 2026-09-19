import type { LookupEnvelope } from "@alibi/sample";
export type { LookupEnvelope };

export interface LookupOutcome {
  ok: boolean;
  envelope: LookupEnvelope;
  error: string | null;
}

export interface RegisterLookup {
  readonly provider: "sample" | "gstinapi";
  lookup(gstin: string, requestedAt: string): Promise<LookupOutcome>;
}
