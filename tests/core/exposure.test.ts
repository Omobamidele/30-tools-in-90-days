import { describe, expect, it } from "vitest";
import {
  cancellationTerms,
  fbMinimumInputs,
  fbMinimumTerms,
  roomBlockInputs,
  roomBlockTerms,
  paymentTerms,
} from "@/core/clauses/schemas";
import { computeAttrition, roomRevenue } from "@/core/exposure/attrition";
import { computeFbShortfall } from "@/core/exposure/fb";
import { activeTier, cancellationStaircase, computeCancellation } from "@/core/exposure/cancellation";
import { allocate } from "@/core/exposure/allocate";
import { attendanceDeltaPct, computeEventExposure, diffExposure, type ContractInput } from "@/core/exposure/event";
import type { PickupInput } from "@/core/exposure/types";

const block = roomBlockTerms.parse({
  blockName: "Block A",
  nights: [
    { date: "2027-11-14", rooms: 120, rateMinor: 18_900 },
    { date: "2027-11-15", rooms: 220, rateMinor: 18_900 },
  ],
  commitmentPct: 80,
  basis: "PER_NIGHT",
  damagesPct: 100,
  cutoffDate: "2027-10-21",
});

const pickup = (nights: Record<string, [number, number | null]>): PickupInput => ({
  capturedAt: "2026-09-22T10:00:00.000Z",
  nights: Object.fromEntries(Object.entries(nights).map(([d, [p, f]]) => [d, { pickedUp: p, forecastFinal: f }])),
});

describe("attrition", () => {
  it("matches the worked example in the design doc (per night)", () => {
    const r = computeAttrition(block, roomBlockInputs.parse({}), pickup({ "2027-11-14": [71, null], "2027-11-15": [140, null] }));
    expect(r.status).toBe("COMPLETE");
    if (r.status !== "COMPLETE") return;
    expect(r.working.rows.map((x) => [x.committed, x.short, x.amountMinor])).toEqual([
      [96, 25, 472_500],
      [176, 36, 680_400],
    ]);
    expect(r.amountMinor).toBe(1_152_900);
  });

  it("never credits pickup above the block", () => {
    const r = computeAttrition(block, roomBlockInputs.parse({}), pickup({ "2027-11-14": [150, null], "2027-11-15": [300, null] }));
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(0);
  });

  it("applies damages percentage", () => {
    const half = { ...block, damagesPct: 50 };
    const r = computeAttrition(half, roomBlockInputs.parse({}), pickup({ "2027-11-14": [71, null], "2027-11-15": [176, null] }));
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(236_250); // 25 × 189.00 × 50%
  });

  it("is incomplete without pickup, listing what is missing", () => {
    const none = computeAttrition(block, roomBlockInputs.parse({}), null);
    expect(none.status).toBe("INCOMPLETE");
    const partial = computeAttrition(block, roomBlockInputs.parse({}), pickup({ "2027-11-14": [71, null] }));
    expect(partial.status === "INCOMPLETE" && partial.missing.map((m) => m.field)).toEqual(["pickup.2027-11-15"]);
  });

  it("uses forecast final pickup when the projection method is FORECAST", () => {
    const inputs = roomBlockInputs.parse({ projection: "FORECAST" });
    const missing = computeAttrition(block, inputs, pickup({ "2027-11-14": [71, 100], "2027-11-15": [140, null] }));
    expect(missing.status).toBe("INCOMPLETE");
    const r = computeAttrition(block, inputs, pickup({ "2027-11-14": [71, 100], "2027-11-15": [140, 170] }));
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(6 * 18_900); // only night 2 short by 6
  });

  it("calculates cumulative attrition at the room-weighted average rate", () => {
    const cumulative = roomBlockTerms.parse({
      ...block,
      basis: "CUMULATIVE",
      nights: [
        { date: "2027-11-14", rooms: 100, rateMinor: 20_000 },
        { date: "2027-11-15", rooms: 100, rateMinor: 10_000 },
      ],
    });
    const r = computeAttrition(cumulative, roomBlockInputs.parse({}), pickup({ "2027-11-14": [70, null], "2027-11-15": [70, null] }));
    expect(r.status).toBe("COMPLETE");
    if (r.status !== "COMPLETE") return;
    expect(r.working.totals).toMatchObject({ committed: 160, projected: 140, short: 20, averageRateMinor: 15_000 });
    expect(r.amountMinor).toBe(300_000);
  });

  it("scales projected pickup in scenarios", () => {
    const r = computeAttrition(
      block,
      roomBlockInputs.parse({}),
      pickup({ "2027-11-14": [71, null], "2027-11-15": [140, null] }),
      80,
    );
    // 71 → 57 (56.8), 140 → 112
    expect(r.status === "COMPLETE" && r.working.rows.map((x) => x.projected)).toEqual([57, 112]);
  });

  it("rejects duplicate nights", () => {
    expect(() =>
      roomBlockTerms.parse({ ...block, nights: [block.nights[0], block.nights[0]] }),
    ).toThrow(/only once/);
  });

  it("computes contracted room revenue", () => {
    expect(roomRevenue(block)).toBe(340 * 18_900);
  });
});

