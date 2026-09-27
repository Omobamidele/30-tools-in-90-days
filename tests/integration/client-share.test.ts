import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { getPortfolio } from "@/services/exposure";
import { getClientShareView, issueShareLink, listShareLinks, revokeShareLink } from "@/services/client-share";
import * as schema from "@/db/schema";

// Client share link (milestone 14): one client's own figures, nothing agency-side.
let w: World;
let clientA: string;
let clientB: string;
let eventA: string;
const NOW = new Date("2027-09-01T12:00:00Z");
const tokenOf = (url: string) => url.split("/share/")[1];

async function eventWithBlock(name: string, clientId: string, supplierId: string) {
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
  });
  const k = await createContract(ops, e.id, { supplierId, title: "Rooms", currency: "USD", contractedValue: "20,000.00" });
  await addClause(ops, k.id, {
    type: "ROOM_BLOCK",
    label: "Rooms",
    terms: { blockName: "Main block", nights: [{ date: "2027-10-09", rooms: 100, rateMinor: 20_000 }], commitmentPct: 80, basis: "PER_NIGHT", cutoffDate: "2027-09-25" },
  });
  await activateContract(ops, k.id);
  const block = (await getContract(ops, k.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  await recordPickup(ops, block.id, { nights: [{ date: "2027-10-09", pickedUp: 50 }] });
  return e.id;
}

beforeAll(async () => {
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const hotel = await createSupplier(ops, { name: "Hotel Share", type: "HOTEL", city: "Lisbon" });
  const a = await createClient(ops, { name: "Share Client A" });
  const b = await createClient(ops, { name: "Share Client B" });
  clientA = a.id;
  clientB = b.id;
  // The agency carries half the attrition, so there is an agency figure that must stay hidden.
  await createAgreement(ops, a.id, { name: "MSA", effectiveFrom: "2027-01-01", rules: [{ category: "ATTRITION", bearer: "SPLIT", agencyPct: 50 }] });
  await createAgreement(ops, b.id, { name: "MSA", effectiveFrom: "2027-01-01", rules: [{ category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 }] });
  eventA = await eventWithBlock("Client A summit", a.id, hotel.id);
  await eventWithBlock("Client B summit", b.id, hotel.id);
});
afterAll(closeTestDb);

describe("client share link", () => {
  it("shows only the client's own events and their share, never the agency's", async () => {
    const link = await issueShareLink(w.ctx("OPS_DIRECTOR"), clientA);
    const view = await getClientShareView(w.db, tokenOf(link.url), NOW);
    if (view.state !== "open") throw new Error(`expected open, got ${view.state}`);
    expect(view.clientName).toBe("Share Client A");
    expect(view.events.map((e) => e.name)).toEqual(["Client A summit"]);

    const row = (await getPortfolio(w.ctx("OPS_DIRECTOR"))).rows.find((r) => r.eventId === eventA)!;
    expect(row.exposure.current.agencyMinor).toBeGreaterThan(0);
    expect(view.events[0].yourShareMinor).toBe(row.exposure.current.clientMinor);
    expect(view.events[0].yourShareMinor).toBeLessThan(row.exposure.current.totalMinor);

    const json = JSON.stringify(view);
    for (const leak of ["agencyMinor", "margin", "note"]) expect(json).not.toContain(leak);
    expect(json).not.toContain("Share Client B");
  });

  it("stores only the hash, and counts views", async () => {
    const link = await issueShareLink(w.ctx("FINANCE"), clientB);
    const token = tokenOf(link.url);
    const [row] = await w.db.select().from(schema.clientShareLinks).where(eq(schema.clientShareLinks.id, link.id));
    expect(row.tokenHash).not.toContain(token);
    await getClientShareView(w.db, token, NOW);
    await getClientShareView(w.db, token, NOW);
    const [after] = await w.db.select().from(schema.clientShareLinks).where(eq(schema.clientShareLinks.id, link.id));
    expect(after.viewCount).toBe(2);
    const audits = await w.db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "share_link_viewed"));
    expect(audits.filter((a) => a.entityId === clientB)).toHaveLength(1); // once a day, not every refresh
  });

  it("closes revoked, expired and made-up links", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const revoked = await issueShareLink(ops, clientA);
    await revokeShareLink(ops, revoked.id);
    expect((await getClientShareView(w.db, tokenOf(revoked.url), NOW)).state).toBe("revoked");
    expect((await listShareLinks(ops, clientA)).some((l) => l.id === revoked.id)).toBe(false);

    const short = await issueShareLink(ops, clientA, { expiresInDays: 1 });
    expect((await getClientShareView(w.db, tokenOf(short.url), new Date(NOW.getTime() + 2 * 86_400_000))).state).toBe("expired");

    expect((await getClientShareView(w.db, "x".repeat(43), NOW)).state).toBe("invalid");
    expect((await getClientShareView(w.db, "../../etc", NOW)).state).toBe("invalid");
  });

  it("lets only directors, finance and admins create links", async () => {
    await expect(issueShareLink(w.ctx("EVENT_MANAGER"), clientA)).rejects.toThrow();
    await expect(listShareLinks(w.ctx("EVENT_MANAGER"), clientA)).rejects.toThrow();
  });
});
