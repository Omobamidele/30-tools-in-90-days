import { describe, expect, it } from "vitest";
import { cancellationTerms, fbMinimumInputs, fbMinimumTerms, parseTerms, roomBlockInputs, roomBlockTerms } from "@/core/clauses/schemas";
import { computeCancellation } from "@/core/exposure/cancellation";
import { computeAttrition } from "@/core/exposure/attrition";
import { computeFbShortfall } from "@/core/exposure/fb";
import { computeEventExposure } from "@/core/exposure/event";
import { generateObligations } from "@/core/obligations/generate";
import { changeTotals, internalApprovalReason } from "@/core/pricing/price";
import { isEditable, nextStatus } from "@/core/changes/state";
import { formatMoney, pctToBps } from "@/core/money";

describe("cancellation bases", () => {
  const values = { contractValueMinor: null, roomRevenueMinor: 6_426_000, fbMinimumMinor: 5_000_000 };

  it("uses room revenue or the F&B minimum as the basis when the contract says so", () => {
    const rooms = cancellationTerms.parse({ basis: "ROOM_REVENUE", tiers: [{ startsOn: "2027-01-01", penaltyPct: 50 }] });
    const fb = cancellationTerms.parse({ basis: "FB_MINIMUM", tiers: [{ startsOn: "2027-01-01", penaltyPct: 100 }] });
    const r1 = computeCancellation(rooms, "2027-02-01", values, 0);
    const r2 = computeCancellation(fb, "2027-02-01", values, 0);
    expect(r1.status === "COMPLETE" && r1.amountMinor).toBe(3_213_000);
    expect(r2.status === "COMPLETE" && r2.amountMinor).toBe(5_000_000);
  });

  it("reports no next step after the last tier", () => {
    const t = cancellationTerms.parse({ basis: "ROOM_REVENUE", tiers: [{ startsOn: "2027-01-01", penaltyPct: 50 }] });
    const r = computeCancellation(t, "2027-12-01", values, 0);
    expect(r.status === "COMPLETE" && r.working.nextStep).toBeNull();
  });
});

describe("attrition and F&B edge cases", () => {
  it("handles a cumulative block with zero rooms", () => {
    const t = roomBlockTerms.parse({
      nights: [{ date: "2027-01-01", rooms: 0, rateMinor: 10_000 }],
      commitmentPct: 80,
      basis: "CUMULATIVE",
      cutoffDate: "2026-12-01",
    });
    const r = computeAttrition(t, roomBlockInputs.parse({}), {
      capturedAt: "x",
      nights: { "2027-01-01": { pickedUp: 0, forecastFinal: null } },
    });
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(0);
  });

  it("uses a manual F&B forecast as entered when no scenario is applied", () => {
    const r = computeFbShortfall(
      fbMinimumTerms.parse({ minimumMinor: 1_000_000 }),
      fbMinimumInputs.parse({ forecastMethod: "MANUAL", forecastManualMinor: 900_000 }),
      0,
    );
    expect(r.status === "COMPLETE" && r.amountMinor).toBe(100_000);
  });
});

describe("event exposure currency rounding", () => {
  it("gives the conversion rounding remainder to the client so parts sum to the total", () => {
    // 2.00 split 50/50 at 1.25: total 2.50→3, parts 1.25→1 each; remainder 1 goes to client.
    const e = computeEventExposure({
      asOf: "2027-02-01",
      forecastAttendance: 0,
      baseCurrency: "USD",
      contracts: [
        {
          contractId: "k",
          title: "Venue",
          supplierName: "Venue",
          currency: "EUR",
          contractedValueMinor: 2,
          depositsPaidMinor: 0,
          unconfirmedClauseCount: 0,
          clauses: [
            {
              id: "c",
              type: "CANCELLATION",
              label: "Cancellation",
              terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-01-01", penaltyPct: 100 }] },
              inputs: {},
            },
          ],
        },
      ],
      liabilityRules: { CANCELLATION: { bearer: "SPLIT", agencyPct: 50 } },
      fxRate: () => "1.25",
    });
    expect(e.cancellation).toMatchObject({ totalMinor: 3, agencyMinor: 1, clientMinor: 2, unassignedMinor: 0 });
  });

  it("lists missing inputs by contract when a calculation is incomplete", () => {
    const e = computeEventExposure({
      asOf: "2027-02-01",
      forecastAttendance: 100,
      baseCurrency: "USD",
      contracts: [
        {
          contractId: "k",
          title: "Hotel",
          supplierName: "Hotel",
          currency: "USD",
          contractedValueMinor: 0,
          depositsPaidMinor: 0,
          unconfirmedClauseCount: 0,
          clauses: [{ id: "f", type: "FB_MINIMUM", label: "F&B", terms: { minimumMinor: 100 }, inputs: {} }],
        },
      ],
      liabilityRules: null,
      fxRate: () => null,
    });
    expect(e.complete).toBe(false);
    expect(e.missing[0].label).toMatch(/: Hotel$/);
    expect(e.lines[0].allocation).toBeNull();
  });

  it("keeps bearer parts summing to the converted total", () => {
    const e = computeEventExposure({
      asOf: "2027-02-01",
      forecastAttendance: 0,
      baseCurrency: "USD",
      contracts: [
        {
          contractId: "k",
          title: "Venue",
          supplierName: "Venue",
          currency: "EUR",
          contractedValueMinor: 1_001,
          depositsPaidMinor: 0,
          unconfirmedClauseCount: 0,
          clauses: [
            {
              id: "c",
              type: "CANCELLATION",
              label: "Cancellation",
              terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-01-01", penaltyPct: 100 }] },
              inputs: {},
            },
          ],
        },
      ],
      liabilityRules: { CANCELLATION: { bearer: "SPLIT", agencyPct: 50 } },
      fxRate: () => "1.33333333",
    });
    const c = e.cancellation;
    expect(c.agencyMinor + c.clientMinor + c.unassignedMinor).toBe(c.totalMinor);
    expect(c.unassignedMinor).toBe(0);
  });
});

