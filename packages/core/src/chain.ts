import { canonicalJson, type JsonValue } from "./canonical.js";

export const HASH_BYTES = 32;
export const ZERO_HASH: Uint8Array = new Uint8Array(HASH_BYTES);

export interface ChainLink {
  seq: number;
  payload_raw: string;
  payload_hash: Uint8Array;
  prev_hash: Uint8Array;
}

export type LinkReason =
  | "ok"
  | "seq_gap"
  | "bad_prev_hash"
  | "bad_payload_hash"
  | "unparseable_payload"
  | "after_break";

export interface LinkVerdict {
  seq: number;
  ok: boolean;
  reason: LinkReason;
}

export interface ChainVerdict {
  /** True only when there is at least one link and every link recomputed correctly. */
  verified: boolean;
  links: number;
  firstBroken: number | null;
  verdicts: LinkVerdict[];
}

export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(digest);
}

export async function hashLink(prevHash: Uint8Array, canonicalPayload: string): Promise<Uint8Array> {
  if (prevHash.length !== HASH_BYTES) {
    throw new RangeError(`prev_hash must be ${HASH_BYTES} bytes, got ${prevHash.length}`);
  }
  const payload = new TextEncoder().encode(canonicalPayload);
  const input = new Uint8Array(prevHash.length + payload.length);
  input.set(prevHash, 0);
  input.set(payload, prevHash.length);
  return sha256(input);
}

/** Parse, canonicalise and hash a raw payload against the previous hash. Throws SyntaxError on non-JSON. */
export async function sealPayload(
  prevHash: Uint8Array,
  payloadRaw: string,
): Promise<{ canonical: string; payload_hash: Uint8Array }> {
  const canonical = canonicalJson(JSON.parse(payloadRaw) as JsonValue);
  const payload_hash = await hashLink(prevHash, canonical);
  return { canonical, payload_hash };
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new TypeError("fromHex: expected an even-length hexadecimal string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function verifyChain(links: ChainLink[]): Promise<ChainVerdict> {
  const sorted = [...links].sort((a, b) => a.seq - b.seq);
  const verdicts: LinkVerdict[] = [];
  let firstBroken: number | null = null;
  let expectedPrev = ZERO_HASH;

  // Assignments to firstBroken stay inside the loop body on purpose: TypeScript does not
  // see assignments made through a closure and would narrow the variable to null.
  const broken = (seq: number, reason: LinkReason): number => {
    verdicts.push({ seq, ok: false, reason });
    return seq;
  };

  for (let i = 0; i < sorted.length; i++) {
    const link = sorted[i]!;
    if (firstBroken !== null) {
      verdicts.push({ seq: link.seq, ok: false, reason: "after_break" });
      continue;
    }
    if (link.seq !== i + 1) {
      firstBroken = broken(link.seq, "seq_gap");
      continue;
    }
    if (!bytesEqual(link.prev_hash, expectedPrev)) {
      firstBroken = broken(link.seq, "bad_prev_hash");
      continue;
    }
    let canonical: string;
    try {
      canonical = canonicalJson(JSON.parse(link.payload_raw) as JsonValue);
    } catch {
      firstBroken = broken(link.seq, "unparseable_payload");
      continue;
    }
    const recomputed = await hashLink(link.prev_hash, canonical);
    if (!bytesEqual(recomputed, link.payload_hash)) {
      firstBroken = broken(link.seq, "bad_payload_hash");
      continue;
    }
    verdicts.push({ seq: link.seq, ok: true, reason: "ok" });
    expectedPrev = link.payload_hash;
  }

  return {
    verified: sorted.length > 0 && firstBroken === null,
    links: sorted.length,
    firstBroken,
    verdicts,
  };
}
