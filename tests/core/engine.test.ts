import { describe, expect, it } from "vitest";
import { evaluateRule, isStale, termElapsed } from "@/core/rules/evaluate";
import type { Snapshot, Subscription, Terms } from "@/core/rules/types";
import { combineEstimates, estimateValue } from "@/core/value";
import { scorePriority } from "@/core/priority";
import { addBusinessDays, businessDaysUntil, deadlineState } from "@/core/business-time";
import { allowedCsqlActions, nextCsqlStatus, nextSignalStatus } from "@/core/workflow";
import { routeCsql } from "@/core/routing";
import { addDays } from "@/core/dates";
import { formatMoneyShort, parseMoney } from "@/core/money";
import type { PriceBook } from "@/config/schema";

const terms: Terms = { seats: "Seats", seatSingular: "seat", usageMetric: "Credits", usageUnit: "documents", addonName: (k) => ({ ap_automation: "AP Automation", forecasting: "Forecasting" })[k] ?? k };
const pb: PriceBook = {
  currency: "USD",
  seatPriceMinor: 120_000,
  minSeatAddOn: 5,
  seatHeadroomPct: 10,
  creditTiers: [
    { committed: 50_000, priceMinor: 2_000_000 },
    { committed: 75_000, priceMinor: 2_700_000 },
    { committed: 100_000, priceMinor: 3_400_000 },
  ],
  overagePer1000Minor: 40_000,
  addons: [
    { key: "ap_automation", name: "AP Automation", priceMinor: 1_800_000 },
    { key: "forecasting", name: "Forecasting", priceMinor: 1_200_000 },
  ],
};
const sub: Subscription = { plan: "Growth", seatsPurchased: 50, creditsCommitted: 50_000, termStart: "2026-01-01", termEnd: "2026-12-31", arrMinor: 8_000_000, addons: ["forecasting"] };

const day = (date: string, over: Partial<Snapshot> = {}): Snapshot => ({ date, activeSeats: 30, creditsUsedTerm: 0, workspaces: [], gatedAttempts: {}, openEscalations: 0, ...over });
const series = (end: string, n: number, f: (i: number) => Partial<Snapshot>) => Array.from({ length: n }, (_, i) => day(addDays(end, i - n + 1), f(i)));

describe("seat pressure", () => {
  // 9 quiet days at 38 seats, then 21 days at or above the 45-seat line (90% of 50), ending at 47.
  const w = series("2026-07-01", 30, (i) => ({ activeSeats: i < 9 ? 38 : i === 29 ? 47 : 45 + (i % 2) }));
  const run = (window: Snapshot[], sustainDays = 14) =>
    evaluateRule("SEAT_PRESSURE", { window, subscription: sub, contacts: [], params: { utilisationPct: 90, sustainDays }, today: "2026-07-01", terms });

  it("fires after the sustain period, with evidence and a trace", () => {
    const c = run(w)!;
    expect(c.explanation).toBe("47 of 50 seats active (94%) for 21 days");
    expect(c.evidence).toMatchObject({ streakDays: 21, since: "2026-06-11" });
    expect(c.trace!.threshold).toBe(45);
    expect(c.trace!.points).toHaveLength(30);
  });
  it("needs the full sustain period", () => expect(run(w, 22)).toBeNull());
  it("breaks the streak on a reporting gap longer than 2 days", () => {
    const gappy = w.filter((s) => !["2026-06-20", "2026-06-21", "2026-06-22"].includes(s.date));
    expect(run(gappy)).toBeNull();
  });
  it("doesn't fire when the latest day is below the line", () => expect(run([...w.slice(0, -1), day("2026-07-01", { activeSeats: 44 })])).toBeNull());
});

describe("usage pace", () => {
  // Term is 365 days; on Jul 1 182 days have passed. 30,000 used → 30,000 × 365/182 = 60,165 → 120%.
  const w = [day("2026-07-01", { creditsUsedTerm: 30_000 })];
  const run = (params = { projectedPct: 110, minElapsedPct: 25 }, window = w) =>
    evaluateRule("USAGE_PACE", { window, subscription: sub, contacts: [], params, today: "2026-07-01", terms });

  it("projects the term from the pace so far", () => {
    expect(termElapsed("2026-01-01", "2026-12-31", "2026-07-01")).toBeCloseTo(182 / 365);
    const c = run()!;
    expect(c.evidence).toMatchObject({ projected: 60_165, projectedPct: 120, termElapsedPct: 50 });
    expect(c.explanation).toBe("On pace to use 60,165 of 50,000 committed documents this term (120%)");
  });
  it("waits until enough of the term has passed", () => expect(run({ projectedPct: 110, minElapsedPct: 60 })).toBeNull());
  it("doesn't fire under the threshold", () => expect(run({ projectedPct: 125, minElapsedPct: 25 })).toBeNull());
  it("ignores snapshots outside the term", () => expect(run(undefined, [day("2027-01-02", { creditsUsedTerm: 90_000 })])).toBeNull());
});

