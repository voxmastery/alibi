import type { EdgeAttribute } from "./types.js";

export const ATTRIBUTE_LABELS: Record<EdgeAttribute, string> = {
  pan: "PAN",
  bank_account: "bank account",
  address: "registered address",
  phone: "contact number",
  email: "email address",
  filing_ip: "filing IP",
};

/** Fixed order for naming attributes in a sentence, so output never depends on edge order. */
export const ATTRIBUTE_ORDER: EdgeAttribute[] = ["bank_account", "address", "phone", "email", "filing_ip", "pan"];

const NUMBER_WORDS = new Map<number, string>([
  [2, "two"], [3, "three"], [4, "four"], [5, "five"], [6, "six"],
  [7, "seven"], [8, "eight"], [9, "nine"], [10, "ten"],
]);

export function countLabel(value: number): string {
  return NUMBER_WORDS.get(value) ?? String(value);
}

export function listNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

const moneyFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatMoney(value: number): string {
  return moneyFormat.format(value);
}

export function dateOnly(value: string): string {
  return value.slice(0, 10);
}

export function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
}

export function monthsBetween(from: string, to: string): number {
  return Math.max(0, monthIndex(to) - monthIndex(from));
}

export function addMonths(date: string, amount: number): string {
  const value = new Date(`${dateOnly(date)}T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 10);
}
