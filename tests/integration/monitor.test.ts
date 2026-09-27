import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { listObligations, recordPayment } from "@/services/obligations";
import { decideAlert, listOpenAlerts } from "@/services/alerts";
import { calendarFeed, issueCalendarToken } from "@/services/calendar";
import { runDaily, runHourly } from "@/jobs/monitor";
import { setEmailSenderForTests, type EmailMessage } from "@/adapters/email";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

let w: World;
let eventId: string;
let contractId: string;
const sent: EmailMessage[] = [];

beforeAll(async () => {
  setEmailSenderForTests({ driver: "smtp", send: async (m) => (sent.push(m), { sent: true }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Client M" });
  await createAgreement(ops, client.id, {
    name: "MSA",
    effectiveFrom: "2027-01-01",
    rules: [{ category: "ATTRITION", bearer: "AGENCY", agencyPct: 100 }],
  });
  const hotel = await createSupplier(ops, { name: "Hotel M", type: "HOTEL", city: "Chicago" });
  const e = await createEvent(ops, {
    clientId: client.id,
    name: "Board",
    type: "Customer event",
    startDate: "2027-10-10",
    endDate: "2027-10-11",
    timezone: "America/Chicago",
    ownerId: w.people.EVENT_MANAGER.id,
    forecastAttendance: 40,
    baseCurrency: "USD",
    exposureThreshold: "5,000",
  });
  eventId = e.id;
  const k = await createContract(ops, eventId, { supplierId: hotel.id, title: "Rooms", currency: "USD", contractedValue: "50,000.00" });
  contractId = k.id;
  await addClause(ops, k.id, { type: "PAYMENT", label: "Deposit", terms: { label: "Deposit", dueDate: "2027-09-05", amountMinor: 1_000_000 } });
  await addClause(ops, k.id, {
    type: "ROOM_BLOCK",
    label: "Rooms",
    terms: {
      blockName: "Rooms",
      nights: [{ date: "2027-10-09", rooms: 40, rateMinor: 30_000 }],
      commitmentPct: 90,
      basis: "PER_NIGHT",
      cutoffDate: "2027-09-15",
    },
  });
  await addClause(ops, k.id, {
    type: "CANCELLATION",
    label: "Cancellation",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-08-01", penaltyPct: 25 }, { startsOn: "2027-09-10", penaltyPct: 75 }] },
  });
  await activateContract(ops, k.id);
  const block = (await getContract(ops, k.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  await recordPickup(ops, block.id, { nights: [{ date: "2027-10-09", pickedUp: 10 }] });
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

const openRules = async () => (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId })).map((a) => a.rule).sort();

describe("daily monitoring", () => {
  it("opens threshold, cutoff and tier-step alerts and notifies once, with email", async () => {
    // 2027-09-01: cutoff in 14 days, tier step in 9 days, attrition 26 × 300 = 7,800 > 5,000 threshold
    const now = new Date("2027-09-01T11:00:00Z");
    const first = await runDaily(w.db, now);
    expect(first.snapshots).toBeGreaterThan(0);
    expect(await openRules()).toEqual(["CUTOFF", "THRESHOLD", "TIER_STEP"]);
    const again = await runDaily(w.db, now);
    expect(again.reminders).toBe(0);
    const notes = await w.db.select().from(schema.notifications).where(eq(schema.notifications.userId, w.people.EVENT_MANAGER.id));
    expect(new Set(notes.map((n) => n.dedupeKey)).size).toBe(notes.length);
    expect(notes.every((n) => n.emailedAt !== null)).toBe(true);
    expect(sent.some((m) => m.subject.includes("above your $5,000 limit"))).toBe(true);
  });

  it("sends one reminder per obligation at the nearest offset", async () => {
    const reminders = await w.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, w.people.EVENT_MANAGER.id), eq(schema.notifications.kind, "reminder")));
    // Deposit due in 4 days → offset 7; cutoff in 14 → offset 14; tier step not reminded.
    expect(reminders.map((r) => r.dedupeKey.split(":")[2]).sort()).toEqual(["14", "7"]);
  });

  it("closes the threshold and cutoff alerts when pickup recovers", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const block = (await getContract(ops, contractId)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
    await recordPickup(ops, block.id, { nights: [{ date: "2027-10-09", pickedUp: 36 }] });
    await runDaily(w.db, new Date("2027-09-02T11:00:00Z"));
    expect(await openRules()).toEqual(["TIER_STEP"]);
  });

  it("marks passed tier steps done and resolves their alerts", async () => {
    await runDaily(w.db, new Date("2027-09-11T11:00:00Z"));
    expect(await openRules()).not.toContain("TIER_STEP");
    const steps = (await listObligations(w.ctx("OPS_DIRECTOR"), { eventId, includeDone: true })).filter((o) => o.kind === "TIER_CHANGE");
    expect(steps.every((s) => s.status === "DONE")).toBe(true);
  });
});

describe("hourly monitoring and decisions", () => {
  it("escalates overdue deadlines and closes them once paid", async () => {
    await runHourly(w.db, new Date("2027-09-07T12:00:00Z")); // deposit due 2027-09-05 17:00 CDT
    const [overdue] = (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId })).filter((a) => a.rule === "OVERDUE");
    expect(overdue.severity).toBe("HIGH");
    const [dep] = (await listObligations(w.ctx("FINANCE"), { eventId })).filter((o) => o.kind === "PAYMENT");
    await recordPayment(w.ctx("FINANCE"), dep.id, { paidAt: "2027-09-07", amount: "10,000.00" });
    await runHourly(w.db, new Date("2027-09-07T13:00:00Z"));
    expect(await openRules()).not.toContain("OVERDUE");
  });

  it("closes an alert with a recorded decision; accepted risk needs a note", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const block = (await getContract(ops, contractId)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
    await recordPickup(ops, block.id, { nights: [{ date: "2027-10-09", pickedUp: 5 }] });
    await runDaily(w.db, new Date("2027-09-12T11:00:00Z"));
    const [threshold] = (await listOpenAlerts(ops, { eventId })).filter((a) => a.rule === "THRESHOLD");
    await expect(decideAlert(ops, threshold.id, { type: "ACCEPTED_RISK" })).rejects.toBeInstanceOf(DomainError);
    await expect(decideAlert(w.ctx("EVENT_MANAGER_2"), threshold.id, { type: "OTHER", note: "x" })).rejects.toBeInstanceOf(DomainError);
    await decideAlert(ops, threshold.id, { type: "RELEASED_INVENTORY", note: "Released 10 rooms", exposureReduction: "3,000.00" });
    expect(await openRules()).not.toContain("THRESHOLD");
    const [d] = await w.db.select().from(schema.decisions).where(eq(schema.decisions.eventId, eventId));
    expect(d).toMatchObject({ type: "RELEASED_INVENTORY", exposureDeltaMinor: -300_000, currency: "USD" });
  });
});

