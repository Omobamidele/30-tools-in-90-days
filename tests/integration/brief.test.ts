import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { listOpenAlerts } from "@/services/alerts";
import { buildBrief } from "@/services/brief";
import { updatePreferences } from "@/services/preferences";
import { isoWeek, runDaily, runWeekly } from "@/jobs/monitor";
import { setEmailSenderForTests, type EmailMessage } from "@/adapters/email";
import * as schema from "@/db/schema";

// Savings finder alert (R11) and the Monday money brief (R12), milestone 13.
let w: World;
let summitId: string;
const sent: EmailMessage[] = [];
const NOW = new Date("2027-09-10T12:00:00Z"); // a Friday; the review date is 10 days away

async function eventWithBlock(world: World, ownerKey: "EVENT_MANAGER" | "EVENT_MANAGER_2", name: string, clientId: string, supplierId: string) {
  const ops = world.ctx("OPS_DIRECTOR");
  const e = await createEvent(ops, {
    clientId,
    name,
    type: "Customer event",
    startDate: "2027-10-10",
    endDate: "2027-10-11",
    timezone: "America/Chicago",
    ownerId: world.people[ownerKey].id,
    forecastAttendance: 100,
    baseCurrency: "USD",
    exposureThreshold: "100,000",
  });
  const k = await createContract(ops, e.id, { supplierId, title: "Rooms", currency: "USD", contractedValue: "20,000.00" });
  // 100 rooms at $200, 80% commitment; 50 booked → 30 short → $6,000.
  // Review on Sep 20 allows 20% back: 80 rooms → commits 64 → 14 short → $2,800. Saves $3,200.
  await addClause(ops, k.id, {
    type: "ROOM_BLOCK",
    label: "Rooms",
    terms: {
      blockName: "Main block",
      nights: [{ date: "2027-10-09", rooms: 100, rateMinor: 20_000 }],
      commitmentPct: 80,
      basis: "PER_NIGHT",
      cutoffDate: "2027-09-25",
      reviewPoints: [{ date: "2027-09-20", maxReductionPct: 20 }],
    },
  });
  await activateContract(ops, k.id);
  const block = (await getContract(ops, k.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  await recordPickup(ops, block.id, { nights: [{ date: "2027-10-09", pickedUp: 50 }] });
  return e.id;
}

beforeAll(async () => {
  setEmailSenderForTests({ driver: "smtp", send: async (m) => (sent.push(m), { sent: true }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Client B" });
  await createAgreement(ops, client.id, { name: "MSA", effectiveFrom: "2027-01-01", rules: [{ category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 }] });
  const hotel = await createSupplier(ops, { name: "Hotel Savings", type: "HOTEL", city: "Chicago" });
  summitId = await eventWithBlock(w, "EVENT_MANAGER", "Brief summit", client.id, hotel.id);
  await eventWithBlock(w, "EVENT_MANAGER_2", "Other manager's offsite", client.id, hotel.id);
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

const briefsFor = (userIds: string[]) =>
  w.db
    .select()
    .from(schema.notifications)
    .where(and(inArray(schema.notifications.userId, userIds), eq(schema.notifications.kind, "brief")));

describe("savings finder alert", () => {
  it("opens a watch alert within 14 days of a review date, with the rooms and the saving", async () => {
    await runDaily(w.db, NOW);
    const saving = (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId: summitId })).find((a) => a.rule === "SAVING");
    expect(saving?.severity).toBe("WATCH");
    expect(saving?.title).toBe("Give back 20 room nights at Hotel Savings by Sep 20, 2027 to save up to $3,200");
  });

  it("is not raised more than 14 days ahead", async () => {
    const other = await makeWorld();
    const ops = other.ctx("OPS_DIRECTOR");
    const client = await createClient(ops, { name: "Client Early" });
    const hotel = await createSupplier(ops, { name: "Hotel Early", type: "HOTEL", city: "Chicago" });
    const id = await eventWithBlock(other, "EVENT_MANAGER", "Early", client.id, hotel.id);
    await runDaily(other.db, new Date("2027-08-20T12:00:00Z")); // 31 days before the review
    expect((await listOpenAlerts(ops, { eventId: id })).some((a) => a.rule === "SAVING")).toBe(false);
  });
});

describe("Monday money brief", () => {
  it("summarises in plain words, scoped to what each person can see", async () => {
    const director = await buildBrief({ ...w.ctx("OPS_DIRECTOR"), now: () => NOW });
    expect(director.send).toBe(true);
    expect(director.body).toContain("If nothing changes, your 2 open events will owe suppliers about $12k in penalties.");
    expect(director.body).toContain("Save money: give back 20 room nights at Hotel Savings by Sep 20, 2027 to save up to $3,200 (Brief summit).");
    expect(director.subject).toMatch(/^Monday brief: \$12k at stake/);

    const manager = await buildBrief({ ...w.ctx("EVENT_MANAGER_2"), now: () => NOW });
    expect(manager.body).toContain("your 1 open event will owe suppliers about $6,000");
    expect(manager.body).toContain("Other manager's offsite");
    expect(manager.body).not.toContain("Brief summit");
  });

  it("emails everyone once a week, skips people who opted out, and never sends twice", async () => {
    await updatePreferences(w.ctx("FINANCE"), { weeklyBrief: false });
    const ids = Object.values(w.people).map((p) => p.id);
    sent.length = 0;

    await runWeekly(w.db, NOW, { orgId: w.org.id });
    const first = await briefsFor(ids);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((n) => n.dedupeKey === `brief:${isoWeek(NOW)}`)).toBe(true);
    expect(first.some((n) => n.userId === w.people.FINANCE.id)).toBe(false);
    expect(first.every((n) => n.emailedAt !== null)).toBe(true);
    expect(sent.some((m) => m.subject.startsWith("Monday brief:"))).toBe(true);

    await runWeekly(w.db, new Date(NOW.getTime() + 3_600_000), { orgId: w.org.id }); // same week
    expect((await briefsFor(ids)).length).toBe(first.length);

    await runWeekly(w.db, new Date(NOW.getTime() + 7 * 86_400_000), { orgId: w.org.id }); // next week
    expect((await briefsFor(ids)).length).toBe(first.length * 2);
  });

  it("uses ISO weeks", () => {
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
    expect(isoWeek(new Date("2027-09-10T12:00:00Z"))).toBe("2027-W36");
  });
});
