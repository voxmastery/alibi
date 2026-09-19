import type { Band, FilingPeriod, FindingView, RecordSource, RegisterFacts, SealedRecord } from "@alibi/contracts";
import type { Child, ElAttrs } from "./dom.js";
import { el } from "./dom.js";
import { humanDate, istInstant, monthLabel } from "./format.js";

export interface PageHeaderOptions {
  eyebrow?: string;
  title: string;
  lede?: string;
}

/** The eyebrow / h1 / lede stack every screen opens with. */
export function pageHeader({ eyebrow, title, lede }: PageHeaderOptions): HTMLElement {
  return el(
    "div",
    { class: "page-header" },
    eyebrow ? el("p", { class: "eyebrow" }, eyebrow) : null,
    el("h1", null, title),
    lede ? el("p", { class: "lede" }, lede) : null,
  );
}

/** The small amber "SAMPLE" badge — the one thing no screen is allowed to omit for sample data. */
export function sampleBadge(): HTMLElement {
  return el("span", { class: "badge badge-sample" }, "SAMPLE");
}

/** Renders the right badge for where a record came from. */
export function sourceBadge(source: RecordSource | "live"): HTMLElement {
  if (source === "sample") return sampleBadge();
  if (source === "live" || source === "gstinapi") return el("span", { class: "badge badge-live" }, "LIVE");
  if (source === "upload") return el("span", { class: "badge badge-upload" }, "UPLOADED");
  return el("span", { class: "badge badge-check" }, "CHECKED");
}

/** The clear / watch / flagged / unknown verdict pill. */
export function bandPill(band: Band): HTMLElement {
  return el("span", { class: `pill pill-${band}` }, band);
}

/** A `<ul class="findings">` of severity-coloured findings with their weight in mono. */
export function findingList(findings: FindingView[]): HTMLElement {
  return el(
    "ul",
    { class: "findings" },
    findings.map((finding) =>
      el(
        "li",
        { class: `finding finding-${finding.severity}` },
        el("span", { class: "message" }, finding.message),
        el("span", { class: "weight" }, String(finding.weight)),
      ),
    ),
  );
}

const FACT_ROWS: Array<[label: string, key: keyof RegisterFacts, kind?: "mono" | "date"]> = [
  ["GSTIN", "gstin", "mono"],
  ["Legal name", "legal_name"],
  ["Trade name", "trade_name"],
  ["Status", "status"],
  ["Taxpayer type", "taxpayer_type"],
  ["Constitution", "business_constitution"],
  ["Registered on", "registration_date", "date"],
  ["Cancelled on", "cancellation_date", "date"],
  ["State", "state"],
  ["Address", "address"],
  ["e-Invoice status", "einvoice_status"],
  ["Block status", "block_status"],
];

/** A `<dl class="facts">` grid of the register facts, in a fixed, readable order. */
export function factsTable(facts: RegisterFacts): HTMLElement {
  const cells: Child[] = [];
  for (const [label, key, kind] of FACT_ROWS) {
    const raw = facts[key];
    const value = raw == null ? "—" : kind === "date" ? humanDate(String(raw)) : String(raw);
    cells.push(el("dt", null, label), el("dd", { class: kind === "mono" ? "mono" : undefined }, value));
  }
  return el("dl", { class: "facts" }, cells);
}

const RETURN_LABEL: Record<FilingPeriod["return_type"], string> = { GSTR1: "GSTR-1", GSTR3B: "GSTR-3B" };
const FILING_STATUS_LABEL: Record<FilingPeriod["filing_status"], string> = {
  filed: "Filed",
  not_filed: "Not filed",
  not_due: "Not due",
};

/** A `.filing` grid: one `.period` cell per (return type, month), coloured by filing status. */
export function filingGrid(filing: FilingPeriod[]): HTMLElement {
  if (filing.length === 0) return emptyState("No filing history.");
  return el(
    "div",
    { class: "filing" },
    filing.map((period) =>
      el(
        "div",
        { class: "period" },
        el("div", { class: "p" }, `${RETURN_LABEL[period.return_type]} · ${monthLabel(period.period)}`),
        el("div", { class: period.filing_status }, FILING_STATUS_LABEL[period.filing_status]),
      ),
    ),
  );
}

/** The sealed-record card: sequence, IST and UTC instant, hashes in mono, chain verification line. */
export function sealedRecordCard(sealed: SealedRecord): HTMLElement {
  const verification = sealed.verification.verified
    ? el("p", { class: "ok" }, `Chain verified · ${sealed.verification.links} links`)
    : el("p", { class: "fail" }, `Chain FAILED at link ${sealed.verification.first_broken ?? "?"}`);
  return el(
    "div",
    { class: "sealed" },
    el("h3", null, `Sealed record #${sealed.seq}`),
    el(
      "p",
      { class: "mono" },
      istInstant(sealed.captured_at),
      el("span", { class: "muted" }, ` (${sealed.captured_at} UTC)`),
    ),
    el(
      "dl",
      { class: "facts" },
      el("dt", null, "Hash"),
      el("dd", { class: "hash" }, sealed.payload_hash),
      el("dt", null, "Prev hash"),
      el("dd", { class: "hash" }, sealed.prev_hash),
    ),
    verification,
  );
}

/** A muted, dashed placeholder for "there is nothing here yet". */
export function emptyState(text: string): HTMLElement {
  return el("p", { class: "empty" }, text);
}

/** A red-bordered inline error message. */
export function errorBox(message: string): HTMLElement {
  return el("div", { class: "error-box" }, message);
}

/** A `.btn`; pass `{ class: "btn-secondary" }` (or any extra attrs) to vary it. */
export function button(label: string, attrs: ElAttrs = {}): HTMLButtonElement {
  const { class: extraClass, ...rest } = attrs;
  return el(
    "button",
    { type: "button", ...rest, class: extraClass ? `btn ${extraClass}` : "btn" },
    label,
  );
}

/** A generic `.table` inside a horizontally-scrollable `.table-wrap`. */
export function table(headers: string[], rows: Child[][]): HTMLElement {
  return el(
    "div",
    { class: "table-wrap" },
    el(
      "table",
      { class: "table" },
      el("thead", null, el("tr", null, headers.map((header) => el("th", null, header)))),
      el(
        "tbody",
        null,
        rows.map((row) => el("tr", null, row.map((cell) => el("td", null, cell)))),
      ),
    ),
  );
}
