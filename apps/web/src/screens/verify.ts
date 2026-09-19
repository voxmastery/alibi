/**
 * The public verify screen, plus the chain-recomputation helpers the defence screen shares.
 *
 * The rule the whole screen exists to keep: a green line is only ever printed after
 * `verifyChain` has actually run over the raw payloads and come back verified. Every other
 * outcome — a broken link, a malformed export, a request that never landed — is red.
 */
import type { ChainExport } from "@alibi/contracts";
import { type ChainLink, fromHex, verifyChain } from "@alibi/core";
import { verifyChainExport } from "../api.js";
import type { Screen } from "../state.js";
import { button, emptyState, errorBox, pageHeader, table } from "../ui/components.js";
import { clear, el, link } from "../ui/dom.js";

/** The shape both recomputations report in, so browser and server results compare directly. */
export interface Verification {
  verified: boolean;
  links: number;
  first_broken: number | null;
  verdicts: Array<{ seq: number; ok: boolean; reason: string }>;
}

/** One recomputation that either produced verdicts or could not be run at all. */
export type CheckOutcome = { ok: true; v: Verification } | { ok: false; message: string };

export interface VerificationWords {
  ok: string;
  fail: string;
}

export const RESULT_WORDS: VerificationWords = { ok: "Verified", fail: "FAILED" };
export const CHAIN_WORDS: VerificationWords = { ok: "Chain verified", fail: "Chain FAILED" };

/** The wire carries short reason codes; people read sentences. */
const REASON_WORDS: Record<string, string> = {
  ok: "every byte recomputed to the same hash",
  seq_gap: "the sequence number is out of order",
  bad_prev_hash: "the previous hash does not match the link before it",
  bad_payload_hash: "the payload recomputes to a different hash than the file records",
  unparseable_payload: "the payload is not readable JSON",
  after_break: "not checked, because an earlier link is broken",
  bad_hash_format: "the hash is not a 32-byte hexadecimal value",
};

