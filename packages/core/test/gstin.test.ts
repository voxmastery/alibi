import { describe, expect, it } from "vitest";
import { gstinCheckDigit, isValidGstin, normaliseGstin } from "@alibi/core";

describe("GSTIN", () => {
  it("computes the published check digit", () => {
    expect(gstinCheckDigit("27AAPFU0939F1Z")).toBe("V");
    expect(gstinCheckDigit("07AAGFF2194N1Z")).toBe("1");
  });

  it("accepts known-valid GSTINs, with whitespace and lowercase normalised", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("  07aagff2194n1z1 ")).toBe(true);
    expect(normaliseGstin("  07aagff2194n1z1 ")).toBe("07AAGFF2194N1Z1");
  });

  it("rejects a wrong check digit, wrong length, and the old seed data's made-up numbers", () => {
    expect(isValidGstin("27AAPFU0939F1ZA")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1ZVV")).toBe(false);
    expect(isValidGstin("29FCOAM1497S1Z1")).toBe(false);
    expect(isValidGstin("")).toBe(false);
  });

  it("rejects malformed structure even when the check digit happens to match", () => {
    const body = "2AAAPFU0939F1Z"; // state code must be two digits
    expect(isValidGstin(body + gstinCheckDigit(body))).toBe(false);
  });

  it("refuses characters outside the base-36 alphabet", () => {
    expect(() => gstinCheckDigit("27AAPFU0939F1-")).toThrow(TypeError);
  });
});
