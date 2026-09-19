import type { CheckResult, FilingPeriod, NetworkSignal } from "@alibi/contracts";
import { ApiClientError, defenceHtmlUrl, getCheck, trackVendor, watchVendor } from "../api.js";
import type { Screen } from "../state.js";
import {
  bandPill,
  button,
  emptyState,
  errorBox,
  factsTable,
  filingGrid,
  findingList,
  sealedRecordCard,
  sourceBadge,
} from "../ui/components.js";
import type { Child } from "../ui/dom.js";
import { clear, el, link } from "../ui/dom.js";
import { humanDate } from "../ui/format.js";

const RETURN_ORDER: Record<FilingPeriod["return_type"], number> = { GSTR1: 0, GSTR3B: 1 };

const asSentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Whatever went wrong, say it as a sentence. */
const reason = (error: unknown): string =>
  asSentence(
    error instanceof ApiClientError ? error.message : "The connection to the server failed.",
  );

const ITC_NOTE =
  "Your input tax credit appears in your GSTR-2B only when this supplier files GSTR-1; a supplier that does not file is likely not remitting the tax you paid.";
const NO_SIGNALS =
  "No shared bank account, address, phone, email or filing IP with any vendor you have loaded.";
const SEAL_NOTE =
  "Every capture is hashed together with the hash of the capture before it, so this record cannot be altered later without breaking the chain.";

/** Newest period first, GSTR-1 above GSTR-3B, twenty-four periods at most. */
function recentFirst(filing: FilingPeriod[]): FilingPeriod[] {
  return [...filing]
    .sort((a, b) =>
      a.period === b.period
        ? RETURN_ORDER[a.return_type] - RETURN_ORDER[b.return_type]
        : b.period.localeCompare(a.period),
    )
    .slice(0, 24);
}

/** The signal sentence with each peer's name turned into a link to that vendor's record. */
function linkedSentence(signal: NetworkSignal): Child[] {
  const out: Child[] = [];
  let rest = signal.sentence;
  let linked = 0;
  while (rest.length > 0) {
    let best: { index: number; id: string; name: string } | null = null;
    for (const peer of signal.vendors) {
      if (!peer.legal_name) continue;
      const index = rest.indexOf(peer.legal_name);
      if (index < 0) continue;
      if (best === null || index < best.index) {
        best = { index, id: peer.id, name: peer.legal_name };
      }
    }
    if (best === null) {
      out.push(rest);
      break;
    }
    if (best.index > 0) out.push(rest.slice(0, best.index));
    out.push(link(`/vendors/${encodeURIComponent(best.id)}`, best.name));
    linked += 1;
    rest = rest.slice(best.index + best.name.length);
  }
  if (linked === 0 && signal.vendors.length > 0) {
    out.push(
      el(
        "span",
        { class: "peers" },
        " ",
        signal.vendors.map((peer, index) => [
          index === 0 ? null : ", ",
          link(`/vendors/${encodeURIComponent(peer.id)}`, peer.legal_name),
        ]),
      ),
    );
  }
  return out;
}

