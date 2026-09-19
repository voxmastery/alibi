import type {
  ChainVerification, SnapshotView, TransactionView, VendorDetail, VendorRecordView,
} from "@alibi/contracts";
import { getChain, getVendor, postCheck, watchVendor } from "../api.js";
import type { Screen } from "../state.js";
import {
  bandPill, button, emptyState, errorBox, findingList, pageHeader, sourceBadge,
} from "../ui/components.js";
import type { Child, ElAttrs } from "../ui/dom.js";
import { clear, el, link } from "../ui/dom.js";
import { humanDate, istInstant, rupees, shortHash } from "../ui/format.js";

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "The register could not be reached.";

function card(title: string, attrs: ElAttrs, ...children: Child[]): HTMLElement {
  return el("section", { ...attrs, class: attrs.class ? `card ${String(attrs.class)}` : "card" },
    el("h2", null, title), ...children);
}

/** current / gap / unknown — the same three words the vendors table uses for filing. */
function returnsCell(value: boolean | null): HTMLElement {
  const word = value === null ? "unknown" : value ? "current" : "gap";
  return el("span", { class: `status-word status-${word}` }, word);
}

function verdictCard(detail: VendorDetail): HTMLElement {
  const { verdict } = detail;
  return card(
    "Verdict",
    { class: "verdict-card", dataset: { testid: "verdict" } },
    el(
      "p",
      { class: "verdict-line" },
      bandPill(verdict.band),
      verdict.score == null ? null : el("span", { class: "mono score" }, `score ${verdict.score}`),
      el("span", { class: "muted" }, `as of ${humanDate(verdict.as_of)}`),
    ),
    el("p", null, verdict.sentence),
  );
}

function identityCard(vendor: VendorRecordView): HTMLElement {
  const rows: Array<[label: string, value: string | null, mono: boolean]> = [
    ["PAN", vendor.pan, true],
    ["State", vendor.state, false],
    ["Address", vendor.address, false],
    ["Registered on", vendor.registered_on ? humanDate(vendor.registered_on) : null, false],
    ["Bank account", vendor.bank_account_masked, true],
    ["Phone", vendor.phone, true],
    ["Email", vendor.email, false],
    ["Filing IP", vendor.filing_ip, true],
    ["Tracking", vendor.tracking === "tracked" ? "Tracked daily" : "Checked once", false],
    ["Watched", vendor.watched ? "Yes" : "No", false],
  ];
  const cells: Child[] = [];
  for (const [label, value, mono] of rows) {
    cells.push(
      el("dt", null, label),
      el("dd", value !== null && mono ? { class: "mono" } : null, value ?? "—"),
    );
  }
  return card("Identity", { dataset: { testid: "identity" } }, el("dl", { class: "facts" }, cells));
}

function findingsCard(detail: VendorDetail): HTMLElement {
  return card(
    "Findings",
    { dataset: { testid: "findings" } },
    detail.findings.length === 0
      ? emptyState("No findings as of this date.")
      : findingList(detail.findings),
  );
}

function timelineCard(snapshots: SnapshotView[]): HTMLElement {
  if (snapshots.length === 0) {
    return card(
      "Capture timeline",
      { dataset: { testid: "timeline" } },
      emptyState("This vendor was never captured, so there is no timeline yet."),
    );
  }
  const ordered = [...snapshots].sort((a, b) => a.seq - b.seq);
  const changed = new Set<number>();
  ordered.forEach((snapshot, index) => {
    const previous = index === 0 ? undefined : ordered[index - 1];
    if (previous && previous.status !== snapshot.status) changed.add(snapshot.seq);
  });
  const headers = ["Seq", "Captured", "Status", "Returns", "Payload hash"];
  const rows = [...ordered].reverse().map((snapshot) =>
    el(
      "tr",
      {
        class: changed.has(snapshot.seq) ? "changed" : undefined,
        dataset: { testid: "timeline-row", seq: String(snapshot.seq) },
      },
      el("td", { class: "num" }, String(snapshot.seq)),
      el("td", { class: "mono" }, istInstant(snapshot.captured_at)),
      snapshot.lookup_ok
        ? el("td", null, snapshot.status ?? "—", " ", sourceBadge(snapshot.source))
        : el("td", { class: "failed" }, `lookup failed: ${snapshot.error ?? "no reason recorded"}`),
      el("td", null, returnsCell(snapshot.returns_current)),
      el("td", { class: "mono hash" }, shortHash(snapshot.payload_hash)),
    ),
  );
  return card(
    "Capture timeline",
    { dataset: { testid: "timeline" } },
    el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "table timeline-table" },
        el("thead", null, el("tr", null, headers.map((header) => el("th", null, header)))),
        el("tbody", null, rows),
      ),
    ),
  );
}

