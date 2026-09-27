import { describe, expect, it } from "vitest";
import { generateObligations } from "@/core/obligations/generate";
import { changeTotals, internalApprovalReason, suggestPrice } from "@/core/pricing/price";
import { nextStatus } from "@/core/changes/state";

describe("obligation generation", () => {
  it("resolves percentage deposits against the contract value", () => {
    const [o] = generateObligations(
      { id: "c1", type: "PAYMENT", terms: { label: "Deposit 1", dueDate: "2027-01-15", percentOfContract: 25 } },
      { contractedValueMinor: 24_520_000 },
    );
    expect(o).toMatchObject({ kind: "PAYMENT", amountMinor: 6_130_000, localDate: "2027-01-15", localTime: "17:00" });
  });

  it("creates cutoff and review obligations for room blocks", () => {
    const list = generateObligations(
      {
        id: "c2",
        type: "ROOM_BLOCK",
        terms: {
          blockName: "Block A",
          nights: [{ date: "2027-11-14", rooms: 100, rateMinor: 10_000 }],
          commitmentPct: 80,
          basis: "PER_NIGHT",
          cutoffDate: "2027-10-21",
          reviewPoints: [{ date: "2027-08-01", maxReductionPct: 10 }],
        },
      },
      { contractedValueMinor: 0 },
    );
    expect(list.map((o) => [o.kind, o.localDate])).toEqual([
      ["CUTOFF", "2027-10-21"],
      ["REVIEW", "2027-08-01"],
    ]);
  });

  it("creates one tier-change obligation per cancellation step", () => {
    const list = generateObligations(
      {
        id: "c3",
        type: "CANCELLATION",
        terms: {
          basis: "CONTRACT_VALUE",
          tiers: [
            { startsOn: "2027-01-01", penaltyPct: 25 },
            { startsOn: "2027-10-16", penaltyPct: 50 },
          ],
        },
      },
      { contractedValueMinor: 1 },
    );
    expect(list.map((o) => o.label)).toEqual(["Cancellation penalty rises to 25%", "Cancellation penalty rises to 50%"]);
  });

  it("creates nothing for F&B minimums (exposure only)", () => {
    expect(generateObligations({ id: "c4", type: "FB_MINIMUM", terms: { minimumMinor: 1 } }, { contractedValueMinor: 0 })).toEqual([]);
  });
});

describe("change pricing", () => {
  const rules = { defaultMarkupPct: 15, markupByCategoryPct: { "AV & production": 20 }, managementFeePct: 0 };

  it("suggests price from category markup, symmetric for reductions", () => {
    expect(suggestPrice(rules, "Food & beverage", -1_080_000)).toBe(-1_242_000); // design doc example
    expect(suggestPrice(rules, "AV & production", 100_000)).toBe(120_000);
    expect(suggestPrice({ ...rules, managementFeePct: 10 }, "Other", 100_000)).toBe(126_500);
  });

  it("computes margin on the change", () => {
    expect(changeTotals([{ costDeltaMinor: 100_000, priceDeltaMinor: 115_000 }])).toEqual({
      costDeltaMinor: 100_000,
      priceDeltaMinor: 115_000,
      marginMinor: 15_000,
      marginPct: 13.04,
    });
    expect(changeTotals([]).marginPct).toBeNull();
  });

  it("requires internal approval above the limit, below the floor, or for absorbed costs", () => {
    const r = { approvalLimitMinor: 2_500_000, marginFloorPct: 14 };
    expect(internalApprovalReason(changeTotals([{ costDeltaMinor: 100_000, priceDeltaMinor: 120_000 }]), r)).toBeNull();
    expect(internalApprovalReason(changeTotals([{ costDeltaMinor: 100_000, priceDeltaMinor: 115_000 }]), r)).toMatch(/margin/);
    expect(internalApprovalReason(changeTotals([{ costDeltaMinor: 3_000_000, priceDeltaMinor: 4_000_000 }]), r)).toMatch(/limit/);
    expect(internalApprovalReason(changeTotals([{ costDeltaMinor: 50_000, priceDeltaMinor: 0 }]), r)).toMatch(/no price/);
  });
});

describe("change request lifecycle", () => {
  it("routes submission through internal review only when required", () => {
    expect(nextStatus("DRAFT", "SUBMIT", { internalApprovalRequired: true })).toBe("INTERNAL_REVIEW");
    expect(nextStatus("DRAFT", "SUBMIT", { internalApprovalRequired: false })).toBe("SENT_TO_CLIENT");
  });

  it("allows only valid transitions", () => {
    const ctx = { internalApprovalRequired: false };
    expect(nextStatus("INTERNAL_REVIEW", "APPROVE_INTERNAL", ctx)).toBe("SENT_TO_CLIENT");
    expect(nextStatus("SENT_TO_CLIENT", "CLIENT_APPROVE", ctx)).toBe("APPROVED");
    expect(nextStatus("APPROVED", "APPLY", ctx)).toBe("APPLIED");
    expect(nextStatus("EXPIRED", "REISSUE", ctx)).toBe("SENT_TO_CLIENT");
    expect(nextStatus("APPLIED", "WITHDRAW", ctx)).toBeNull();
    expect(nextStatus("DRAFT", "CLIENT_APPROVE", ctx)).toBeNull();
    expect(nextStatus("REJECTED", "APPLY", ctx)).toBeNull();
  });
});
