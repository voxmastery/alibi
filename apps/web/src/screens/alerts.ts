/**
 * Job health and the changes the recorder noticed between captures.
 *
 * Every alert here is a difference between two sealed records, so each one carries the date it
 * was noticed, where the record came from, and a link to the vendor it belongs to.
 */
import type { AlertKind, AlertView, JobHealth } from "@alibi/contracts";
import { getAlerts } from "../api.js";
import type { Screen } from "../state.js";
import { emptyState, errorBox, pageHeader, sourceBadge } from "../ui/components.js";
import { clear, el, link } from "../ui/dom.js";
import { humanDate, istInstant, rupees } from "../ui/format.js";
import { describeError } from "./verify.js";

/** Plain words, not wire codes. */
const KIND_LABEL: Record<AlertKind, string> = {
  status_changed: "Status changed",
  filing_gap: "Filing gap",
  cancellation: "Cancellation",
  retrospective_cancellation: "Retrospective cancellation",
  block_status_changed: "Block status changed",
};

function healthCard(health: JobHealth): HTMLElement {
  return el(
    "section",
    { class: `card health ${health.stale ? "health-stale" : ""}`, dataset: { testid: "health" } },
    el("h2", null, "Job health"),
    el(
      "p",
      { class: `health-state ${health.active ? "ok" : "fail"}` },
      health.active ? "Scheduled checks are active." : "Scheduled checks are inactive.",
    ),
    el(
      "dl",
      { class: "facts" },
      el("dt", null, "Last run"),
      el("dd", null, health.last_run ? istInstant(health.last_run) : "Never run"),
      el("dt", null, "Next run"),
      el("dd", null, health.next_run ? istInstant(health.next_run) : "Not scheduled"),
    ),
    health.stale
      ? el(
          "p",
          { class: "fail" },
          "The last run is older than the schedule expects, so the changes below may be out of date.",
        )
      : null,
    el("p", { class: "muted health-note" }, health.note),
  );
}

function alertItem(alert: AlertView): HTMLElement {
  return el(
    "li",
    { class: `alert alert-${alert.kind}`, dataset: { kind: alert.kind } },
    el(
      "div",
      { class: "alert-head" },
      el("span", { class: "alert-kind" }, KIND_LABEL[alert.kind]),
      el("span", { class: "alert-date mono" }, humanDate(alert.date)),
      sourceBadge(alert.source),
    ),
    el("p", { class: "alert-sentence" }, alert.sentence),
    el(
      "p",
      { class: "alert-meta" },
      link(`/vendors/${encodeURIComponent(alert.vendor.id)}`, alert.vendor.legal_name),
      el("span", { class: "muted mono" }, ` ${alert.vendor.gstin}`),
      alert.itc_at_risk > 0
        ? el("span", { class: "itc-at-risk" }, `ITC at risk ${rupees(alert.itc_at_risk)}`)
        : null,
    ),
  );
}

/** Newest first. Dates are ISO, so a string compare is the date compare. */
const newestFirst = (alerts: AlertView[]): AlertView[] =>
  [...alerts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

export const alertsScreen: Screen = (root, _params, ctx) => {
  ctx.setTitle("Alerts");
  const body = el("div", { class: "alerts-body" });
  let live = true;

  root.append(
    pageHeader({
      eyebrow: "Alerts",
      title: "What changed",
      lede: "Each line below is a difference between two sealed captures of the same vendor, newest first.",
    }),
    body,
  );
  body.append(el("p", { class: "muted" }, "Reading the change history…"));

  void getAlerts().then(
    ({ alerts, health }) => {
      if (!live) return;
      const ordered = newestFirst(alerts);
      clear(body);
      body.append(
        healthCard(health),
        el(
          "section",
          { class: "card alerts-card", dataset: { testid: "alerts" } },
          el("h2", null, `Changes${ordered.length > 0 ? ` · ${ordered.length}` : ""}`),
          ordered.length === 0
            ? emptyState("No change has been recorded yet. Alerts appear once a vendor's record differs from its last capture.")
            : el("ul", { class: "alerts" }, ordered.map(alertItem)),
        ),
      );
    },
    (error: unknown) => {
      if (!live) return;
      clear(body);
      body.append(errorBox(`The change history could not be read: ${describeError(error)}`));
    },
  );

  return () => {
    live = false;
  };
};
