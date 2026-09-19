import { describe, expect, it } from "vitest";
import {
  ZERO_HASH,
  HASH_BYTES,
  bytesEqual,
  fromHex,
  hashLink,
  sealPayload,
  toHex,
  verifyChain,
  type ChainLink,
} from "@alibi/core";

async function buildChain(payloads: string[]): Promise<ChainLink[]> {
  const links: ChainLink[] = [];
  let prev = ZERO_HASH;
  for (let i = 0; i < payloads.length; i++) {
    const sealed = await sealPayload(prev, payloads[i]!);
    links.push({ seq: i + 1, payload_raw: payloads[i]!, payload_hash: sealed.payload_hash, prev_hash: prev });
    prev = sealed.payload_hash;
  }
  return links;
}

const payloads = [
  '{"gstin":"27AAPFU0939F1ZV","status":"Active","captured_at":"2026-03-01T09:00:00Z"}',
  '{"gstin":"27AAPFU0939F1ZV","status":"Active","captured_at":"2026-04-01T09:00:00Z"}',
  '{"gstin":"27AAPFU0939F1ZV","status":"Suspended","captured_at":"2026-05-01T09:00:00Z"}',
  '{"gstin":"27AAPFU0939F1ZV","status":"Cancelled","captured_at":"2026-06-01T09:00:00Z","cancellation_date":"2025-04-01"}',
  '{"provider":"gstinapi","http_status":502,"reason":"provider temporarily unavailable"}',
];

describe("hashLink", () => {
  it("matches sha256(prev || canonical) computed independently", async () => {
    // sha256 of 32 zero bytes followed by the ASCII bytes of {"a":1}
    const expected = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array([...new Uint8Array(32), ...new TextEncoder().encode('{"a":1}')]),
    );
    const got = await hashLink(ZERO_HASH, '{"a":1}');
    expect(toHex(got)).toBe(toHex(new Uint8Array(expected)));
    expect(got.length).toBe(HASH_BYTES);
  });

  it("refuses a prev_hash of the wrong length", async () => {
    await expect(hashLink(new Uint8Array(16), "{}")).rejects.toThrow(RangeError);
  });
});

describe("sealPayload", () => {
  it("canonicalises before hashing, so whitespace and key order do not change the hash", async () => {
    const a = await sealPayload(ZERO_HASH, '{"b":1,"a":2}');
    const b = await sealPayload(ZERO_HASH, '{ "a": 2, "b": 1 }');
    expect(toHex(a.payload_hash)).toBe(toHex(b.payload_hash));
    expect(a.canonical).toBe('{"a":2,"b":1}');
  });

  it("rejects a payload that is not JSON", async () => {
    await expect(sealPayload(ZERO_HASH, "not json")).rejects.toThrow(SyntaxError);
  });
});

describe("verifyChain", () => {
  it("verifies an intact chain, including a failed-lookup link", async () => {
    const chain = await buildChain(payloads);
    const verdict = await verifyChain(chain);
    expect(verdict.verified).toBe(true);
    expect(verdict.links).toBe(5);
    expect(verdict.firstBroken).toBeNull();
    expect(verdict.verdicts.every((v) => v.ok && v.reason === "ok")).toBe(true);
  });

  it("an empty chain is not verified", async () => {
    const verdict = await verifyChain([]);
    expect(verdict.verified).toBe(false);
    expect(verdict.links).toBe(0);
  });

  it("accepts links given out of order", async () => {
    const chain = await buildChain(payloads);
    const shuffled = [chain[3]!, chain[0]!, chain[4]!, chain[2]!, chain[1]!];
    expect((await verifyChain(shuffled)).verified).toBe(true);
  });

  it("tampering a payload breaks that link and every link after it", async () => {
    const chain = await buildChain(payloads);
    chain[2] = { ...chain[2]!, payload_raw: chain[2]!.payload_raw.replace("Suspended", "Active") };
    const verdict = await verifyChain(chain);
    expect(verdict.verified).toBe(false);
    expect(verdict.firstBroken).toBe(3);
    expect(verdict.verdicts.map((v) => v.reason)).toEqual(["ok", "ok", "bad_payload_hash", "after_break", "after_break"]);
  });

  it("tampering that preserves canonical form is not tampering", async () => {
    const chain = await buildChain(payloads);
    chain[1] = { ...chain[1]!, payload_raw: '{ "captured_at": "2026-04-01T09:00:00Z", "status": "Active", "gstin": "27AAPFU0939F1ZV" }' };
    expect((await verifyChain(chain)).verified).toBe(true);
  });

  it("a rewritten stored hash is detected at that link", async () => {
    const chain = await buildChain(payloads);
    const forged = new Uint8Array(chain[1]!.payload_hash);
    forged[0] = forged[0]! ^ 0xff;
    chain[1] = { ...chain[1]!, payload_hash: forged };
    const verdict = await verifyChain(chain);
    expect(verdict.firstBroken).toBe(2);
    expect(verdict.verdicts[1]!.reason).toBe("bad_payload_hash");
    expect(verdict.verdicts[2]!.reason).toBe("after_break");
  });

  it("a deleted link shows as a sequence gap", async () => {
    const chain = await buildChain(payloads);
    chain.splice(2, 1);
    const verdict = await verifyChain(chain);
    expect(verdict.verified).toBe(false);
    expect(verdict.firstBroken).toBe(4);
    expect(verdict.verdicts.map((v) => v.reason)).toEqual(["ok", "ok", "seq_gap", "after_break"]);
  });

  it("a first link that does not start from the zero hash is broken", async () => {
    const chain = await buildChain(payloads);
    chain[0] = { ...chain[0]!, prev_hash: fromHex("11".repeat(32)) };
    const verdict = await verifyChain(chain);
    expect(verdict.firstBroken).toBe(1);
    expect(verdict.verdicts[0]!.reason).toBe("bad_prev_hash");
  });

  it("an unparseable payload is broken, not skipped", async () => {
    const chain = await buildChain(payloads);
    chain[4] = { ...chain[4]!, payload_raw: "{oops" };
    const verdict = await verifyChain(chain);
    expect(verdict.firstBroken).toBe(5);
    expect(verdict.verdicts[4]!.reason).toBe("unparseable_payload");
  });
});

describe("hex helpers", () => {
  it("round-trip", () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    expect(toHex(bytes)).toBe("0001feff");
    expect(bytesEqual(fromHex("0001feff"), bytes)).toBe(true);
    expect(() => fromHex("abc")).toThrow(TypeError);
    expect(() => fromHex("zz")).toThrow(TypeError);
  });
});
