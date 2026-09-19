import type { Band, ImportRequest, ImportResult, VendorRow } from "@alibi/contracts";
import { getVendors, importCsv, loadSample, watchVendor } from "../api.js";
import type { Screen } from "../state.js";
import {
  bandPill, button, emptyState, errorBox, pageHeader, sampleBadge, sourceBadge,
} from "../ui/components.js";
import { clear, el, link } from "../ui/dom.js";
import { humanDate, rupees } from "../ui/format.js";

/** flagged first, then watch, then never-captured, then clear: the rows that need a person come first. */
const BAND_ORDER: Record<Band, number> = { flagged: 0, watch: 1, unknown: 2, clear: 3 };
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** The IST calendar date of a UTC instant — captures are stamped in UTC but read in India. */
const istDate = (iso: string): string =>
  humanDate(new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString());

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "The register could not be reached.";

function summarise(rows: VendorRow[]): string {
  const count = (band: Band): number => rows.filter((row) => row.band === band).length;
  const itc = rows.reduce((total, row) => total + row.itc_at_risk, 0);
  return [
    `${rows.length} vendors`,
    `${count("flagged")} flagged`,
    `${count("watch")} watch`,
    `${count("unknown")} never captured`,
    `ITC in cancelled periods ${rupees(itc)}`,
  ].join(" · ");
}

function byBandThenName(a: VendorRow, b: VendorRow): number {
  const band = BAND_ORDER[a.band] - BAND_ORDER[b.band];
  return band !== 0 ? band : a.legal_name.localeCompare(b.legal_name);
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("The file could not be read.")));
    reader.readAsText(file);
  });
}

function setWatchButton(btn: HTMLButtonElement, watched: boolean): void {
  btn.textContent = watched ? "Watching" : "Watch";
  btn.setAttribute("aria-pressed", String(watched));
  btn.classList.toggle("is-on", watched);
}

