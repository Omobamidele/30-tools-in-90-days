import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent, getEvent } from "@/services/events";
import { activateContract, addClause, createContract, getContract } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import {
  approveInternally,
  createChange,
  getApproval,
  getChange,
  previewChangeImpact,
  respondToApproval,
  reissueLink,
  sendBack,
  submitChange,
  updateChange,
  withdrawChange,
} from "@/services/changes";
import { runHourly } from "@/jobs/monitor";
import { setEmailSenderForTests, type EmailMessage } from "@/adapters/email";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

let w: World;
let eventId: string;
let venueId: string;
const mail: EmailMessage[] = [];
const tokenFrom = (url: string) => url.split("/approve/")[1];

beforeAll(async () => {
  setEmailSenderForTests({ driver: "smtp", send: async (m) => (mail.push(m), { sent: true }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Client C" });
  await createAgreement(ops, client.id, {
    name: "MSA",
    effectiveFrom: "2027-01-01",
    rules: [
      { category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
      { category: "FB_SHORTFALL", bearer: "SPLIT", agencyPct: 50 },
    ],
  });
  const hotel = await createSupplier(ops, { name: "Hotel C", type: "HOTEL", city: "Lisbon" });
  const venue = await createSupplier(ops, { name: "Venue C", type: "VENUE", city: "Lisbon" });
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
  const h = await createContract(ops, eventId, { supplierId: hotel.id, title: "Group", currency: "USD", contractedValue: "200,000.00" });
  await addClause(ops, h.id, {
    type: "ROOM_BLOCK",
    label: "Block",
    terms: { blockName: "Block", nights: [{ date: "2027-11-15", rooms: 200, rateMinor: 20_000 }], commitmentPct: 80, basis: "PER_NIGHT", cutoffDate: "2027-09-20" },
  });
  await addClause(ops, h.id, { type: "FB_MINIMUM", label: "F&B", terms: { minimumMinor: 4_200_000 }, inputs: { perHeadMinor: 10_000 } });
  await activateContract(ops, h.id);
  const block = (await getContract(ops, h.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  await recordPickup(ops, block.id, { nights: [{ date: "2027-11-15", pickedUp: 180 }] });
  const v = await createContract(ops, eventId, { supplierId: venue.id, title: "Hire", currency: "USD", contractedValue: "80,000.00" });
  venueId = v.id;
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

const draft = (over: Record<string, unknown> = {}) => ({
  title: "Headcount reduction",
  type: "HEADCOUNT",
  reason: "Client budget cut",
  attendanceDelta: -60,
  lines: [{ contractId: venueId, category: "Food & beverage", description: "Lunch covers −60 × 3 days", costDelta: "-10,800.00", priceDelta: "" }],
  ...over,
});

describe("change impact", () => {
  it("prices lines from markup rules and shows exposure moving to the right bearer", async () => {
    const impact = await previewChangeImpact(w.ctx("EVENT_MANAGER"), eventId, draft());
    expect(impact.lines[0]).toMatchObject({ costDeltaMinor: -1_080_000, priceDeltaMinor: -1_242_000, suggested: true });
    expect(impact.totals.marginPct).toBe(13.04);
    expect(impact.approvalReason).toMatch(/margin below the 14% floor/);
    // 420 → 360 attendees: F&B forecast 3,600,000 vs minimum 4,200,000 → 600,000 shortfall, split 50/50;
    // pickup scaled 180 → 154 of 160 committed → 6 × 200.00 = 1,200.00 attrition (client).
    expect(impact.exposure.currentBefore).toBe(0);
    expect(impact.exposure.currentAfter).toBe(600_000 + 120_000);
    expect(impact.exposure.agencyDelta).toBe(300_000);
    expect(impact.exposure.clientDelta).toBe(420_000);
    expect(impact.warnings.some((x) => /Room block cutoff/.test(x))).toBe(true);
  });
});

describe("change lifecycle", () => {
  let crId: string;

  it("numbers change requests and blocks editing after submission", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const cr = await createChange(em, eventId, draft());
    const cr2 = await createChange(em, eventId, draft({ title: "Other", attendanceDelta: 0 }));
    expect(cr2.number).toBe(cr.number + 1);
    crId = cr.id;
    await expect(submitChange(em, cr.id, { recipientEmail: "not-an-email" })).rejects.toBeInstanceOf(DomainError);
    const res = await submitChange(em, cr.id, { recipientEmail: "approver@client.example" });
    expect(res.status).toBe("INTERNAL_REVIEW"); // margin below floor
    const { cr: stored } = await getChange(em, cr.id);
    await expect(updateChange(em, cr.id, draft(), stored.lockVersion)).rejects.toBeInstanceOf(DomainError);
  });

  it("requires a different approver, and a note to send back", async () => {
    await expect(approveInternally(w.ctx("EVENT_MANAGER"), crId, "")).rejects.toBeInstanceOf(DomainError);
    await expect(sendBack(w.ctx("MD"), crId, "")).rejects.toBeInstanceOf(DomainError);
    const notes = await w.db.select().from(schema.notifications).where(eq(schema.notifications.kind, "approval"));
    expect(notes.length).toBeGreaterThan(0);
  });

  it("sends the approved change to the client with a single-use link", async () => {
    const { link } = await approveInternally(w.ctx("MD"), crId, "Accepting lower margin to keep the account");
    expect(link!.emailed).toBe(true);
    expect(mail.some((m) => m.to === "approver@client.example" && /CR-/.test(m.subject))).toBe(true);
    const token = tokenFrom(link!.url);
    const view = await getApproval(w.db, token, w.db ? new Date("2027-09-02T10:00:00Z") : new Date());
    expect(view.state).toBe("open");
    if (view.state !== "open") return;
    expect(view.view.priceDeltaMinor).toBe(-1_242_000);
    expect(view.view.clientExposureDeltaMinor).toBe(420_000);
    (globalThis as { __token?: string }).__token = token;
  });

  it("applies an approval: forecast, tasks, snapshot; the link can't be reused", async () => {
    const token = (globalThis as { __token?: string }).__token!;
    await expect(respondToApproval(w.db, token, { decision: "APPROVE", approverName: "" }, { ip: null, userAgent: null }, new Date("2027-09-02T10:00:00Z"))).rejects.toBeInstanceOf(DomainError);
    const res = await respondToApproval(w.db, token, { decision: "APPROVE", approverName: "Dana Whitfield", comment: "OK" }, { ip: "203.0.113.5", userAgent: "test" }, new Date("2027-09-02T10:00:00Z"));
    expect(res.status).toBe("APPLIED");
    const { event } = await getEvent(w.ctx("OPS_DIRECTOR"), eventId);
    expect(event.forecastAttendance).toBe(360);
    const { cr, tasks, links } = await getChange(w.ctx("OPS_DIRECTOR"), crId);
    expect(cr.status).toBe("APPLIED");
    expect(tasks[0].title).toMatch(/Venue C/);
    expect(links[0]).toMatchObject({ outcome: "APPROVE", approverName: "Dana Whitfield", ip: "203.0.113.5" });
    await expect(respondToApproval(w.db, token, { decision: "REJECT", approverName: "Someone" }, { ip: null, userAgent: null }, new Date("2027-09-02T10:01:00Z"))).rejects.toBeInstanceOf(DomainError);
    expect((await getApproval(w.db, token, new Date("2027-09-02T10:01:00Z"))).state).toBe("used");
    const snaps = await w.db.select().from(schema.exposureSnapshots).where(eq(schema.exposureSnapshots.eventId, eventId));
    expect(snaps.some((s) => s.trigger.includes("applied"))).toBe(true);
  });

  it("expires unanswered links hourly, and a new link can be issued", async () => {
    const em = w.ctx("EVENT_MANAGER");
    const cr = await createChange(em, eventId, draft({ title: "AV upgrade", attendanceDelta: 0, lines: [{ contractId: venueId, category: "AV & production", description: "Second screen", costDelta: "1,000.00", priceDelta: "" }] }));
    const sent = await submitChange(em, cr.id, { recipientEmail: "approver@client.example" });
    expect(sent.status).toBe("SENT_TO_CLIENT"); // 20% markup clears the floor
    const oldToken = tokenFrom(sent.link!.url);
    await runHourly(w.db, new Date("2027-12-31T00:00:00Z"));
    expect((await getChange(em, cr.id)).cr.status).toBe("EXPIRED");
    expect((await getApproval(w.db, oldToken, new Date("2027-12-31T00:00:00Z"))).state).toBe("expired");
    const { link } = await reissueLink(em, cr.id, { recipientEmail: "approver@client.example" });
    expect((await getChange(em, cr.id)).cr.status).toBe("SENT_TO_CLIENT");
    expect((await getApproval(w.db, tokenFrom(link!.url), new Date("2027-09-02T00:00:00Z"))).state).toBe("open");
    await withdrawChange(em, cr.id);
    expect((await getApproval(w.db, tokenFrom(link!.url), new Date("2027-09-02T00:00:00Z"))).state).toBe("expired");
  });

  it("treats malformed or unknown tokens as invalid", async () => {
    expect((await getApproval(w.db, "abc", new Date())).state).toBe("invalid");
    expect((await getApproval(w.db, "x".repeat(43), new Date())).state).toBe("invalid");
  });
});