describe("F&B shortfall", () => {
  const terms = fbMinimumTerms.parse({ minimumMinor: 5_000_000, surchargePct: 22 });

  it("projects shortfall from per-head spend plus surcharge", () => {
    const r = computeFbShortfall(terms, fbMinimumInputs.parse({ perHeadMinor: 10_000 }), 420);
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(976_000); // 800,000 + 22%
  });

  it("is zero when the forecast meets the minimum", () => {
    const r = computeFbShortfall(terms, fbMinimumInputs.parse({ perHeadMinor: 20_000 }), 420);
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(0);
  });

  it("is incomplete without a forecast", () => {
    expect(computeFbShortfall(terms, fbMinimumInputs.parse({}), 420).status).toBe("INCOMPLETE");
    expect(computeFbShortfall(terms, fbMinimumInputs.parse({ forecastMethod: "MANUAL" }), 420).status).toBe("INCOMPLETE");
  });

  it("scales attendance in scenarios", () => {
    const r = computeFbShortfall(terms, fbMinimumInputs.parse({ perHeadMinor: 10_000 }), 420, 80);
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(2_000_800); // 336 heads → 1,640,000 + 22%
    const manual = computeFbShortfall(
      terms,
      fbMinimumInputs.parse({ forecastMethod: "MANUAL", forecastManualMinor: 4_000_000 }),
      420,
      50,
    );
    expect(manual.status === "COMPLETE" && manual.amountMinor).toBe(3_660_000); // 3,000,000 + 22%
  });
});

describe("cancellation", () => {
  const terms = cancellationTerms.parse({
    basis: "CONTRACT_VALUE",
    tiers: [
      { startsOn: "2027-01-01", penaltyPct: 25 },
      { startsOn: "2027-10-16", penaltyPct: 50 },
      { startsOn: "2027-11-01", penaltyPct: 100 },
    ],
  });
  const values = { contractValueMinor: 24_520_000, roomRevenueMinor: null, fbMinimumMinor: null };

  it("has no penalty before the first tier and reports the next step", () => {
    const r = computeCancellation(terms, "2026-12-31", values, 0);
    expect(r.status).toBe("COMPLETE");
    if (r.status !== "COMPLETE") return;
    expect(r.amountMinor).toBe(0);
    expect(r.working.tier).toBeNull();
    expect(r.working.nextStep).toEqual({ startsOn: "2027-01-01", penaltyPct: 25, amountMinor: 6_130_000 });
  });

  it("assigns the step-up date to the higher tier", () => {
    const day = computeCancellation(terms, "2027-10-16", values, 0);
    const before = computeCancellation(terms, "2027-10-15", values, 0);
    expect(day.status === "COMPLETE" && day.amountMinor).toBe(12_260_000);
    expect(before.status === "COMPLETE" && before.amountMinor).toBe(6_130_000);
    expect(activeTier(terms, "2027-12-01")?.penaltyPct).toBe(100);
  });

  it("credits deposits against the penalty when the contract says so", () => {
    const credited = computeCancellation(terms, "2027-10-20", values, 4_000_000);
    expect(credited.status === "COMPLETE" && credited.working.netOwedMinor).toBe(8_260_000);
    const additional = computeCancellation({ ...terms, depositTreatment: "ADDITIONAL" }, "2027-10-20", values, 4_000_000);
    expect(additional.status === "COMPLETE" && additional.working.netOwedMinor).toBe(12_260_000);
    const overpaid = computeCancellation(terms, "2027-01-05", values, 9_000_000);
    expect(overpaid.status === "COMPLETE" && overpaid.working.netOwedMinor).toBe(0);
  });

  it("supports fixed-amount schedules", () => {
    const fixed = cancellationTerms.parse({
      basis: "FIXED",
      tiers: [{ startsOn: "2027-06-01", penaltyFixedMinor: 1_500_000 }],
    });
    const r = computeCancellation(fixed, "2027-07-01", { contractValueMinor: null, roomRevenueMinor: null, fbMinimumMinor: null }, 0);
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(1_500_000);
  });

  it("is incomplete when the basis value is unknown", () => {
    const r = computeCancellation(terms, "2027-10-20", { ...values, contractValueMinor: null }, 0);
    expect(r.status).toBe("INCOMPLETE");
  });

  it("validates tier order and required amounts", () => {
    expect(() =>
      cancellationTerms.parse({
        basis: "CONTRACT_VALUE",
        tiers: [
          { startsOn: "2027-05-01", penaltyPct: 25 },
          { startsOn: "2027-05-01", penaltyPct: 50 },
        ],
      }),
    ).toThrow(/after the previous/);
    expect(() => cancellationTerms.parse({ basis: "FIXED", tiers: [{ startsOn: "2027-05-01" }] })).toThrow(/fixed penalty/);
  });

  it("builds the staircase for the timeline", () => {
    expect(cancellationStaircase(terms, values)?.map((s) => s.amountMinor)).toEqual([6_130_000, 12_260_000, 24_520_000]);
  });
});