describe("calendar feed", () => {
  it("serves the owner's open deadlines behind a secret link that can be rotated", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const token = await issueCalendarToken(em);
    const ics = await calendarFeed(w.db, token, "http://localhost:3001");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("Board");
    const rotated = await issueCalendarToken(em);
    expect(await calendarFeed(w.db, token, "x")).toBeNull();
    expect(await calendarFeed(w.db, rotated, "x")).toContain("BEGIN:VCALENDAR");
  });
});

describe("markers and closed events", () => {
  it("closes a passed cutoff instead of calling it overdue", async () => {
    await runDaily(w.db, new Date("2027-09-16T11:00:00Z")); // cutoff was 2027-09-15
    const all = await listObligations(w.ctx("OPS_DIRECTOR"), { eventId, includeDone: true });
    expect(all.find((o) => o.kind === "CUTOFF")?.status).toBe("DONE");
    await runHourly(w.db, new Date("2027-09-18T11:00:00Z"));
    expect(await openRules()).not.toContain("OVERDUE");
  });

  it("waives remaining non-payment deadlines when the event is delivered", async () => {
    const { setEventStatus } = await import("@/services/events");
    const ops = w.ctx("OPS_DIRECTOR");
    await setEventStatus(ops, eventId, "CONTRACTED");
    await setEventStatus(ops, eventId, "LIVE");
    await setEventStatus(ops, eventId, "DELIVERED");
    const open = await listObligations(ops, { eventId });
    expect(open.every((o) => o.kind === "PAYMENT")).toBe(true);
    expect((await openRules()).filter((r) => r !== "OVERDUE")).toEqual([]);
  });
});