describe("other obligations and helpers", () => {
  it("creates guarantee and custom deadline obligations", () => {
    const [g] = generateObligations(
      { id: "g", type: "FINAL_GUARANTEE", terms: { dueDate: "2027-11-12", subject: "ATTENDANCE" } },
      { contractedValueMinor: 0 },
    );
    const [f] = generateObligations(
      { id: "f", type: "FINAL_GUARANTEE", terms: { dueDate: "2027-11-12" } },
      { contractedValueMinor: 0 },
    );
    const [o] = generateObligations(
      { id: "o", type: "OTHER_DEADLINE", terms: { label: "Rooming list due", dueDate: "2027-10-30" } },
      { contractedValueMinor: 0 },
    );
    expect([g.label, g.localTime]).toEqual(["Final attendance guarantee", "12:00"]);
    expect(f.label).toBe("Final F&B guarantee");
    expect([o.kind, o.label]).toEqual(["OTHER", "Rooming list due"]);
  });

  it("labels fixed-amount tier steps without a percentage", () => {
    const list = generateObligations(
      { id: "t", type: "CANCELLATION", terms: { basis: "FIXED", tiers: [{ startsOn: "2027-01-01", penaltyFixedMinor: 1 }] } },
      { contractedValueMinor: 0 },
    );
    expect(list[0].label).toBe("Cancellation penalty rises");
  });

  it("parses terms by type", () => {
    expect(parseTerms("OTHER_DEADLINE", { label: "x", dueDate: "2027-01-01" }).dueTime).toBe("17:00");
  });

  it("needs no approval for an empty change", () => {
    expect(internalApprovalReason(changeTotals([]), { approvalLimitMinor: 1, marginFloorPct: 10 })).toBeNull();
  });

  it("formats and validates helpers", () => {
    expect(formatMoney(100, "GBP")).toBe("GBP 1.00");
    expect(formatMoney(100, "GBP")).toBe("GBP 1.00"); // cached formatter
    expect(() => pctToBps(Number.NaN)).toThrow();
  });
});

describe("change lifecycle remaining transitions", () => {
  const ctx = { internalApprovalRequired: true };
  it("covers send back, reject, expire, withdraw", () => {
    expect(nextStatus("INTERNAL_REVIEW", "SEND_BACK", ctx)).toBe("DRAFT");
    expect(nextStatus("SENT_TO_CLIENT", "CLIENT_REJECT", ctx)).toBe("REJECTED");
    expect(nextStatus("SENT_TO_CLIENT", "EXPIRE", ctx)).toBe("EXPIRED");
    expect(nextStatus("SENT_TO_CLIENT", "WITHDRAW", ctx)).toBe("WITHDRAWN");
    expect(nextStatus("DRAFT", "WITHDRAW", ctx)).toBe("WITHDRAWN");
    for (const [from, action] of [
      ["DRAFT", "APPROVE_INTERNAL"],
      ["DRAFT", "SEND_BACK"],
      ["DRAFT", "CLIENT_REJECT"],
      ["DRAFT", "EXPIRE"],
      ["DRAFT", "REISSUE"],
      ["SENT_TO_CLIENT", "SUBMIT"],
    ] as const) {
      expect(nextStatus(from, action, ctx)).toBeNull();
    }
    expect(isEditable("DRAFT")).toBe(true);
    expect(isEditable("SENT_TO_CLIENT")).toBe(false);
  });
});