describe("new team, feature intent, new executive", () => {
  it("finds the largest new workspace over the user minimum", () => {
    const w = [day("2026-07-01", { workspaces: [
      { id: "w1", name: "Finance", createdOn: "2025-02-01", activeUsers: 30 },
      { id: "w2", name: "Procurement", createdOn: "2026-06-12", activeUsers: 9 },
      { id: "w3", name: "Legal", createdOn: "2026-06-20", activeUsers: 2 },
    ] })];
    const c = evaluateRule("NEW_TEAM", { window: w, subscription: sub, contacts: [], params: { withinDays: 45, minActiveUsers: 5 }, today: "2026-07-01", terms })!;
    expect(c.explanation).toBe('New workspace "Procurement" (created Jun 12) has 9 active users');
    expect(c.valueInputs).toEqual({ kind: "NEW_TEAM", activeUsers: 9 });
  });

  it("counts attempts on unlicensed add-ons only, within the window", () => {
    const w = series("2026-07-01", 40, (i) => ({ gatedAttempts: { ap_automation: i >= 20 ? 2 : 5, forecasting: 9 } }));
    const c = evaluateRule("FEATURE_INTENT", { window: w, subscription: sub, contacts: [], params: { minAttempts: 10, windowDays: 30 }, today: "2026-07-01", terms })!;
    // Last 30 days: 10 days at 5 (i = 10..19) + 20 days at 2 = 90. Forecasting is owned, so ignored.
    expect(c.evidence).toMatchObject({ addonKey: "ap_automation", attempts: 90 });
    expect(c.explanation).toBe("90 attempts to open AP Automation in 30 days (not licensed)");
  });

  it("flags a senior contact first seen recently, never an unknown seniority", () => {
    const contacts = [
      { id: "c1", name: "Marta Kowalski", title: "CFO", seniority: "EXEC" as const, firstSeenOn: "2026-06-25" },
      { id: "c2", name: "No Title", title: null, seniority: null, firstSeenOn: "2026-06-30" },
    ];
    const c = evaluateRule("NEW_EXECUTIVE", { window: [], subscription: sub, contacts, params: { withinDays: 30, seniorities: ["EXEC", "VP"] }, today: "2026-07-01", terms })!;
    expect(c.explanation).toBe("Marta Kowalski (CFO) first active 6 days ago");
    expect(c.trace).toBeNull();
  });

  it("treats data older than the limit as stale", () => {
    expect(isStale("2026-06-27", "2026-07-01", 3)).toBe(true);
    expect(isStale("2026-06-28", "2026-07-01", 3)).toBe(false);
    expect(isStale(null, "2026-07-01", 3)).toBe(true);
  });
});

describe("estimated value", () => {
  it("sizes seats with headroom, but never below the minimum add-on", () => {
    // 47 active × 1.1 = 51.7 → 52 needed − 50 owned = 2, under the 5-seat minimum → 5 × $1,200.
    expect(estimateValue({ kind: "SEATS", activeSeats: 47, seatsPurchased: 50 }, pb, terms).valueMinor).toBe(600_000);
    // 60 × 1.1 = 66 → 16 seats × $1,200 = $19,200.
    const e = estimateValue({ kind: "SEATS", activeSeats: 60, seatsPurchased: 50 }, pb, terms);
    expect(e.valueMinor).toBe(1_920_000);
    expect(e.working).toBe("16 seats × $1,200 (60 active + 10% headroom = 66 needed, 50 owned)");
  });
  it("prices a usage overrun as the next tier up, or overage beyond the largest tier", () => {
    expect(estimateValue({ kind: "USAGE", projected: 60_165, committed: 50_000 }, pb, terms)).toMatchObject({ valueMinor: 700_000 });
    // Committed 100k (top tier), projected 112,500 → 12,500 over × $400 per 1,000 = $5,000.
    expect(estimateValue({ kind: "USAGE", projected: 112_500, committed: 100_000 }, pb, terms).valueMinor).toBe(500_000);
  });
  it("says why when it can't estimate, instead of $0", () => {
    expect(estimateValue({ kind: "ADDON", addonKey: "unknown" }, pb, terms)).toMatchObject({ valueMinor: null });
    expect(estimateValue({ kind: "SEATS", activeSeats: 10, seatsPurchased: 5 }, { ...pb, seatPriceMinor: 0 }, terms).valueMinor).toBeNull();
    expect(estimateValue({ kind: "NONE", reason: "Relationship signal" }, pb, terms)).toEqual({ valueMinor: null, working: "Relationship signal", kind: "NONE" });
  });
  it("combines signals without double-counting the same seats", () => {
    expect(combineEstimates([
      { kind: "SEATS", valueMinor: 600_000 },
      { kind: "SEATS", valueMinor: 1_080_000 },
      { kind: "ADDON:ap_automation", valueMinor: 1_800_000 },
      { kind: "NONE", valueMinor: null },
    ])).toBe(2_880_000);
    expect(combineEstimates([{ kind: "NONE", valueMinor: null }])).toBeNull();
  });
});

