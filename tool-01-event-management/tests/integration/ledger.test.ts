import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { decideAlert, listOpenAlerts } from "@/services/alerts";
import { createChange, respondToApproval, submitChange } from "@/services/changes";
import { upsertFx } from "@/services/fx";
import { getLedger } from "@/services/ledger";
import { eventVariance } from "@/services/post-event";
import { runDaily } from "@/jobs/monitor";
import { setEmailSenderForTests } from "@/adapters/email";
import * as schema from "@/db/schema";

// Money protected (milestone 14): recorded facts only, in the right currency.
let w: World;
let eventId: string;
let otherEventId: string;
const NOW = new Date("2027-09-10T12:00:00Z"); // the review date is 10 days away

async function eventWithEuroBlock(name: string, clientId: string, supplierId: string) {
  const ops = w.ctx("OPS_DIRECTOR");
  const e = await createEvent(ops, {
    clientId,
    name,
    type: "Customer event",
    startDate: "2027-10-10",
    endDate: "2027-10-11",
    timezone: "Europe/Lisbon",
    ownerId: w.people.OPS_DIRECTOR.id,
    forecastAttendance: 100,
    baseCurrency: "USD",
    exposureThreshold: "500,000",
  });
  const k = await createContract(ops, e.id, { supplierId, title: "Rooms", currency: "EUR", contractedValue: "20,000.00" });
  // 100 rooms at €200, 80%: 50 booked → saves €3,200 by giving back 20 rooms at the review date.
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
  setEmailSenderForTests({ driver: "disabled", send: async () => ({ sent: false, reason: "disabled" }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  await upsertFx(w.ctx("ADMIN"), { fromCcy: "EUR", toCcy: "USD", rate: "1.1000", asOf: "2027-09-01" });
  const client = await createClient(ops, { name: "Ledger Co" });
  await createAgreement(ops, client.id, { name: "MSA", effectiveFrom: "2027-01-01", rules: [{ category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 }] });
  const hotel = await createSupplier(ops, { name: "Hotel Ledger", type: "HOTEL", city: "Lisbon" });
  eventId = await eventWithEuroBlock("Ledger summit", client.id, hotel.id);
  otherEventId = await eventWithEuroBlock("Undecided summit", client.id, hotel.id);
  await runDaily(w.db, NOW);
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

// The harness clock is shared by the services, so decisions and the ledger agree on "this quarter".
const ctxNow = () => w.ctx("OPS_DIRECTOR");

describe("money protected ledger", () => {
  it("counts a recorded release in the currency it was entered in, with its room nights", async () => {
    const saving = (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId })).find((a) => a.rule === "SAVING")!;
    await decideAlert(w.ctx("OPS_DIRECTOR"), saving.id, { type: "RELEASED_INVENTORY", exposureReduction: "3,200.00", roomNights: 20, note: "Gave 20 rooms back." });
    const [d] = await w.db.select().from(schema.decisions).where(eq(schema.decisions.alertId, saving.id));
    expect(d.currency).toBe("EUR"); // not the event's USD
    expect(d.detail).toMatchObject({ rule: "SAVING", roomNights: 20, reviewDate: "2027-09-20" });

    const l = await getLedger(ctxNow(), "quarter");
    expect(l.currency).toBe("USD");
    expect(l.removed.items).toHaveLength(1);
    expect(l.removed.items[0]).toMatchObject({ amountMinor: 320_000, currency: "EUR", baseMinor: 352_000, roomNights: 20 });
    expect(l.removed.totalMinor).toBe(352_000);
    expect(l.removed.roomNights).toBe(20);
  });

  it("leaves out suggestions nobody recorded, and decisions that didn't remove money", async () => {
    const other = (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId: otherEventId })).find((a) => a.rule === "SAVING")!;
    expect(other).toBeDefined(); // the system suggested it, but no one recorded anything
    const l = await getLedger(ctxNow(), "all");
    expect(l.removed.items.some((d) => d.eventId === otherEventId)).toBe(false);

    await decideAlert(w.ctx("OPS_DIRECTOR"), other.id, { type: "ACCEPTED_RISK", note: "Client expects late registrations." });
    expect((await getLedger(ctxNow(), "all")).removed.items.some((d) => d.eventId === otherEventId)).toBe(false);
  });

  it("counts client changes that were approved and applied, with their margin", async () => {
    const em = w.ctx("OPS_DIRECTOR");
    const cr = await createChange(em, eventId, {
      title: "Welcome reception",
      type: "ADD_FUNCTION",
      reason: "Client request",
      attendanceDelta: 0,
      requestedByType: "CLIENT",
      lines: [{ contractId: "", category: "Food & beverage", description: "Reception", costDelta: "5,000.00", priceDelta: "6,000.00" }],
    });
    const sent = await submitChange(em, cr.id, { recipientEmail: "client@ledger.example" });
    await respondToApproval(w.db, sent.link!.url.split("/approve/")[1], { decision: "APPROVE", approverName: "Client" }, { ip: null, userAgent: null }, NOW);
    const l = await getLedger(ctxNow(), "quarter");
    expect(l.billed.items.map((c) => c.title)).toContain("Welcome reception");
    expect(l.billed.totalMinor).toBe(600_000);
    expect(l.billed.marginMinor).toBe(100_000);
  });

  it("filters by period", async () => {
    const [d] = await w.db.select().from(schema.decisions).where(eq(schema.decisions.eventId, eventId));
    await w.db.update(schema.decisions).set({ createdAt: new Date("2025-02-01T00:00:00Z") }).where(eq(schema.decisions.id, d.id));
    expect((await getLedger(ctxNow(), "quarter")).removed.items).toHaveLength(0);
    expect((await getLedger(ctxNow(), "year")).removed.items).toHaveLength(0);
    expect((await getLedger(ctxNow(), "all")).removed.items).toHaveLength(1);
  });

  it("keeps a decided alert decided when the event is re-evaluated", async () => {
    await runDaily(w.db, new Date(NOW.getTime() + 3_600_000));
    const reopened = (await listOpenAlerts(w.ctx("OPS_DIRECTOR"), { eventId })).filter((a) => a.rule === "SAVING");
    expect(reopened).toHaveLength(0);
  });

  it("converts decision amounts on the post-event page instead of adding currencies together", async () => {
    const v = await eventVariance(w.ctx("OPS_DIRECTOR"), eventId);
    expect(v.avoidedMinor).toBe(352_000); // €3,200 at 1.10, in the event's USD
  });
});
