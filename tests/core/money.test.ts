import { describe, expect, it } from "vitest";
import {
  ceilPercentOfCount,
  convertMinor,
  divideRound,
  formatMoney,
  parseMoney,
  pctToBps,
  percentOf,
  times,
} from "@/core/money";

describe("money", () => {
  it("converts percentages to basis points", () => {
    expect(pctToBps(22.5)).toBe(2250);
    expect(pctToBps(0.01)).toBe(1);
  });

  it("takes percentages with half-away-from-zero rounding", () => {
    expect(percentOf(10_000, 22.5)).toBe(2_250);
    expect(percentOf(1, 50)).toBe(1); // 0.5 → 1
    expect(percentOf(-1, 50)).toBe(-1); // −0.5 → −1
    expect(percentOf(333, 33.33)).toBe(111); // 110.9889
    expect(percentOf(0, 80)).toBe(0);
  });

  it("stays exact for large amounts (no float overflow)", () => {
    expect(percentOf(9_000_000_000_000, 99.99)).toBe(8_999_100_000_000);
  });

  it("rejects non-integer money", () => {
    expect(() => percentOf(10.5, 10)).toThrow(RangeError);
    expect(() => times(100, 1.5)).toThrow(RangeError);
  });

  it("rounds committed room counts up", () => {
    expect(ceilPercentOfCount(120, 80)).toBe(96);
    expect(ceilPercentOfCount(101, 80)).toBe(81); // 80.8
    expect(ceilPercentOfCount(0, 80)).toBe(0);
    expect(ceilPercentOfCount(10, 100)).toBe(10);
  });

  it("divides with rounding", () => {
    expect(divideRound(3_000_000, 200)).toBe(15_000);
    expect(divideRound(5, 2)).toBe(3);
    expect(() => divideRound(1, 0)).toThrow();
  });

  it("converts currency with string rates", () => {
    expect(convertMinor(10_000, "1.0850")).toBe(10_850);
    expect(convertMinor(333, "0.5")).toBe(167); // 166.5 → 167
    expect(convertMinor(100, "1")).toBe(100);
    expect(() => convertMinor(100, "1.2.3")).toThrow();
  });

  it("formats and parses amounts", () => {
    expect(formatMoney(4_820_000, "USD")).toBe("USD 48,200.00");
    expect(formatMoney(-12_420, "EUR", { withCode: false })).toBe("-124.20");
    expect(parseMoney("48,200.00")).toBe(4_820_000);
    expect(parseMoney("$1,234.5")).toBe(123_450);
    expect(parseMoney("48.200,50", ",")).toBe(4_820_050);
    expect(parseMoney("-12.40")).toBe(-1_240);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("formatMoneyShort", () => {
  it("drops cents under 10k and keeps the thousands separator", async () => {
    const { formatMoneyShort } = await import("@/core/money");
    expect(formatMoneyShort(710_640, "USD")).toBe("$7,106");
    expect(formatMoneyShort(0, "USD")).toBe("$0");
    expect(formatMoneyShort(99_949, "USD")).toBe("$999");
  });

  it("goes compact from 10k, with one decimal below 100k and none from 100k", async () => {
    const { formatMoneyShort } = await import("@/core/money");
    expect(formatMoneyShort(1_000_000, "USD")).toBe("$10k");
    expect(formatMoneyShort(1_144_640, "USD")).toBe("$11.4k");
    expect(formatMoneyShort(9_856_411, "EUR")).toBe("€98.6k");
    expect(formatMoneyShort(10_030_650, "USD")).toBe("$100k");
    expect(formatMoneyShort(35_006_001, "USD")).toBe("$350k");
    expect(formatMoneyShort(123_456_789, "GBP")).toBe("£1.2M");
  });

  it("uses an unambiguous symbol and a real minus sign", async () => {
    const { formatMoneyShort } = await import("@/core/money");
    expect(formatMoneyShort(5_000_000, "CAD")).toBe("CA$50k");
    expect(formatMoneyShort(-1_200_000, "USD")).toBe("−$12k");
  });
});