describe("allocation", () => {
  it("follows the liability rule", () => {
    expect(allocate(1_000, "ATTRITION", { ATTRITION: { bearer: "CLIENT", agencyPct: 0 } })).toMatchObject({
      clientMinor: 1_000,
      agencyMinor: 0,
      unassignedMinor: 0,
    });
    expect(allocate(1_000, "ATTRITION", { ATTRITION: { bearer: "AGENCY", agencyPct: 0 } }).agencyMinor).toBe(1_000);
  });

  it("splits so parts always sum to the whole", () => {
    const a = allocate(1_001, "FB_SHORTFALL", { FB_SHORTFALL: { bearer: "SPLIT", agencyPct: 50 } });
    expect([a.agencyMinor, a.clientMinor]).toEqual([501, 500]);
  });

  it("never assigns without a rule", () => {
    expect(allocate(1_000, "CANCELLATION", null)).toMatchObject({ unassignedMinor: 1_000, rule: null });
    expect(allocate(1_000, "CANCELLATION", { ATTRITION: { bearer: "CLIENT", agencyPct: 0 } }).unassignedMinor).toBe(1_000);
  });
});

describe("event exposure", () => {
  const hotel: ContractInput = {
    contractId: "k1",
    title: "Hotel Tivoli: group agreement",
    supplierName: "Hotel Tivoli",
    currency: "USD",
    contractedValueMinor: 24_520_000,
    depositsPaidMinor: 4_000_000,
    unconfirmedClauseCount: 0,
    clauses: [
      {
        id: "c-block",
        type: "ROOM_BLOCK",
        label: "Block A",
        terms: block,
        inputs: {},
        pickup: pickup({ "2027-11-14": [71, null], "2027-11-15": [140, null] }),
      },
      {
        id: "c-fb",
        type: "FB_MINIMUM",
        label: "F&B minimum",
        terms: { minimumMinor: 5_000_000, surchargePct: 22 },
        inputs: { perHeadMinor: 10_000 },
      },
      {
        id: "c-cxl",
        type: "CANCELLATION",
        label: "Cancellation",
        terms: {
          basis: "CONTRACT_VALUE",
          tiers: [
            { startsOn: "2027-01-01", penaltyPct: 25 },
            { startsOn: "2027-10-16", penaltyPct: 50 },
          ],
        },
        inputs: {},
      },
    ],
  };

  const venue: ContractInput = {
    contractId: "k2",
    title: "Centro Congressos: venue hire",
    supplierName: "Centro Congressos",
    currency: "EUR",
    contractedValueMinor: 10_000_000,
    depositsPaidMinor: 0,
    unconfirmedClauseCount: 0,
    clauses: [
      {
        id: "c-cxl2",
        type: "CANCELLATION",
        label: "Cancellation",
        terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-03-01", penaltyPct: 20 }] },
        inputs: {},
      },
    ],
  };

  const rules = {
    ATTRITION: { bearer: "CLIENT" as const, agencyPct: 0 },
    FB_SHORTFALL: { bearer: "SPLIT" as const, agencyPct: 50 },
  };

  it("totals current exposure by bearer in the base currency", () => {
    const e = computeEventExposure({
      asOf: "2027-10-20",
      forecastAttendance: 420,
      baseCurrency: "USD",
      contracts: [hotel, venue],
      liabilityRules: rules,
      fxRate: (from, to) => (from === "EUR" && to === "USD" ? "1.10" : null),
    });
    expect(e.complete).toBe(true);
    // attrition 1,152,900 (client) + F&B 976,000 (split 488,000 / 488,000)
    expect(e.current).toEqual({ totalMinor: 2_128_900, agencyMinor: 488_000, clientMinor: 1_640_900, unassignedMinor: 0 });
    // cancellation: hotel 50% of 24,520,000 = 12,260,000; venue 20% of 10,000,000 EUR = 2,000,000 → 2,200,000 USD
    expect(e.cancellation.totalMinor).toBe(14_460_000);
    expect(e.cancellation.unassignedMinor).toBe(14_460_000); // no cancellation rule in this agreement
    expect(e.cancellation.netOwedMinor).toBe(8_260_000 + 2_200_000); // hotel deposit credited
  });

  it("is incomplete when an FX rate is missing, and says which", () => {
    const e = computeEventExposure({
      asOf: "2027-10-20",
      forecastAttendance: 420,
      baseCurrency: "USD",
      contracts: [hotel, venue],
      liabilityRules: rules,
      fxRate: () => null,
    });
    expect(e.complete).toBe(false);
    expect(e.missing.map((m) => m.field)).toContain("fx.EUR");
    expect(e.cancellation.totalMinor).toBe(12_260_000); // only the USD contract counts
  });

  it("is incomplete while clauses await confirmation", () => {
    const e = computeEventExposure({
      asOf: "2027-10-20",
      forecastAttendance: 420,
      baseCurrency: "USD",
      contracts: [{ ...hotel, unconfirmedClauseCount: 2 }],
      liabilityRules: rules,
      fxRate: () => null,
    });
    expect(e.complete).toBe(false);
    expect(e.unconfirmedClauseCount).toBe(2);
  });

  it("runs scenarios without changing inputs, and diffs them", () => {
    const base = {
      asOf: "2027-10-20",
      forecastAttendance: 420,
      baseCurrency: "USD",
      contracts: [hotel],
      liabilityRules: rules,
      fxRate: () => null,
    };
    const before = computeEventExposure(base);
    const after = computeEventExposure({ ...base, scenario: { attendanceDeltaPct: -20, cancelOn: "2027-10-01" } });
    expect(after.current.totalMinor).toBeGreaterThan(before.current.totalMinor);
    expect(after.cancellation.totalMinor).toBe(6_130_000); // 25% tier on 2027-10-01
    const diff = diffExposure(before, after);
    const fb = diff.find((d) => d.kind === "FB_SHORTFALL")!;
    expect(fb.deltaMinor).toBe(2_000_800 - 976_000);
    expect(fb.bearer).toBe("SPLIT");
  });

  it("converts headcount changes to a percentage", () => {
    expect(attendanceDeltaPct(420, -60)).toBe(-14.29);
    expect(attendanceDeltaPct(0, -60)).toBe(0);
    expect(attendanceDeltaPct(100, -500)).toBe(-100);
  });
});

describe("clause schemas", () => {
  it("requires exactly one of amount or percentage for payments", () => {
    expect(() => paymentTerms.parse({ dueDate: "2027-01-01", amountMinor: 100, percentOfContract: 10 })).toThrow();
    expect(() => paymentTerms.parse({ dueDate: "2027-01-01" })).toThrow();
    expect(paymentTerms.parse({ dueDate: "2027-01-01", percentOfContract: 10 }).dueTime).toBe("17:00");
  });

  it("rejects malformed dates", () => {
    expect(() => paymentTerms.parse({ dueDate: "21/10/2027", amountMinor: 1 })).toThrow(/2027-10-21/);
  });
});
