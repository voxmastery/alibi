/** Formatting helpers shared by every screen. No locale surprises: dates format off the UTC/IST
 * calendar day, never the viewer's local timezone, because captures are timestamped facts. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IST_OFFSET_MINUTES = 5 * 60 + 30;

const inrFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Indian digit grouping with a rupee prefix: rupees(4250000) === "₹42,50,000". */
export function rupees(n: number): string {
  return `₹${inrFormatter.format(n)}`;
}

/** Accepts a date ("2026-09-19") or a full ISO instant; always reads the date part in UTC. */
export function humanDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** Renders a UTC instant on the IST (UTC+5:30) calendar clock, e.g. "19 Sep 2026, 15:30 IST". */
export function istInstant(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MINUTES * 60_000);
  const day = shifted.getUTCDate();
  const month = MONTHS[shifted.getUTCMonth()];
  const year = shifted.getUTCFullYear();
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year}, ${hours}:${minutes} IST`;
}

/** First `n` characters of a hex hash, for compact mono display. */
export function shortHash(hex: string, n = 12): string {
  return hex.slice(0, n);
}

/** "2026-03" -> "Mar 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}