export const vendorsScreen: Screen = async (root, _params, ctx) => {
  ctx.setTitle("Vendors");
  let alive = true;
  let asOf = todayIso();

  const summary = el("p", { class: "lede vendors-summary", dataset: { testid: "vendors-summary" } });
  const noticeHost = el("div", { class: "vendors-notice" });
  const tableHost = el("div", { class: "vendors-host" });
  const importPanel = el("div", { class: "card import-panel", dataset: { testid: "import-result" } });
  importPanel.hidden = true;

  const fail = (error: unknown): void => {
    if (alive) noticeHost.replaceChildren(errorBox(toMessage(error)));
  };

  async function load(): Promise<void> {
    try {
      const rows = await getVendors(asOf);
      if (!alive) return;
      clear(noticeHost);
      render(rows);
    } catch (error) {
      clear(tableHost);
      fail(error);
    }
  }

  async function toggleWatch(id: string, btn: HTMLButtonElement): Promise<void> {
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.disabled = true;
    try {
      const { watched } = await watchVendor(id, on);
      if (!alive) return;
      setWatchButton(btn, watched);
      clear(noticeHost);
    } catch (error) {
      fail(error);
    } finally {
      btn.disabled = false;
    }
  }

  async function handleFile(kind: ImportRequest["kind"], input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    if (!file) return;
    input.disabled = true;
    try {
      const result = await importCsv(kind, await readText(file));
      if (!alive) return;
      clear(noticeHost);
      renderImport(result);
      await load();
    } catch (error) {
      fail(error);
    } finally {
      input.disabled = false;
      input.value = "";
    }
  }

  function renderImport(result: ImportResult): void {
    clear(importPanel);
    importPanel.hidden = false;
    importPanel.append(
      el("h2", null, "Import"),
      el("p", { class: "import-count" }, `Imported ${result.inserted}, updated ${result.updated}.`),
    );
    if (result.errors.length === 0) return;
    importPanel.append(
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          { class: "table import-errors", dataset: { testid: "import-errors" } },
          el("thead", null, el("tr", null, ["Row", "Column", "Message"].map((h) => el("th", null, h)))),
          el(
            "tbody",
            null,
            result.errors.map((error) =>
              el(
                "tr",
                null,
                el("td", { class: "num" }, String(error.row)),
                el("td", { class: "mono" }, error.column),
                el("td", null, error.message),
              ),
            ),
          ),
        ),
      ),
    );
  }

  function vendorRow(row: VendorRow): HTMLTableRowElement {
    const watch = button(row.watched ? "Watching" : "Watch", {
      class: row.watched ? "btn-secondary btn-small is-on" : "btn-secondary btn-small",
      dataset: { testid: "watch-toggle" },
      "aria-pressed": String(row.watched),
    });
    watch.addEventListener("click", () => void toggleWatch(row.id, watch));
    return el(
      "tr",
      { class: "vendor-row", dataset: { testid: "vendor-row", vendorId: row.id } },
      el(
        "td",
        { class: "vendor-cell" },
        el(
          "div",
          { class: "vendor-name" },
          link(`/vendors/${encodeURIComponent(row.id)}`, row.legal_name),
          " ",
          sourceBadge(row.source),
        ),
        el("div", { class: "vendor-gstin mono" }, row.gstin),
      ),
      el("td", null, bandPill(row.band)),
      el("td", { class: "num" }, row.score == null ? "—" : String(row.score)),
      el("td", null, row.last_capture ? istDate(row.last_capture) : "never"),
      el("td", null, el("span", { class: `status-word status-${row.filing_status}` }, row.filing_status)),
      el("td", { class: "num" }, row.itc_at_risk > 0 ? rupees(row.itc_at_risk) : "—"),
      el("td", null, watch),
    );
  }

  function render(rows: VendorRow[]): void {
    summary.textContent = summarise(rows);
    sampleButton.hidden = rows.some((row) => row.source === "sample");
    clear(tableHost);
    if (rows.length === 0) {
      tableHost.append(emptyState("No vendors yet. Load the sample register or upload your vendor master."));
      return;
    }
    const headers = ["Vendor", "Band", "Score", "Last capture", "Filing", "ITC in cancelled period", "Watched"];
    tableHost.append(
      el(
        "div",
        { class: "table-wrap" },
        el(
          "table",
          { class: "table vendors-table", dataset: { testid: "vendors-table" } },
          el("thead", null, el("tr", null, headers.map((header) => el("th", null, header)))),
          el("tbody", null, [...rows].sort(byBandThenName).map(vendorRow)),
        ),
      ),
    );
  }

  const sampleButton = button("Load sample data", {
    class: "btn-secondary",
    dataset: { testid: "load-sample" },
  });
  sampleButton.append(" ", sampleBadge());
  sampleButton.addEventListener("click", () => {
    void (async () => {
      sampleButton.disabled = true;
      try {
        await loadSample();
        if (alive) await load();
      } catch (error) {
        fail(error);
      } finally {
        sampleButton.disabled = false;
      }
    })();
  });

  const fileField = (label: string, testid: string, kind: ImportRequest["kind"]): HTMLElement => {
    const input = el("input", {
      type: "file",
      accept: ".csv,text/csv",
      dataset: { testid },
    });
    input.addEventListener("change", () => void handleFile(kind, input));
    return el("label", { class: "file-field" }, el("span", null, label), input);
  };

  const asOfInput = el("input", {
    type: "date",
    class: "date-input",
    value: asOf,
    dataset: { testid: "as-of" },
  });
  asOfInput.addEventListener("change", () => {
    asOf = asOfInput.value || todayIso();
    void load();
  });

  root.append(
    pageHeader({ eyebrow: "Register", title: "Your vendors" }),
    summary,
    el(
      "div",
      { class: "vendors-toolbar" },
      sampleButton,
      fileField("Upload vendor master (CSV)", "upload-vendors", "vendors"),
      fileField("Upload purchase register (CSV)", "upload-transactions", "transactions"),
      el("label", { class: "date-field" }, el("span", null, "As of"), asOfInput),
    ),
    noticeHost,
    importPanel,
    tableHost,
  );

  await load();
  return () => {
    alive = false;
  };
};
