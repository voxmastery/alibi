import { describe, expect, it } from "vitest";
import { humanDate, istInstant, monthLabel, rupees, shortHash } from "../src/ui/format.js";

describe("format", () => {
  it("rupees groups by the Indian numbering system with a rupee prefix", () => {
    expect(rupees(4250000)).toBe("₹42,50,000");
  });

  it("humanDate reads the date part in UTC, from a date or a full instant", () => {
    expect(humanDate("2026-09-19")).toBe("19 Sep 2026");
    expect(humanDate("2026-09-19T10:00:00.000Z")).toBe("19 Sep 2026");
  });

  it("istInstant renders the UTC instant on the IST clock", () => {
    expect(istInstant("2026-09-19T10:00:00.000Z")).toBe("19 Sep 2026, 15:30 IST");
  });

  it("shortHash truncates a hex hash to n characters", () => {
    expect(shortHash("abcdef0123456789abcdef0123456789")).toBe("abcdef012345");
  });

  it("monthLabel renders a YYYY-MM as a short month and year", () => {
    expect(monthLabel("2026-03")).toBe("Mar 2026");
  });
});
