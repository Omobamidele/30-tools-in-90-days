import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient, rulesForEvent } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent, getEvent, listEvents, setEventStatus, updateEvent } from "@/services/events";
import {
  activateContract,
  addClause,
  amendContract,
  createContract,
  getContract,
  updateClauseTerms,
} from "@/services/contracts";
import { listObligations, recordPayment } from "@/services/obligations";
import { DomainError, isNotFound } from "@/services/errors";
import * as schema from "@/db/schema";

let w: World;
let clientId: string;
let supplierId: string;
let eventId: string;

beforeAll(async () => {
  w = await makeWorld();
});
afterAll(closeTestDb);

async function expectCode(p: Promise<unknown>, code: DomainError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof DomainError && e.code === code);
}

describe("clients and liability rules", () => {
  it("creates a client with an agreement and resolves the rules for an event date", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const client = await createClient(ops, { name: "Acme Corp", industry: "Software" });
    clientId = client.id;
    await createAgreement(ops, client.id, {
      name: "MSA 2027",
      effectiveFrom: "2027-01-01",
      effectiveTo: "",
      rules: [
        { category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
        { category: "FB_SHORTFALL", bearer: "SPLIT", agencyPct: 50 },
        { category: "CANCELLATION", bearer: "NONE", agencyPct: 0 },
      ],
    });
    const resolved = await rulesForEvent(w.db, w.org.id, client.id, "2027-11-15");
    expect(resolved?.rules).toEqual({
      ATTRITION: { bearer: "CLIENT", agencyPct: 0 },
      FB_SHORTFALL: { bearer: "SPLIT", agencyPct: 50 },
    });
    expect(await rulesForEvent(w.db, w.org.id, client.id, "2026-06-01")).toBeNull();
  });

  it("rejects an invalid split", async () => {
    await expectCode(
      createAgreement(w.ctx("OPS_DIRECTOR"), clientId, {
        name: "Bad",
        effectiveFrom: "2027-01-01",
        rules: [{ category: "ATTRITION", bearer: "SPLIT", agencyPct: 0 }],
      }),
      "VALIDATION_FAILED",
    );
  });

  it("doesn't let event managers edit clients", async () => {
    await expectCode(createClient(w.ctx("EVENT_MANAGER"), { name: "X" }), "FORBIDDEN");
  });
});

describe("suppliers", () => {
  it("detects duplicates on normalised name and city", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const s = await createSupplier(ops, { name: "Hôtel Tivoli", type: "HOTEL", city: "Lisbon" });
    supplierId = s.id;
    await expectCode(createSupplier(ops, { name: "hotel  tivoli", type: "HOTEL", city: "LISBON" }), "CONFLICT");
    const again = await createSupplier(ops, { name: "Hotel Tivoli", type: "HOTEL", city: "Lisbon", allowDuplicate: true });
    expect(again.id).not.toBe(s.id);
  });
});

describe("events and scoping", () => {
  it("lets an event manager create their own event only", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const base = {
      clientId,
      name: "SKO 2027 Lisbon",
      type: "Sales kickoff",
      startDate: "2027-11-15",
      endDate: "2027-11-17",
      destination: "Lisbon",
      timezone: "Europe/Lisbon",
      forecastAttendance: 420,
      baseCurrency: "USD",
    };
    await expectCode(createEvent(em, { ...base, ownerId: w.people.OPS_DIRECTOR.id }), "FORBIDDEN");
    const e = await createEvent(em, { ...base, ownerId: w.people.EVENT_MANAGER.id });
    eventId = e.id;
  });

  it("hides the event from other event managers but not from finance", async () => {
    expect((await listEvents(w.ctx("EVENT_MANAGER_2"))).map((e) => e.id)).not.toContain(eventId);
    await expectCode(getEvent(w.ctx("EVENT_MANAGER_2"), eventId), "NOT_FOUND");
    expect((await listEvents(w.ctx("FINANCE"))).map((e) => e.id)).toContain(eventId);
  });

  it("grants access to members", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const { event } = await getEvent(ops, eventId);
    await updateEvent(
      ops,
      eventId,
      {
        clientId,
        name: event.name,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        destination: event.destination ?? "",
        timezone: event.timezone,
        ownerId: event.ownerId,
        forecastAttendance: event.forecastAttendance,
        baseCurrency: event.baseCurrency,
        memberIds: [w.people.EVENT_MANAGER_2.id],
      },
      event.lockVersion,
    );
    expect((await listEvents(w.ctx("EVENT_MANAGER_2"))).map((e) => e.id)).toContain(eventId);
  });

  it("detects concurrent edits", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const { event } = await getEvent(ops, eventId);
    const payload = {
      clientId,
      name: "Renamed",
      type: event.type,
      startDate: event.startDate,
      endDate: event.endDate,
      timezone: event.timezone,
      ownerId: event.ownerId,
      forecastAttendance: event.forecastAttendance,
      baseCurrency: event.baseCurrency,
    };
    await expectCode(updateEvent(ops, eventId, payload, event.lockVersion - 1), "CONFLICT");
  });

  it("enforces status transitions", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    await expectCode(setEventStatus(ops, eventId, "RECONCILED"), "CONFLICT");
    await setEventStatus(ops, eventId, "CONTRACTED");
  });
});

