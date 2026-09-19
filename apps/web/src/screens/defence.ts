/**
 * The evidence pack for one vendor, as of a date the reader picks.
 *
 * The chain box never repeats the pack's own verdict on faith: it fetches the chain export and
 * recomputes every hash here with `verifyChain`. Green needs both that recomputation and the
 * pack to agree; anything else, including a disagreement, is red.
 */
import type { DefenceFile } from "@alibi/contracts";
import { defenceHtmlUrl, getChain, getDefence } from "../api.js";
import type { Cleanup, Screen } from "../state.js";
import { button, errorBox, pageHeader, sampleBadge } from "../ui/components.js";
import { clear, el, link } from "../ui/dom.js";
import { humanDate } from "../ui/format.js";
import {
  CHAIN_WORDS,
  type CheckOutcome,
  describeError,
  settle,
  verificationBox,
  verifyInBrowser,
} from "./verify.js";

/** Printed outside the iframe as well, so it cannot be missed by a reader who never scrolls into the frame. */
const NOTICE = "It is evidence, not legal advice.";

/** Today on the IST calendar, which is the day a reader in India means by "as of today". */
const todayIso = (): string => new Date(Date.now() + (5 * 60 + 30) * 60_000).toISOString().slice(0, 10);

function withNotice(notice: string): string {
  const text = notice.trim();
  if (text === "") return NOTICE;
  return text.includes(NOTICE) ? text : `${text} ${NOTICE}`;
}

function downloadJson(file: DefenceFile, asOf: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = el("a", { href: url, download: `alibi-evidence-${file.vendor.gstin}-${asOf}.json` });
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function vendorCard(file: DefenceFile): HTMLElement {
  return el(
    "section",
    { class: "card defence-vendor" },
    el("h2", null, file.vendor.legal_name, file.sample ? [" ", sampleBadge()] : null),
    el(
      "dl",
      { class: "facts" },
      el("dt", null, "GSTIN"),
      el("dd", { class: "mono" }, file.vendor.gstin),
      el("dt", null, "PAN"),
      el("dd", { class: "mono" }, file.vendor.pan ?? "—"),
      el("dt", null, "As of"),
      el("dd", null, humanDate(file.as_of)),
      el("dt", null, "Captures in the pack"),
      el("dd", null, `${file.snapshots.length} sealed · ${file.transactions.length} transactions`),
    ),
  );
}

function statementBox(file: DefenceFile): HTMLElement {
  return el(
    "section",
    { class: "card statement", dataset: { testid: "statement" } },
    el("h2", null, "What the record shows"),
    file.statement.length === 0
      ? el("p", { class: "muted" }, "The record carries no sentences for this date.")
      : file.statement.map((sentence) => el("p", null, sentence)),
  );
}

/** The chain box: the browser's own recomputation first, then what the pack reports. */
function chainBox(file: DefenceFile, browser: CheckOutcome): HTMLElement {
  const packVerified = file.chain.verified;
  const browserVerified = browser.ok && browser.v.verified;
  const mismatch = browser.ok && browser.v.verified !== packVerified;
  const state = browserVerified && packVerified && !mismatch ? "ok" : "fail";
  const packLine = packVerified
    ? `The pack reports the chain verified over ${file.chain.links} ${file.chain.links === 1 ? "link" : "links"} up to ${humanDate(file.as_of)}.`
    : `The pack reports the chain FAILED at link ${file.chain.first_broken ?? "?"}.`;
  return el(
    "section",
    { class: `card chain-box chain-${state}`, dataset: { testid: "chain" } },
    el("h2", null, "Hash chain"),
    verificationBox(
      "chain-browser",
      "Recomputed in your browser",
      browser,
      CHAIN_WORDS,
      "Every hash above was recomputed on this page from the raw payloads of the chain export.",
    ),
    mismatch
      ? el(
          "div",
          { class: "error-box disagree", dataset: { testid: "chain-disagree" } },
          "Your browser and the server do not agree about this chain. Until that difference is explained, treat it as not verified.",
        )
      : null,
    el("p", { class: `chain-pack chain-pack-${packVerified ? "ok" : "fail"}` }, packLine),
    el(
      "dl",
      { class: "facts" },
      el("dt", null, "Root hash"),
      el("dd", { class: "hash" }, file.chain.root_hash),
      el("dt", null, "Head hash"),
      el("dd", { class: "hash" }, file.chain.head_hash ?? "—"),
    ),
    el("p", null, link("/verify", "Recompute any chain export yourself")),
  );
}

export const defenceScreen: Screen = (root, params, ctx) => {
  ctx.setTitle("Evidence pack");
  const id = params.id ?? "";
  let asOf = todayIso();

  const asOfInput = el("input", {
    type: "date",
    id: "defence-as-of",
    class: "input input-date",
    value: asOf,
    dataset: { testid: "as-of" },
  });
  const body = el("div", { class: "defence-body" });

  // Every load takes a ticket; a late response from an abandoned date never paints.
  let generation = 0;

  const load = async (): Promise<void> => {
    const ticket = ++generation;
    clear(body);
    body.append(el("p", { class: "muted" }, "Assembling the evidence pack…"));
    let file: DefenceFile;
    try {
      file = await getDefence(id, asOf);
    } catch (error) {
      if (ticket !== generation) return;
      clear(body);
      body.append(errorBox(`The evidence pack could not be assembled: ${describeError(error)}`));
      return;
    }
    if (ticket !== generation) return;
    const browser = await settle(getChain(id).then(verifyInBrowser));
    if (ticket !== generation) return;
    ctx.setTitle(`${file.vendor.legal_name} · evidence pack`);
    clear(body);
    body.append(
      vendorCard(file),
      statementBox(file),
      el("p", { class: "notice", dataset: { testid: "notice" } }, withNotice(file.notice)),
      chainBox(file, browser),
      el(
        "div",
        { class: "defence-actions" },
        el(
          "a",
          {
            class: "btn",
            href: defenceHtmlUrl(id, asOf),
            target: "_blank",
            rel: "noopener noreferrer",
            dataset: { testid: "open-printable" },
          },
          "Open printable version",
        ),
        button("Download JSON", {
          class: "btn-secondary",
          dataset: { testid: "download-json" },
          onClick: () => downloadJson(file, asOf),
        }),
      ),
      el(
        "section",
        { class: "card defence-preview" },
        el("h2", null, "Printable preview"),
        el("iframe", {
          class: "defence-frame",
          src: defenceHtmlUrl(id, asOf),
          height: "900",
          title: `Printable evidence pack for ${file.vendor.legal_name}`,
          dataset: { testid: "preview" },
        }),
      ),
    );
  };

  asOfInput.addEventListener("change", () => {
    const next = asOfInput.value;
    if (next === "" || next === asOf) return;
    asOf = next;
    void load();
  });

  root.append(
    pageHeader({
      eyebrow: "Evidence pack",
      title: "Evidence pack",
      lede: "Everything sealed about this vendor, read back as of a date you choose. Nothing here is asserted; every sentence is computed from the captures.",
    }),
    el(
      "div",
      { class: "defence-toolbar" },
      el("label", { class: "field-label", for: "defence-as-of" }, "As of"),
      asOfInput,
    ),
    body,
  );

  void load();

  const cleanup: Cleanup = () => {
    generation++;
  };
  return cleanup;
};