export const resultScreen: Screen = async (root, params, ctx) => {
  const id = params.id ?? "";
  let result: CheckResult;
  try {
    result = await getCheck(id);
  } catch (error) {
    ctx.setTitle("Check result");
    const notFound = error instanceof ApiClientError && error.status === 404;
    root.append(
      notFound
        ? emptyState("That check is not on record.")
        : errorBox(`That check could not be read just now. ${reason(error)}`),
      el("p", { class: "result-back" }, link("/", "Check a supplier")),
    );
    return;
  }

  const heading = result.facts?.legal_name || result.vendor.legal_name || result.vendor.gstin;
  ctx.setTitle(heading);

  const verdict = result.verdict;
  const asOf = humanDate(verdict.as_of);

  const trackButton = button(
    result.vendor.tracking === "tracked" ? "Tracked" : "Add to my vendors",
    { dataset: { testid: "track" } },
  );
  trackButton.disabled = result.vendor.tracking === "tracked";
  let watched = result.vendor.watched;
  const watchButton = button(watched ? "Stop watching this vendor" : "Watch this vendor", {
    class: "btn-secondary",
    dataset: { testid: "watch" },
    "aria-pressed": String(watched),
  });
  const actionMessages = el("div", { class: "action-messages" });

  const showActionError = (error: unknown, fallback: string): void => {
    clear(actionMessages);
    actionMessages.append(errorBox(`${fallback} ${reason(error)}`));
  };

  trackButton.addEventListener("click", () => {
    void (async () => {
      clear(actionMessages);
      trackButton.disabled = true;
      trackButton.textContent = "Adding…";
      try {
        await trackVendor(result.vendor.id);
        trackButton.textContent = "Tracked";
      } catch (error) {
        trackButton.textContent = "Add to my vendors";
        trackButton.disabled = false;
        showActionError(error, "This supplier could not be added to your vendor list.");
      }
    })();
  });

  watchButton.addEventListener("click", () => {
    void (async () => {
      clear(actionMessages);
      watchButton.disabled = true;
      try {
        const next = await watchVendor(result.vendor.id, !watched);
        watched = next.watched;
        watchButton.textContent = watched ? "Stop watching this vendor" : "Watch this vendor";
        watchButton.setAttribute("aria-pressed", String(watched));
      } catch (error) {
        showActionError(error, "The watch setting could not be changed just now.");
      } finally {
        watchButton.disabled = false;
      }
    })();
  });

  root.append(
    el(
      "div",
      { class: "result-head" },
      el(
        "p",
        { class: "eyebrow" },
        "Check result",
        sourceBadge(result.mode === "sample" ? "sample" : "gstinapi"),
      ),
      el("h1", null, heading),
      el(
        "p",
        { class: "result-ident" },
        el("span", { class: "mono" }, result.vendor.gstin),
        bandPill(verdict.band),
      ),
    ),

    el(
      "section",
      { class: "card verdict-card", dataset: { testid: "verdict" } },
      el("h2", null, "Verdict"),
      el("p", { class: "lede verdict-sentence" }, verdict.sentence),
      el(
        "p",
        { class: "mono verdict-score" },
        verdict.score === null ? "No score" : `Score ${verdict.score} of 100`,
      ),
      el("p", { class: "muted verdict-asof" }, `Recorded as of ${asOf}.`),
    ),

    el(
      "section",
      { class: "card", dataset: { testid: "facts" } },
      el("h2", null, "Register facts"),
      result.facts
        ? factsTable(result.facts)
        : errorBox(
            `The register did not answer: ${result.sealed.error ?? "no reason was recorded"}. This failure has been sealed as a failure, not as a status.`,
          ),
    ),

    el(
      "section",
      { class: "card" },
      el("h2", null, "Filing record"),
      filingGrid(recentFirst(result.filing)),
      el("p", { class: "muted filing-note" }, ITC_NOTE),
    ),

    el(
      "section",
      { class: "card", dataset: { testid: "network" } },
      el("h2", null, "Your network"),
      result.network.length === 0
        ? el("p", { class: "muted no-signals" }, NO_SIGNALS)
        : el(
            "ul",
            { class: "signals" },
            result.network.map((signal) =>
              el("li", { class: `signal signal-${signal.attribute}` }, linkedSentence(signal)),
            ),
          ),
    ),

    el(
      "section",
      { class: "card" },
      el("h2", null, "Findings"),
      result.findings.length === 0
        ? el("p", { class: "muted" }, `No findings as of ${asOf}.`)
        : findingList(result.findings),
    ),

    el(
      "section",
      { class: "card", dataset: { testid: "sealed" } },
      sealedRecordCard(result.sealed),
      el("p", { class: "muted sealed-note" }, SEAL_NOTE),
    ),

    el(
      "div",
      { class: "result-actions", dataset: { testid: "actions" } },
      trackButton,
      watchButton,
      el(
        "a",
        {
          class: "btn btn-secondary",
          href: defenceHtmlUrl(result.vendor.id),
          target: "_blank",
          rel: "noopener",
          dataset: { testid: "download" },
        },
        "Download this check",
      ),
      link("/", "Check another", { class: "btn btn-secondary", dataset: { testid: "another" } }),
    ),
    actionMessages,
  );
};