export function reasonWords(reason: string): string {
  return REASON_WORDS[reason] ?? reason;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const HASH_HEX = /^[0-9a-f]{64}$/i;

/**
 * Recomputes every link in the browser with `verifyChain`. Hex hashes become bytes here;
 * a hash that is not 32 bytes of hex is a broken link, not an exception.
 */
export async function verifyInBrowser(exported: ChainExport): Promise<Verification> {
  const links: ChainLink[] = [];
  for (const raw of exported.links) {
    if (!HASH_HEX.test(raw.payload_hash) || !HASH_HEX.test(raw.prev_hash)) {
      return {
        verified: false,
        links: exported.links.length,
        first_broken: raw.seq,
        verdicts: [{ seq: raw.seq, ok: false, reason: "bad_hash_format" }],
      };
    }
    links.push({
      seq: raw.seq,
      payload_raw: raw.payload_raw,
      payload_hash: fromHex(raw.payload_hash),
      prev_hash: fromHex(raw.prev_hash),
    });
  }
  const verdict = await verifyChain(links);
  return {
    verified: verdict.verified,
    links: verdict.links,
    first_broken: verdict.firstBroken,
    verdicts: verdict.verdicts.map((v) => ({ seq: v.seq, ok: v.ok, reason: v.reason })),
  };
}

/** Runs a promised recomputation and turns a thrown error into a red outcome rather than a blank screen. */
export async function settle(work: Promise<Verification>): Promise<CheckOutcome> {
  try {
    return { ok: true, v: await work };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

/** The single sentence that states what a recomputation found. */
export function verificationSentence(v: Verification, words: VerificationWords): string {
  if (v.verified) return `${words.ok} · ${v.links} ${v.links === 1 ? "link" : "links"}`;
  if (v.links === 0) return `${words.fail}: the export carries no links, so there was nothing to recompute.`;
  const broken =
    v.verdicts.find((verdict) => !verdict.ok && verdict.seq === v.first_broken) ??
    v.verdicts.find((verdict) => !verdict.ok);
  const seq = v.first_broken ?? broken?.seq ?? "?";
  const reason = broken ? reasonWords(broken.reason) : "the recomputed hashes do not match the file";
  return `${words.fail} at link ${seq}: ${reason}`;
}

/** A result box. Green needs `ok: true` and a verdict of verified; anything else is red. */
export function verificationBox(
  testid: string,
  heading: string,
  outcome: CheckOutcome | null,
  words: VerificationWords,
  note?: string,
): HTMLElement {
  const state = outcome === null ? "pending" : outcome.ok && outcome.v.verified ? "ok" : "fail";
  const sentence =
    outcome === null
      ? "Not run yet."
      : outcome.ok
        ? verificationSentence(outcome.v, words)
        : `Not verified: ${outcome.message}`;
  return el(
    "div",
    { class: `verdict-box verdict-${state}`, dataset: { testid } },
    el("h3", null, heading),
    el("p", { class: `verdict-line verdict-${state}-line` }, sentence),
    note ? el("p", { class: "verdict-note" }, note) : null,
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === "string" ? value : "");

/** Parses pasted text into a chain export, with a readable sentence for every way it can be wrong. */
export function parseChainExport(text: string): ChainExport {
  if (text.trim() === "") throw new Error("Paste a chain export first, or choose a file.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("That is not readable JSON. Paste the whole export, outer braces included.");
  }
  if (!isRecord(parsed)) throw new Error("A chain export is a JSON object. This is not one.");
  const rawLinks = parsed.links;
  if (!Array.isArray(rawLinks)) throw new Error("This does not look like a chain export: it has no links array.");
  const links = rawLinks.map((raw, index) => {
    if (
      !isRecord(raw) ||
      typeof raw.seq !== "number" ||
      typeof raw.payload_raw !== "string" ||
      typeof raw.payload_hash !== "string" ||
      typeof raw.prev_hash !== "string"
    ) {
      throw new Error(`Link ${index + 1} is missing seq, payload_raw, payload_hash or prev_hash.`);
    }
    return {
      seq: raw.seq,
      payload_raw: raw.payload_raw,
      payload_hash: raw.payload_hash,
      prev_hash: raw.prev_hash,
    };
  });
  const vendor = isRecord(parsed.vendor) ? parsed.vendor : {};
  return {
    vendor: { id: asString(vendor.id), legal_name: asString(vendor.legal_name), gstin: asString(vendor.gstin) },
    exported_as_of: asString(parsed.exported_as_of),
    links,
  };
}

const mark = (verdict?: { ok: boolean }): HTMLElement =>
  verdict === undefined
    ? el("span", { class: "muted" }, "—")
    : verdict.ok
      ? el("span", { class: "tick", title: "recomputed" }, "✓")
      : el("span", { class: "cross", title: "did not recompute" }, "✗");

function reasonCell(browser?: { reason: string }, server?: { reason: string }): HTMLElement {
  const b = browser ? reasonWords(browser.reason) : null;
  const s = server ? reasonWords(server.reason) : null;
  if (b !== null && s !== null && b !== s) {
    return el("span", null, `In your browser: ${b}. On the server: ${s}.`);
  }
  return el("span", null, b ?? s ?? "—");
}

/** Per-link ✓/✗ for both recomputations side by side. */
function linkTable(browser: Verification | null, server: Verification | null): HTMLElement {
  const seqs = [
    ...new Set([...(browser?.verdicts ?? []), ...(server?.verdicts ?? [])].map((verdict) => verdict.seq)),
  ].sort((a, b) => a - b);
  if (seqs.length === 0) return emptyState("There were no links to recompute.");
  const rows = seqs.map((seq) => {
    const b = browser?.verdicts.find((verdict) => verdict.seq === seq);
    const s = server?.verdicts.find((verdict) => verdict.seq === seq);
    return [el("span", { class: "mono" }, String(seq)), mark(b), mark(s), reasonCell(b, s)];
  });
  return el(
    "div",
    { dataset: { testid: "link-table" } },
    table(["Link", "In your browser", "On the server", "What the recomputation found"], rows),
  );
}

/** Two recomputations of the same bytes must land in the same place. When they do not, say so. */
function disagree(browser: Verification, server: Verification): boolean {
  if (browser.verified !== server.verified) return true;
  if (browser.verified) return browser.links !== server.links;
  return browser.first_broken !== server.first_broken;
}

const RECOMPUTE_NOTE =
  "Both checks recompute every hash from the raw payloads; nothing is trusted from the file's own claims.";

export const verifyScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Verify a chain export");

  const textarea = el("textarea", {
    id: "chain-json-input",
    class: "chain-json mono",
    rows: "12",
    spellcheck: "false",
    autocapitalize: "off",
    placeholder: '{"vendor": …, "exported_as_of": …, "links": [ … ]}',
    dataset: { testid: "chain-json" },
  });
  const fileInput = el("input", {
    type: "file",
    accept: "application/json,.json,.txt",
    class: "file-input",
    dataset: { testid: "chain-file" },
  });
  const results = el("section", { class: "verify-results" });

  let running = false;
  const verifyButton = button("Verify", { dataset: { testid: "verify" } });

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    verifyButton.disabled = true;
    clear(results);
    results.append(el("p", { class: "muted" }, "Recomputing every hash…"));
    try {
      const exported = parseChainExport(textarea.value);
      const [browser, server] = await Promise.all([
        settle(verifyInBrowser(exported)),
        settle(verifyChainExport(exported)),
      ]);
      const browserVerdicts = browser.ok ? browser.v : null;
      const serverVerdicts = server.ok ? server.v : null;
      clear(results);
      if (browserVerdicts && serverVerdicts && disagree(browserVerdicts, serverVerdicts)) {
        results.append(
          el(
            "div",
            { class: "error-box disagree", dataset: { testid: "disagree" } },
            "Your browser and the server do not agree about this export. Until that difference is explained, treat the chain as not verified.",
          ),
        );
      }
      results.append(
        el(
          "div",
          { class: "verdict-grid" },
          verificationBox("browser-result", "In your browser", browser, RESULT_WORDS, "Recomputed here, on this page, with no request to the server."),
          verificationBox("server-result", "On the server", server, RESULT_WORDS, "Recomputed again independently, from the same pasted bytes."),
        ),
        el("p", { class: "verify-note" }, RECOMPUTE_NOTE),
        el("h2", null, "Link by link"),
        linkTable(browserVerdicts, serverVerdicts),
      );
    } catch (error) {
      clear(results);
      results.append(errorBox(describeError(error)));
    } finally {
      running = false;
      verifyButton.disabled = false;
    }
  };

  verifyButton.addEventListener("click", () => void run());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then(
      (text) => {
        textarea.value = text;
        return run();
      },
      (error: unknown) => {
        clear(results);
        results.append(errorBox(`That file could not be read: ${describeError(error)}`));
      },
    );
  });

  root.append(
    pageHeader({
      eyebrow: "Verify",
      title: "Recompute a chain export",
      lede: "Paste a chain export, or choose the file. Every hash is recomputed here in your browser and again on the server, from the raw payloads.",
    }),
    el(
      "section",
      { class: "card verify-form" },
      el("label", { class: "field-label", for: "chain-json-input" }, "Chain export"),
      textarea,
      el(
        "div",
        { class: "verify-actions" },
        verifyButton,
        el("label", { class: "file-label" }, "or choose a file ", fileInput),
      ),
      el(
        "p",
        { class: "muted" },
        "A chain export comes from a vendor's ",
        link("/vendors", "vendor page"),
        " or from the evidence pack it belongs to.",
      ),
    ),
    results,
  );
};