describe("priority", () => {
  it("adds value band, weight and renewal, and subtracts escalations, with a line for each", () => {
    const p = scorePriority({ valueMinor: 600_000, currency: "USD", ruleWeight: 10, renewalInDays: 84, renewalBoostDays: 120, openEscalations: 1 });
    expect(p.score).toBe(40); // 35 + 10 + 10 − 15
    expect(p.lines).toEqual([
      "+35 estimated $6,000 a year",
      "+10 rule weight",
      "+10 renewal in 84 days: the expansion can ride the renewal",
      "−15 1 open support escalation: talk to support first",
    ]);
  });
  it("scores unknown value low and caps at 0–100", () => {
    expect(scorePriority({ valueMinor: null, currency: "USD", ruleWeight: 0, renewalInDays: null, renewalBoostDays: 120, openEscalations: 3 }).score).toBe(0);
    expect(scorePriority({ valueMinor: 9_000_000, currency: "USD", ruleWeight: 20, renewalInDays: 10, renewalBoostDays: 120, openEscalations: 0 }).score).toBe(95);
  });
});

describe("business-day deadlines", () => {
  const cal = { timezone: "America/New_York", businessDays: [1, 2, 3, 4, 5], holidays: [] as string[] };
  const fri4pm = new Date("2026-10-09T20:00:00Z"); // Friday 16:00 New York

  it("skips weekends and holidays", () => {
    expect(addBusinessDays(fri4pm, 2, cal).toISOString()).toBe("2026-10-13T20:00:00.000Z");
    expect(addBusinessDays(fri4pm, 2, { ...cal, holidays: ["2026-10-12"] }).toISOString()).toBe("2026-10-14T20:00:00.000Z");
    expect(businessDaysUntil(fri4pm, new Date("2026-10-13T20:00:00Z"), cal)).toBe(2);
  });
  it("moves from due soon to overdue to escalate", () => {
    const due = new Date("2026-10-13T20:00:00Z");
    expect(deadlineState(fri4pm, due, new Date("2026-10-10T12:00:00Z"), cal)).toBe("ON_TRACK");
    expect(deadlineState(fri4pm, due, new Date("2026-10-12T21:00:00Z"), cal)).toBe("DUE_SOON");
    expect(deadlineState(fri4pm, due, new Date("2026-10-14T21:00:00Z"), cal)).toBe("OVERDUE");
    expect(deadlineState(fri4pm, due, new Date("2026-10-15T21:00:00Z"), cal)).toBe("ESCALATE");
  });
});

describe("workflow and routing", () => {
  it("allows only the documented moves", () => {
    expect(nextSignalStatus("NEW", "ACCEPT")).toBe("ACCEPTED");
    expect(nextSignalStatus("DISMISSED", "ACCEPT")).toBeNull();
    expect(nextSignalStatus("SNOOZED", "WAKE")).toBe("NEW");
    expect(nextCsqlStatus("ROUTED", "WIN")).toBeNull();
    expect(nextCsqlStatus("OPPORTUNITY", "WIN")).toBe("WON");
    expect(allowedCsqlActions("RETURNED").sort()).toEqual(["CLOSE_NO_OPP", "REROUTE"]);
    expect(allowedCsqlActions("WON")).toEqual([]);
  });
  it("routes to the owner, then the segment queue in turn, then the sales lead", () => {
    const queues = [{ id: "q1", segment: "mid", name: "Mid-market", cursor: 1, members: [{ id: "a", name: "A", active: true }, { id: "b", name: "B", active: false }, { id: "c", name: "C", active: true }] }];
    const lead = { id: "lead", name: "Lead" };
    expect(routeCsql({ owner: { id: "o", name: "Dana", active: true }, segment: "mid", queues, salesLead: lead })).toMatchObject({ sellerId: "o", reason: "Account owner (Dana)" });
    expect(routeCsql({ owner: null, segment: "mid", queues, salesLead: lead })).toMatchObject({ sellerId: "c", nextCursor: 0, reason: "No account owner; Mid-market round-robin" });
    expect(routeCsql({ owner: { id: "o", name: "Dana", active: false }, segment: "ent", queues, salesLead: lead })).toMatchObject({ sellerId: "lead", reason: "Owner Dana is inactive; sent to sales lead" });
    expect(routeCsql({ owner: null, segment: "ent", queues, salesLead: null }).ok).toBe(false);
  });
});

describe("money", () => {
  it("formats summaries short and parses input", () => {
    expect(formatMoneyShort(21_200_000, "USD")).toBe("$212k");
    expect(formatMoneyShort(720_000, "USD")).toBe("$7,200");
    expect(formatMoneyShort(123_456_789, "USD")).toBe("$1.2M");
    expect(parseMoney("$7,200")).toBe(720_000);
    expect(parseMoney("7200.5")).toBe(720_050);
    expect(parseMoney("seven")).toBeNull();
  });
});
