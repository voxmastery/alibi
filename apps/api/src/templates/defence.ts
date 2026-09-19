import type { DefenceFile, SnapshotView, TransactionView } from "@alibi/contracts";
import { humanDate, rupees } from "../services/format.js";

/** Every value that reaches the document passes through here. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const e = escapeHtml;
const dash = "&mdash;";

const SERIF = "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif";
const SANS = "'Source Sans 3', 'Source Sans Pro', 'Helvetica Neue', Arial, sans-serif";
const MONO = "'Source Code Pro', 'SF Mono', Menlo, Consolas, monospace";

const STYLE = `
  @page { size: A4; margin: 18mm; }
  :root {
    --paper: #fdfcf9;
    --ink: #1b1a17;
    --ink-soft: #55534d;
    --rule: #ddd8cc;
    --band: #f4f1e8;
    --ok: #1f5f3f;
    --ok-bg: #edf6f0;
    --bad: #8c2018;
    --bad-bg: #fbeeec;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 0 26mm; background: var(--paper); color: var(--ink);
    font-family: ${SANS}; font-size: 10.5pt; line-height: 1.5;
  }
  h1 { font-family: ${SANS}; font-size: 11pt; letter-spacing: 0.18em; text-transform: uppercase; margin: 0 0 6px; font-weight: 600; }
  h2 { font-family: ${SANS}; font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft); margin: 22px 0 6px; font-weight: 600; }
  .name { font-family: ${SERIF}; font-size: 19pt; line-height: 1.2; margin: 0 0 4px; }
  .mono { font-family: ${MONO}; font-size: 9.5pt; }
  header { border-bottom: 2px solid var(--ink); padding-bottom: 10px; }
  .meta { color: var(--ink-soft); font-size: 9.5pt; }
  .badge {
    display: inline-block; border: 1px solid var(--ink); padding: 1px 7px; margin-left: 8px;
    font-family: ${MONO}; font-size: 8pt; letter-spacing: 0.22em; vertical-align: 3px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; font-weight: 600; font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-soft); border-bottom: 1px solid var(--ink); padding: 4px 6px; }
  td { border-bottom: 1px solid var(--rule); padding: 4px 6px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: var(--band); }
  .num { text-align: right; font-family: ${MONO}; white-space: nowrap; }
  .chain { margin: 18px 0 0; padding: 8px 12px; border: 1px solid var(--ok); background: var(--ok-bg); color: var(--ok); font-family: ${MONO}; font-size: 9pt; }
  .chain.failed { border-color: var(--bad); background: var(--bad-bg); color: var(--bad); }
  .statement { margin: 18px 0 0; padding: 12px 14px; border: 1px solid var(--rule); background: #fff; }
  .statement p { font-family: ${SERIF}; font-size: 11pt; margin: 0 0 8px; }
  .statement p:last-child { margin-bottom: 0; }
  .empty { color: var(--ink-soft); font-style: italic; }
  footer {
    position: fixed; left: 0; right: 0; bottom: 0; padding: 6px 18mm 8px;
    border-top: 1px solid var(--rule); background: var(--paper);
    font-size: 8.5pt; color: var(--ink-soft);
    display: flex; justify-content: space-between; gap: 12px;
  }
  footer .mark { font-family: ${MONO}; letter-spacing: 0.22em; }
`;

function transactionRow(transaction: TransactionView): string {
  return `<tr>
      <td class="mono">${e(transaction.invoice_no)}</td>
      <td>${e(humanDate(transaction.date))}</td>
      <td class="num">${e(rupees(transaction.amount))}</td>
      <td class="num">${e(rupees(transaction.itc_claimed))}</td>
      <td>${e(transaction.payment_mode)}</td>
      <td class="mono">${transaction.eway_bill ? e(transaction.eway_bill) : dash}</td>
      <td>${transaction.status_on_date ? e(transaction.status_on_date) : "No capture in force"}</td>
      <td>${transaction.returns_current_on_date === null ? dash : transaction.returns_current_on_date ? "Yes" : "No"}</td>
    </tr>`;
}

function snapshotRow(snapshot: SnapshotView): string {
  return `<tr>
      <td class="num">${snapshot.seq}</td>
      <td>${e(humanDate(snapshot.captured_at))}</td>
      <td>${snapshot.status ? e(snapshot.status) : e(snapshot.error ?? "Lookup failed")}</td>
      <td>${snapshot.returns_current === null ? dash : snapshot.returns_current ? "Yes" : "No"}</td>
      <td class="mono">${e(snapshot.payload_hash.slice(0, 16))}</td>
      <td>${e(snapshot.source)}</td>
    </tr>`;
}

/**
 * One deterministic A4 document: the same DefenceFile always renders the same bytes.
 * No clock, no random ids, no external stylesheet, no script.
 */
export function renderDefenceHtml(file: DefenceFile): string {
  const mark = file.sample ? "SAMPLE" : "";
  const head = file.chain.head_hash ? file.chain.head_hash.slice(0, 16) : "none";
  const root = `${file.chain.root_hash.slice(0, 4)}&hellip;${file.chain.root_hash.slice(-4)}`;
  const chainLine = file.chain.verified
    ? `Chain verified: ${file.chain.links} links, root ${root}, head ${e(head)}`
    : `CHAIN FAILED at link ${file.chain.first_broken === null ? dash : file.chain.first_broken}`;

  const transactions =
    file.transactions.length === 0
      ? `<p class="empty">No transactions are recorded on or before this date.</p>`
      : `<table>
      <thead><tr><th>Invoice</th><th>Date</th><th>Amount</th><th>ITC claimed</th><th>Payment</th><th>E-way bill</th><th>Status on date</th><th>Returns current</th></tr></thead>
      <tbody>${file.transactions.map(transactionRow).join("")}</tbody>
    </table>`;

  const snapshots =
    file.snapshots.length === 0
      ? `<p class="empty">No capture of this GSTIN was sealed on or before this date.</p>`
      : `<table>
      <thead><tr><th>Seq</th><th>Captured</th><th>Status</th><th>Returns current</th><th>Payload hash</th><th>Source</th></tr></thead>
      <tbody>${file.snapshots.map(snapshotRow).join("")}</tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Diligence record ${e(file.vendor.legal_name)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>DILIGENCE RECORD${file.sample ? `<span class="badge">SAMPLE</span>` : ""}</h1>
  <p class="name">${e(file.vendor.legal_name)}</p>
  <p class="mono">${e(file.vendor.gstin)}${file.vendor.pan ? ` &middot; PAN ${e(file.vendor.pan)}` : ""}</p>
  <p class="meta">as of ${e(humanDate(file.as_of))}</p>
</header>

<h2>Transactions</h2>
${transactions}

<h2>Sealed captures</h2>
${snapshots}

<div class="chain${file.chain.verified ? "" : " failed"}">${chainLine}</div>

<h2>Statement</h2>
<div class="statement">${file.statement.map((sentence) => `<p>${e(sentence)}</p>`).join("")}</div>

<footer>
  <span>${e(file.notice)}</span>
  <span class="mark">${mark}</span>
</footer>
</body>
</html>
`;
}
