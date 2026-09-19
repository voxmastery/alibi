import { describe, expect, it } from "vitest";
import { addMonths, countLabel, formatMoney, listNames, monthsBetween } from "@alibi/core";

describe("risk text helpers", () => {
  it("spells two to ten, leaves other counts numeric", () => {
    expect(countLabel(2)).toBe("two");
    expect(countLabel(10)).toBe("ten");
    expect(countLabel(1)).toBe("1");
    expect(countLabel(11)).toBe("11");
  });

  it("lists names with the serial comma", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["A"])).toBe("A");
    expect(listNames(["A", "B"])).toBe("A and B");
    expect(listNames(["A", "B", "C"])).toBe("A, B, and C");
  });

  it("formats rupees in the Indian grouping with no decimals", () => {
    expect(formatMoney(4250000)).toBe("42,50,000");
    expect(formatMoney(1234.6)).toBe("1,235");
    expect(formatMoney(0)).toBe("0");
  });

  it("counts whole months between dates and never goes negative", () => {
    expect(monthsBetween("2025-02-12", "2026-09-01")).toBe(19);
    expect(monthsBetween("2026-09-01", "2025-02-12")).toBe(0);
    expect(monthsBetween("2026-05-10", "2026-09-01")).toBe(4);
  });

  it("adds and subtracts months on the same day of month", () => {
    expect(addMonths("2025-06-15", 6)).toBe("2025-12-15");
    expect(addMonths("2026-03-01", -12)).toBe("2025-03-01");
    expect(addMonths("2026-03-01T09:30:00Z", -12)).toBe("2025-03-01");
  });
});
