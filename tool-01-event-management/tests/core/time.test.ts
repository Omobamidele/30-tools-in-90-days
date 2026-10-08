import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatLocal, localDateOf, localToUtc } from "@/core/time";

describe("time", () => {
  it("converts supplier-local deadlines to UTC, including DST", () => {
    // Lisbon is UTC+1 in summer (WEST), UTC+0 in winter (WET).
    expect(localToUtc("2027-07-01", "17:00", "Europe/Lisbon").toISOString()).toBe("2027-07-01T16:00:00.000Z");
    expect(localToUtc("2027-12-01", "17:00", "Europe/Lisbon").toISOString()).toBe("2027-12-01T17:00:00.000Z");
    expect(localToUtc("2027-10-21", "17:00", "America/New_York").toISOString()).toBe("2027-10-21T21:00:00.000Z");
  });

  it("finds the local date of an instant", () => {
    const i = new Date("2027-10-22T02:30:00.000Z");
    expect(localDateOf(i, "America/New_York")).toBe("2027-10-21");
    expect(localDateOf(i, "Europe/Lisbon")).toBe("2027-10-22");
    expect(formatLocal(i, "Europe/Lisbon", "HH:mm")).toBe("03:30");
  });

  it("counts and adds days across month and year boundaries", () => {
    expect(daysBetween("2027-10-10", "2027-10-21")).toBe(11);
    expect(daysBetween("2027-12-31", "2028-01-01")).toBe(1);
    expect(daysBetween("2027-10-21", "2027-10-10")).toBe(-11);
    expect(addDays("2027-02-27", 2)).toBe("2027-03-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });
});