function transactionsCard(transactions: TransactionView[]): HTMLElement {
  if (transactions.length === 0) {
    return card(
      "Transactions",
      { dataset: { testid: "transactions" } },
      emptyState("No purchases recorded against this vendor."),
    );
  }
  const headers = [
    "Invoice", "Date", "Amount", "ITC claimed", "Payment", "e-Way bill",
    "Status on date", "Returns on date", "Snapshot",
  ];
  const rows = transactions.map((transaction) =>
    el(
      "tr",
      { dataset: { testid: "transaction-row" } },
      el("td", { class: "mono" }, transaction.invoice_no),
      el("td", null, humanDate(transaction.date)),
      el("td", { class: "num" }, rupees(transaction.amount)),
      el("td", { class: "num" }, rupees(transaction.itc_claimed)),
      el("td", null, transaction.payment_mode),
      el("td", { class: "mono" }, transaction.eway_bill ?? "—"),
      el("td", null, transaction.status_on_date ?? "—"),
      el("td", null, returnsCell(transaction.returns_current_on_date)),
      el("td", { class: "mono hash" }, transaction.snapshot_hash ? shortHash(transaction.snapshot_hash) : "—"),
    ),
  );
  return card(
    "Transactions",
    { dataset: { testid: "transactions" } },
    el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "table transactions-table" },
        el("thead", null, el("tr", null, headers.map((header) => el("th", null, header)))),
        el("tbody", null, rows),
      ),
    ),
  );
}

/** Green when the recomputed chain holds, red when a link fails, neutral when nothing was ever captured. */
function chainLine(chain: ChainVerification, captures: number): HTMLElement {
  if (captures === 0 || chain.links === 0) {
    return el("p", { class: "chain-line none" }, "No captures yet, so there is no chain to verify.");
  }
  return chain.verified
    ? el("p", { class: "chain-line ok" }, `Chain verified · ${chain.links} links`)
    : el("p", { class: "chain-line fail" }, `Chain FAILED at link ${chain.first_broken ?? "?"}`);
}

