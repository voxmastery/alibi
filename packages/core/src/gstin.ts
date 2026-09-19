const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Two-digit state code, ten-character PAN, entity code, the letter Z, check digit. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Check digit for the first 14 characters of a GSTIN.
 * Each character maps to its base-36 value; positions alternate factors 1 and 2 (starting at 1);
 * each product contributes floor(p / 36) + p mod 36; the check digit is (36 - sum mod 36) mod 36.
 */
export function gstinCheckDigit(first14: string): string {
  if (first14.length !== 14) {
    throw new TypeError(`gstinCheckDigit: expected 14 characters, got ${first14.length}`);
  }
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const value = ALPHABET.indexOf(first14[i]!);
    if (value < 0) {
      throw new TypeError(`gstinCheckDigit: character "${first14[i]}" is not in the base-36 alphabet`);
    }
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36]!;
}

export function normaliseGstin(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidGstin(value: string): boolean {
  const gstin = normaliseGstin(value);
  if (!GSTIN_PATTERN.test(gstin)) return false;
  return gstinCheckDigit(gstin.slice(0, 14)) === gstin[14];
}
