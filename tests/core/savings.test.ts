import { describe, expect, it } from "vitest";
import { roomBlockInputs, roomBlockTerms } from "@/core/clauses/schemas";
import { computeEventSavings, computeReleaseSaving } from "@/core/exposure/savings";
import type { EventInput } from "@/core/exposure/event";
import type { PickupInput } from "@/core/exposure/types";

// Expected values are worked by hand: 120 and 220 rooms at $189, 80% commitment, 100% damages.
const raw = {
  blockName: "Main block",
  nights: [
    { date: "2027-11-14", rooms: 120, rateMinor: 18_900 },
    { date: "2027-11-15", rooms: 220, rateMinor: 18_900 },
  ],
  commitmentPct: 80,
  basis: "PER_NIGHT",
  damagesPct: 100,
  cutoffDate: "2027-10-21",
  reviewPoints: [{ date: "2027-10-02", maxReductionPct: 10 }],
};
const perNight = roomBlockTerms.parse(raw);
const cumulative = roomBlockTerms.parse({ ...raw, basis: "CUMULATIVE" });
const inputs = roomBlockInputs.parse({});
const review = { date: "2027-10-02", maxReductionPct: 10 };

const pickup = (a: number, b: number): PickupInput => ({
  capturedAt: "2027-09-20T10:00:00.000Z",
  nights: { "2027-11-14": { pickedUp: a, forecastFinal: null }, "2027-11-15": { pickedUp: b, forecastFinal: null } },
});

describe("savings finder: releasing rooms at a review point", () => {
  it("per night: releases what the contract allows and reports the saving", () => {
    // Before: committed 96 + 176, projected 71 + 140 → 61 short → $11,529.
    // Release 12 + 22 (10%): committed 87 + 159 → 35 short → $6,615. Saves 26 × $189 = $4,914.
    const s = computeReleaseSaving(perNight, inputs, pickup(71, 140), review)!;
    expect(s.releases).toEqual([
      { date: "2027-11-14", rooms: 12 },
      { date: "2027-11-15", rooms: 22 },
    ]);
    expect(s.roomNights).toBe(34);
    expect(s.beforeMinor).toBe(1_152_900);
    expect(s.afterMinor).toBe(661_500);
    expect(s.savingMinor).toBe(491_400);
  });

  it("gives back only the rooms needed when a small release clears the shortfall", () => {
    // 95 and 175 booked: one room short each night. 118 rooms → committed 95; 218 → 175.
    const s = computeReleaseSaving(perNight, inputs, pickup(95, 175), review)!;
    expect(s.releases).toEqual([
      { date: "2027-11-14", rooms: 2 },
      { date: "2027-11-15", rooms: 2 },
    ]);
    expect(s.afterMinor).toBe(0);
    expect(s.savingMinor).toBe(37_800);
  });

  it("cumulative: works on the whole-stay commitment", () => {
    // Before: committed 272, projected 211 → 61 short → $11,529.
    // Release 34 → 306 rooms → committed 245 → 34 short → $6,426. Saves 27 × $189 = $5,103.
    const s = computeReleaseSaving(cumulative, inputs, pickup(71, 140), review)!;
    expect(s.roomNights).toBe(34);
    expect(s.savingMinor).toBe(510_300);
  });

  it("finds nothing when pickup already meets the commitment, or figures are missing", () => {
    expect(computeReleaseSaving(perNight, inputs, pickup(100, 200), review)).toBeNull();
    expect(computeReleaseSaving(perNight, inputs, null, review)).toBeNull();
  });

  it("never releases rooms people are projected to book, and skips nights already covered", () => {
    // 10 of 120 booked, 95% release allowed: the fewest to give back is 108 (12 left → commits 10).
    // Night 2 (176 booked of 176 committed) needs nothing.
    const s = computeReleaseSaving(perNight, inputs, pickup(10, 176), { date: "2027-10-02", maxReductionPct: 95 })!;
    expect(s.releases).toEqual([{ date: "2027-11-14", rooms: 108 }]);
    expect(s.afterMinor).toBe(0);
    // Night 1 covered (115 ≥ 96): only night 2 releases.
    const t = computeReleaseSaving(perNight, inputs, pickup(115, 140), review)!;
    expect(t.releases.map((r) => r.date)).toEqual(["2027-11-15"]);
  });
});

describe("savings across an event", () => {
  const event = (asOf: string): EventInput => ({
    asOf,
    forecastAttendance: 300,
    baseCurrency: "USD",
    liabilityRules: null,
    fxRate: (from, to) => (from === to ? "1" : "1.1"),
    contracts: [
      {
        contractId: "c1",
        title: "Group agreement",
        supplierName: "Hotel Alvorada Lisboa",
        currency: "EUR",
        contractedValueMinor: 0,
        depositsPaidMinor: 0,
        unconfirmedClauseCount: 0,
        clauses: [{ id: "k1", type: "ROOM_BLOCK", label: "Main block", terms: raw, inputs: {}, pickup: pickup(71, 140) }],
      },
    ],
  });

  it("uses the next open review point and converts to the event currency", () => {
    const [o] = computeEventSavings(event("2027-09-20"));
    expect(o.supplierName).toBe("Hotel Alvorada Lisboa");
    expect(o.blockName).toBe("Main block");
    expect(o.savingMinor).toBe(491_400);
    expect(o.savingBaseMinor).toBe(540_540);
  });

  it("ignores review points that have passed", () => {
    expect(computeEventSavings(event("2027-10-03"))).toEqual([]);
  });
});
