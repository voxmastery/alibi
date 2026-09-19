import { Router } from "express";
import { z } from "zod";
import { fromHex, verifyChain, type LinkReason } from "@alibi/core";
import type { VerifyResult } from "@alibi/contracts";
import { parseOrThrow } from "../errors.js";

const MAX_LINKS = 5_000;
const hex = z.string().regex(/^[0-9a-f]{64}$/, "Hashes must be 64 lowercase hexadecimal characters.");

const chainExportBody = z.object({
  vendor: z.object({ id: z.string(), legal_name: z.string(), gstin: z.string() }),
  exported_as_of: z.string(),
  links: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        payload_raw: z.string(),
        payload_hash: hex,
        prev_hash: hex,
      }),
    )
    .max(MAX_LINKS, `A chain of more than ${MAX_LINKS} links cannot be verified in one request.`),
});

/** One plain sentence per link, so a reader can see exactly where a chain stopped holding. */
const REASONS: Record<LinkReason, string> = {
  ok: "Recomputed correctly.",
  seq_gap: "A capture is missing from the sequence.",
  bad_prev_hash: "This capture does not follow the one before it.",
  bad_payload_hash: "The payload does not match the hash recorded for it.",
  unparseable_payload: "The payload is not readable JSON.",
  after_break: "Follows an earlier broken link, so it cannot be relied on.",
};

/**
 * Verification is recomputed from the submitted payloads on every request. Nothing is
 * trusted because it was stored: the hashes are hashed again here.
 */
export function verifyRoutes(): Router {
  const router = Router();
  router.post("/verify", async (req, res) => {
    const body = parseOrThrow(chainExportBody, req.body);
    const verdict = await verifyChain(
      body.links.map((link) => ({
        seq: link.seq,
        payload_raw: link.payload_raw,
        payload_hash: fromHex(link.payload_hash),
        prev_hash: fromHex(link.prev_hash),
      })),
    );
    const result: VerifyResult = {
      verified: verdict.verified,
      links: verdict.links,
      first_broken: verdict.firstBroken,
      verdicts: verdict.verdicts.map((v) => ({ seq: v.seq, ok: v.ok, reason: REASONS[v.reason] })),
    };
    res.json(result);
  });
  return router;
}