describe("contracts, terms and obligations", () => {
  let contractId: string;

  it("adds manual terms and generates obligations on activation, in supplier local time", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const k = await createContract(em, eventId, {
      supplierId,
      title: "Group agreement",
      currency: "USD",
      contractedValue: "245,200.00",
    });
    contractId = k.id;
    await addClause(em, contractId, {
      type: "PAYMENT",
      label: "Deposit 1",
      terms: { label: "Deposit 1", dueDate: "2027-10-01", percentOfContract: 25 },
    });
    await addClause(em, contractId, {
      type: "ROOM_BLOCK",
      label: "Block A",
      terms: {
        blockName: "Block A",
        nights: [{ date: "2027-11-14", rooms: 120, rateMinor: 18_900 }],
        commitmentPct: 80,
        basis: "PER_NIGHT",
        cutoffDate: "2027-10-21",
        cutoffTime: "17:00",
      },
    });
    // Obligations only exist once the contract is active.
    expect(await listObligations(em, { eventId })).toHaveLength(0);
    await activateContract(em, contractId);
    const list = await listObligations(em, { eventId });
    expect(list.map((o) => [o.kind, o.amountMinor])).toEqual([
      ["PAYMENT", 6_130_000],
      ["CUTOFF", null],
    ]);
    // 17:00 Lisbon (WEST, UTC+1) on 2027-10-21 = 16:00 UTC
    expect(list[1].dueAt.toISOString()).toBe("2027-10-21T16:00:00.000Z");
  });

  it("keeps obligations in sync when terms change", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const { clauses } = await getContract(em, contractId);
    const block = clauses.find((c) => c.type === "ROOM_BLOCK")!;
    await updateClauseTerms(em, block.id, { terms: { ...(block.data as object), cutoffDate: "2027-10-14" } }, block.lockVersion);
    const list = await listObligations(em, { eventId });
    expect(list.find((o) => o.kind === "CUTOFF")?.dueAt.toISOString()).toBe("2027-10-14T16:00:00.000Z");
    await expectCode(updateClauseTerms(em, block.id, { terms: block.data }, block.lockVersion), "CONFLICT");
  });

  it("only creates deadlines for cancellation steps that are still ahead", async () => {
    // The test clock is 2027-09-01: the 2027-05-01 step has already taken effect.
    const em = w.ctx("EVENT_MANAGER");
    await addClause(em, contractId, {
      type: "CANCELLATION",
      label: "Cancellation schedule",
      terms: {
        basis: "CONTRACT_VALUE",
        tiers: [
          { startsOn: "2027-05-01", penaltyPct: 25 },
          { startsOn: "2027-10-16", penaltyPct: 50 },
        ],
      },
    });
    const steps = (await listObligations(em, { eventId })).filter((o) => o.kind === "TIER_CHANGE");
    expect(steps.map((o) => o.label)).toEqual(["Cancellation penalty rises to 50%"]);
  });

  it("rejects invalid terms with field-level errors", async () => {
    await expect(
      addClause(w.ctx("EVENT_MANAGER"), contractId, {
        type: "CANCELLATION",
        label: "Cancellation",
        terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-05-01" }] },
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof DomainError && Object.keys(e.fieldErrors).includes("terms.tiers.0.penaltyPct"));
  });

  it("marks a payment obligation done once fully paid; finance can record it", async () => {
    const [deposit] = (await listObligations(w.ctx("FINANCE"), { eventId })).filter((o) => o.kind === "PAYMENT");
    await expectCode(recordPayment(w.ctx("EVENT_MANAGER"), deposit.id, { paidAt: "2027-09-20", amount: "1" }), "FORBIDDEN");
    await recordPayment(w.ctx("FINANCE"), deposit.id, { paidAt: "2027-09-20", amount: "30,000.00" });
    expect((await listObligations(w.ctx("FINANCE"), { eventId })).find((o) => o.id === deposit.id)?.paidMinor).toBe(3_000_000);
    await recordPayment(w.ctx("FINANCE"), deposit.id, { paidAt: "2027-09-25", amount: "31,300.00" });
    expect((await listObligations(w.ctx("FINANCE"), { eventId })).find((o) => o.id === deposit.id)).toBeUndefined(); // done
  });

  it("supersedes the old version when an amendment is activated", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const v2 = await amendContract(em, contractId);
    await expectCode(amendContract(em, contractId), "CONFLICT");
    const { clauses } = await getContract(em, v2.id);
    expect(clauses.filter((c) => c.status === "CONFIRMED")).toHaveLength(3);
    await activateContract(em, v2.id);
    const [old] = await w.db.select().from(schema.contracts).where(eq(schema.contracts.id, contractId));
    expect(old.status).toBe("SUPERSEDED");
    const open = await listObligations(em, { eventId });
    expect(open.every((o) => o.contractId === v2.id)).toBe(true);
    // Deposit on v1 was paid in full: the v2 copy is a new open obligation until paid against v2.
    expect(open.map((o) => o.kind).sort()).toEqual(["CUTOFF", "PAYMENT", "TIER_CHANGE"]);
  });

  it("writes an audit trail", async () => {
    const rows = await w.db.select().from(schema.activityLog).where(eq(schema.activityLog.eventId, eventId));
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["created", "clause_added", "activated", "payment_recorded", "amendment_started"]));
  });
});

describe("malformed ids", () => {
  it("treats an id that isn't a UUID as not found, not a server error", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const err = await getEvent(ops, "new").catch((e) => e);
    expect(isNotFound(err)).toBe(true);
    const err2 = await getContract(ops, "not-a-uuid").catch((e) => e);
    expect(isNotFound(err2)).toBe(true);
    expect(isNotFound(new Error("boom"))).toBe(false);
  });
});