function downloadJson(filename: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const anchor = el("a", { href: url, download: filename });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const vendorScreen: Screen = async (root, params, ctx) => {
  const id = params.id ?? "";
  let alive = true;
  let asOf: string | undefined;

  const headerHost = el("div", { class: "vendor-header-host" });
  const noticeHost = el("div", { class: "vendor-notice" });
  const body = el("div", { class: "vendor-body" });

  const fail = (error: unknown): void => {
    if (alive) noticeHost.replaceChildren(errorBox(toMessage(error)));
  };

  const asOfInput = el("input", { type: "date", class: "date-input", dataset: { testid: "as-of" } });
  asOfInput.addEventListener("change", () => {
    asOf = asOfInput.value || undefined;
    void load();
  });

  function header(detail: VendorDetail): HTMLElement {
    return el(
      "div",
      { class: "page-header vendor-head" },
      el("p", { class: "eyebrow" }, "Vendor"),
      el("h1", null, detail.vendor.legal_name),
      el(
        "div",
        { class: "vendor-sub" },
        el("span", { class: "mono gstin" }, detail.vendor.gstin),
        sourceBadge(detail.vendor.source),
        bandPill(detail.verdict.band),
        el("label", { class: "date-field" }, el("span", null, "As of"), asOfInput),
      ),
    );
  }

  function chainCard(detail: VendorDetail): HTMLElement {
    const captures = detail.snapshots.length;
    const exportButton = button("Export chain JSON", {
      class: "btn-secondary",
      dataset: { testid: "export-chain" },
    });
    exportButton.addEventListener("click", () => {
      void (async () => {
        exportButton.disabled = true;
        try {
          const chain = await getChain(id);
          downloadJson(`alibi-chain-${chain.vendor.gstin}.json`, chain);
          if (alive) clear(noticeHost);
        } catch (error) {
          fail(error);
        } finally {
          exportButton.disabled = false;
        }
      })();
    });
    return card(
      "Chain",
      { class: "chain-card", dataset: { testid: "chain" } },
      chainLine(detail.chain, captures),
      el(
        "div",
        { class: "chain-actions" },
        captures === 0 ? null : exportButton,
        link("/verify", "Verify elsewhere", { class: "btn btn-secondary" }),
      ),
    );
  }

  function actionsCard(detail: VendorDetail): HTMLElement {
    const watch = button(detail.vendor.watched ? "Stop watching" : "Watch this vendor", {
      class: "btn-secondary",
      dataset: { testid: "watch" },
      "aria-pressed": String(detail.vendor.watched),
    });
    watch.addEventListener("click", () => {
      void (async () => {
        const on = watch.getAttribute("aria-pressed") !== "true";
        watch.disabled = true;
        try {
          const { watched } = await watchVendor(id, on);
          if (!alive) return;
          watch.textContent = watched ? "Stop watching" : "Watch this vendor";
          watch.setAttribute("aria-pressed", String(watched));
          clear(noticeHost);
        } catch (error) {
          fail(error);
        } finally {
          watch.disabled = false;
        }
      })();
    });

    const check = button("Check again now", { dataset: { testid: "check-again" } });
    check.addEventListener("click", () => {
      void (async () => {
        check.disabled = true;
        try {
          const result = await postCheck(detail.vendor.gstin);
          if (!alive) return;
          ctx.navigate(`/checks/${encodeURIComponent(result.id)}`);
        } catch (error) {
          fail(error);
          check.disabled = false;
        }
      })();
    });

    return card(
      "Actions",
      { class: "actions-card", dataset: { testid: "actions" } },
      el(
        "div",
        { class: "actions-row" },
        link(`/defence/${encodeURIComponent(id)}`, "Export defence file", { class: "btn" }),
        watch,
        check,
      ),
      el("p", { class: "muted small" }, "A fresh check seals another record in this vendor's chain."),
    );
  }

  function render(detail: VendorDetail): void {
    ctx.setTitle(detail.vendor.legal_name);
    if (asOfInput.value !== detail.as_of) asOfInput.value = detail.as_of;
    headerHost.replaceChildren(header(detail));
    body.replaceChildren(
      verdictCard(detail),
      identityCard(detail.vendor),
      findingsCard(detail),
      timelineCard(detail.snapshots),
      transactionsCard(detail.transactions),
      chainCard(detail),
      actionsCard(detail),
    );
  }

  async function load(): Promise<void> {
    try {
      const detail = await getVendor(id, asOf);
      if (!alive) return;
      clear(noticeHost);
      render(detail);
    } catch (error) {
      if (!alive) return;
      if (!headerHost.firstChild) {
        headerHost.append(pageHeader({ eyebrow: "Vendor", title: "Vendor" }));
      }
      clear(body);
      fail(error);
    }
  }

  ctx.setTitle("Vendor");
  root.append(headerHost, noticeHost, body);
  await load();
  return () => {
    alive = false;
  };
};
