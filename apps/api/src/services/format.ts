import { formatMoney } from "@alibi/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-19" -> "19 Sep 2026". Anything that is not a plain ISO date is returned unchanged. */
export function humanDate(date: string): string {
  const iso = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return date;
  const month = MONTHS[Number(iso.slice(5, 7)) - 1];
  if (!month) return date;
  return `${Number(iso.slice(8, 10))} ${month} ${iso.slice(0, 4)}`;
}

/** Indian digit grouping with the rupee sign: 4250000 -> "₹42,50,000". */
export function rupees(value: number): string {
  return `₹${formatMoney(value)}`;
}

/** Never shows more than the last four digits of an account number. */
export function maskAccount(account: string): string;
export function maskAccount(account: string | null): string | null;
export function maskAccount(account: string | null): string | null {
  if (!account) return null;
  return `XXXX${account.slice(-4)}`;
}

/** The UTC calendar date of an instant, which is the as_of every service defaults to. */
export function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}
