import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { upsertFx } from "@/services/fx";
import { getEventExposure, getEventTimeline, getPortfolio } from "@/services/exposure";
import { DomainError } from "@/services/errors";

let w: World;
let eventId: string;
let hotelId: string;

beforeAll(async () => {
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Client A" });
  await createAgreement(ops, client.id, {
    name: "MSA",
    effectiveFrom: "2027-01-01",
    rules: [
      { category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
      { category: "FB_SHORTFALL", bearer: "SPLIT", agencyPct: 50 },
    ],
  });
  const hotel = await createSupplier(ops, { name: "Hotel One", type: "HOTEL", city: "Lisbon" });
  const e = await createEvent(ops, {
    clientId: client.id,
    name: "SKO",
    type: "Sales kickoff",
    startDate: "2027-11-15",
    endDate: "2027-11-17",
    timezone: "Europe/Lisbon",
    ownerId: w.people.EVENT_MANAGER.id,
    forecastAttendance: 420,
    baseCurrency: "USD",
  });
  eventId = e.id;
  const k = await createContract(ops, eventId, { supplierId: hotel.id, title: "Group", currency: "EUR", contractedValue: "245,200.00" });
  hotelId = k.id;
  await addClause(ops, k.id, {
    type: "ROOM_BLOCK",
    label: "Block A",
    terms: {
      blockName: "Block A",
      nights: [
        { date: "2027-11-14", rooms: 120, rateMinor: 18_900 },
        { date: "2027-11-15", rooms: 220, rateMinor: 18_900 },
      ],
      commitmentPct: 80,
      basis: "PER_NIGHT",
      cutoffDate: "2027-10-21",
    },
  });
  await addClause(ops, k.id, {
    type: "FB_MINIMUM",
    label: "F&B",
    terms: { minimumMinor: 5_000_000, surchargePct: 22 },
    inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 10_000 },
  });
  await addClause(ops, k.id, {
    type: "CANCELLATION",
    label: "Cancellation",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: "2027-01-01", penaltyPct: 25 }, { startsOn: "2027-10-16", penaltyPct: 50 }] },
  });
  await activateContract(ops, k.id);
});
afterAll(closeTestDb);

describe("event exposure (service)", () => {
  it("is incomplete until pickup and FX exist, and lists why", async () => {
    const { current } = await getEventExposure(w.ctx("OPS_DIRECTOR"), eventId);
    expect(current.complete).toBe(false);
    expect(current.missing.map((m) => m.field)).toEqual(expect.arrayContaining(["pickup", "fx.EUR"]));
  });

  it("calculates with pickup, allocation and conversion once inputs exist", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    await upsertFx(w.ctx("ADMIN"), { fromCcy: "EUR", toCcy: "USD", rate: "1.1000", asOf: "2027-08-31" });
    const block = (await getContract(ops, hotelId)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
    await recordPickup(ops, block.id, { nights: [{ date: "2027-11-14", pickedUp: 71 }, { date: "2027-11-15", pickedUp: 140 }] });
    const { current } = await getEventExposure(ops, eventId);
    expect(current.complete).toBe(true);
    // attrition EUR 11,529 (client) + F&B EUR 9,760 (split) → USD at 1.10
    expect(current.current.totalMinor).toBe(1_268_190 + 1_073_600);
    expect(current.current.agencyMinor).toBe(536_800);
    // 25% of 245,200 on 2027-09-01 = 61,300 EUR → 67,430 USD, no cancellation rule → unassigned
    expect(current.cancellation.totalMinor).toBe(6_743_000);
    expect(current.cancellation.unassignedMinor).toBe(6_743_000);
  });

  it("rejects pickup for nights outside the block", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const block = (await getContract(ops, hotelId)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
    await expect(recordPickup(ops, block.id, { nights: [{ date: "2027-12-01", pickedUp: 1 }] })).rejects.toBeInstanceOf(DomainError);
  });

  it("runs scenarios without saving", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const { current, scenario } = await getEventExposure(ops, eventId, { attendanceDeltaPct: -20, cancelOn: "2027-10-20" });
    expect(scenario!.current.totalMinor).toBeGreaterThan(current.current.totalMinor);
    expect(scenario!.cancellation.totalMinor).toBe(13_486_000); // 50% tier → 122,600 EUR → USD
    const again = await getEventExposure(ops, eventId);
    expect(again.current.current.totalMinor).toBe(current.current.totalMinor);
  });

  it("builds the cancellation staircase for the timeline", async () => {
    const t = await getEventTimeline(w.ctx("OPS_DIRECTOR"), eventId);
    expect(t.steps.map((s) => [s.date, s.totalMinor])).toEqual([
      ["2027-09-01", 6_743_000],
      ["2027-10-16", 13_486_000],
    ]);
    expect(t.marks.map((m) => m.kind)).toEqual(["CUTOFF"]);
  });

  it("marks the event incomplete while a new contract is still a draft", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const venue = await createSupplier(ops, { name: "Venue One", type: "VENUE", city: "Lisbon" });
    await createContract(ops, eventId, { supplierId: venue.id, title: "Hire", currency: "EUR" });
    const { current } = await getEventExposure(ops, eventId);
    expect(current.complete).toBe(false);
    expect(current.missing.at(-1)?.label).toMatch(/isn't active yet/);
  });

  it("scopes the portfolio to what the actor can see", async () => {
    expect((await getPortfolio(w.ctx("FINANCE"))).rows.map((r) => r.eventId)).toContain(eventId);
    expect((await getPortfolio(w.ctx("EVENT_MANAGER_2"))).rows).toHaveLength(0);
  });
});
