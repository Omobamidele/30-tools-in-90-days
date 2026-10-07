import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDb, makeAccount, makeWorld, usageRows, type World } from "./harness";
import * as schema from "@/db/schema";
import { ingestUsage } from "@/services/ingest";
import { runDetection } from "@/services/detection";
import { acceptSignal, dismissSignal, getSignal, listSignals, reassignSignal, snoozeSignal } from "@/services/signals";
import { acceptCsql, getCsql, listCsqls, loseCsql, reassignCsql, recordOpportunity, rerouteCsql, returnCsql, winCsql } from "@/services/csqls";
import { getResults } from "@/services/results";
import { runReminders } from "@/services/reminders";
import { setEmailSenderForTests } from "@/adapters/email";
import { DomainError } from "@/services/errors";
import { addDays } from "@/core/dates";

let w: World;
const emails: string[] = [];

beforeAll(async () => {
  setEmailSenderForTests({ driver: "smtp", send: async (m) => (emails.push(`${m.to}: ${m.subject}`), { sent: true }) });
  w = await makeWorld();
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

const org = () => ({ id: w.org.id, timezone: w.org.timezone });
const seatsHigh = (crmId: string) => usageRows(crmId, w.today(), 30, (i) => ({ activeSeats: i < 10 ? 38 : 47 }));
const signalsOf = (accountId: string) => w.db.select().from(schema.signals).where(eq(schema.signals.accountId, accountId));

describe("ingest", () => {
  it("validates each row on its own and says why rows were rejected", async () => {
    const a = await makeAccount(w);
    const res = await ingestUsage(w.db, org(), [
      { account: { crmId: a.crmId }, date: w.today(), activeSeats: 10 },
      { account: { crmId: "NOPE" }, date: w.today(), activeSeats: 10 },
      { account: { crmId: a.crmId }, date: "2030-01-01", activeSeats: 10 },
      { account: { crmId: a.crmId }, date: w.today(), activeSeats: -1 },
      { account: {}, date: w.today(), activeSeats: 1 },
    ], "API", { now: w.now() });
    expect(res.accepted).toBe(1);
    expect(res.rejected.map((r) => r.index)).toEqual([1, 2, 3, 4]);
    expect(res.rejected[0].reason).toContain('no account with crmId "NOPE"');
    expect(res.rejected[1].reason).toContain("in the future");
  });

  it("upserts the same day, and keeps a contact's earliest sighting", async () => {
    const a = await makeAccount(w);
    const person = { name: "Pat Lee", title: "Chief Financial Officer", email: `pat@${a.domain}` };
    await ingestUsage(w.db, org(), [{ account: { domain: a.domain }, date: w.today(), activeSeats: 10, contacts: [{ ...person, firstSeenOn: "2026-06-20" }] }], "API", { now: w.now() });
    await ingestUsage(w.db, org(), [{ account: { domain: a.domain }, date: w.today(), activeSeats: 12, contacts: [{ ...person, firstSeenOn: "2026-06-28" }] }], "CSV", { now: w.now() });
    const snaps = await w.db.select().from(schema.usageSnapshots).where(eq(schema.usageSnapshots.accountId, a.id));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ activeSeats: 12, source: "CSV" });
    const [c] = await w.db.select().from(schema.contacts).where(eq(schema.contacts.accountId, a.id));
    expect(c).toMatchObject({ firstSeenOn: "2026-06-20", seniority: "EXEC" });
  });
});

describe("detection", () => {
  it("raises one signal with value, priority and evidence, and refreshes instead of duplicating", async () => {
    const a = await makeAccount(w);
    await ingestUsage(w.db, org(), seatsHigh(a.crmId!), "API", { now: w.now() });
    const first = await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    expect(first.created).toBe(1);
    const [s] = await signalsOf(a.id);
    expect(s).toMatchObject({ type: "SEAT_PRESSURE", status: "NEW", estValueMinor: 600_000, explanation: "47 of 50 analyst seats active (94%) for 20 days" });
    expect(s.priorityLines).toContain("+35 estimated $6,000 a year");
    const again = await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    expect(again).toMatchObject({ created: 0, refreshed: 1 });
    expect(await signalsOf(a.id)).toHaveLength(1);
  });

  it("raises nothing from stale data", async () => {
    const a = await makeAccount(w);
    // Usage stopped five days ago (limit is 3).
    const old = usageRows(a.crmId!, addDays(w.today(), -5), 25, (i) => ({ activeSeats: i < 5 ? 38 : 47 }));
    await ingestUsage(w.db, org(), old, "API", { now: w.now() });
    const res = await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    expect(res).toMatchObject({ stale: 1, created: 0 });
  });

  it("respects a dismissal's cooldown, unless the value grows materially", async () => {
    const a = await makeAccount(w);
    await ingestUsage(w.db, org(), seatsHigh(a.crmId!), "API", { now: w.now() });
    await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    const [s] = await signalsOf(a.id);
    await dismissSignal(w.ctx("CSM"), s.id, s.lockVersion, { reason: "Seats are contractors or a fixed team" });
    await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    expect((await signalsOf(a.id)).filter((x) => x.status === "NEW")).toHaveLength(0);
    // 75 active seats: 75 × 1.1 = 83 − 50 = 33 seats × $1,200 = $39,600, far above $6,000 × 1.25.
    await ingestUsage(w.db, org(), [{ account: { crmId: a.crmId }, date: w.today(), activeSeats: 75 }], "API", { now: w.now() });
    const res = await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    expect(res.created).toBe(1);
  });

  it("expires a signal whose condition has not held for 7 days, and wakes snoozes", async () => {
    const a = await makeAccount(w);
    const b = await makeAccount(w);
    await ingestUsage(w.db, org(), [...seatsHigh(a.crmId!), ...seatsHigh(b.crmId!)], "API", { now: w.now() });
    await runDetection(w.ctx("ADMIN"), { accountIds: [a.id, b.id] });
    const [sb] = await signalsOf(b.id);
    await snoozeSignal(w.ctx("CSM"), sb.id, sb.lockVersion, { until: "2026-07-05" });
    const start = w.now();
    // Seats fall back to 30 for the next 8 days on account a; b keeps reporting high.
    w.advanceDays(8);
    const later = usageRows(a.crmId!, w.today(), 8, () => ({ activeSeats: 30 }));
    const laterB = usageRows(b.crmId!, w.today(), 8, () => ({ activeSeats: 47 }));
    await ingestUsage(w.db, org(), [...later, ...laterB], "API", { now: w.now() });
    const res = await runDetection(w.ctx("ADMIN"), { accountIds: [a.id, b.id] });
    expect(res).toMatchObject({ expired: 1, woke: 1 });
    expect((await signalsOf(a.id))[0].status).toBe("EXPIRED");
    expect((await signalsOf(b.id))[0].status).toBe("NEW");
    w.setNow(start.toISOString());
  });
});

describe("triage, routing and the seller's work", () => {
  let accountId: string;
  beforeEach(async () => {
    const a = await makeAccount(w);
    accountId = a.id;
    await ingestUsage(w.db, org(), seatsHigh(a.crmId!), "API", { now: w.now() });
    await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
  });

  it("routes to the account owner with a deadline, notifies the seller, and runs the whole loop to won", async () => {
    const [s] = await signalsOf(accountId);
    const { csqlId } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Controller asked about seats on Tuesday." });
    let c = (await getCsql(w.ctx("SELLER"), csqlId)).csql;
    expect(c).toMatchObject({ status: "ROUTED", ownerId: w.people.SELLER.id, routedReason: "Account owner (SELLER person)", estValueMinor: 600_000 });
    // Wednesday 10:00 + 1 business day = Thursday 10:00.
    expect(c.dueAt?.toISOString()).toBe("2026-07-02T14:00:00.000Z");
    expect(emails.some((e) => e.includes("seller@") && e.includes("New CSQL for you"))).toBe(true);

    c = await acceptCsql(w.ctx("SELLER"), csqlId, c.lockVersion);
    c = await recordOpportunity(w.ctx("SELLER"), csqlId, c.lockVersion, { amount: "9,600", kind: "SEATS", crmRef: "OPP-1" });
    c = await winCsql(w.ctx("SELLER"), csqlId, c.lockVersion, { amount: "9,600" });
    expect(c).toMatchObject({ status: "WON", outcomeAmountMinor: 960_000 });
    const r = await getResults(w.ctx("EXEC"), "all");
    expect(r.funnel.wonMinor).toBeGreaterThanOrEqual(960_000);
    expect(r.byType.find((t) => t.type === "SEAT_PRESSURE")!.won).toBeGreaterThanOrEqual(1);
  });

  it("refuses moves the state machine doesn't allow, stale versions, and other people's work", async () => {
    const [s] = await signalsOf(accountId);
    await expect(acceptSignal(w.ctx("CSM_2"), s.id, s.lockVersion, { handoffNote: "Not my account, though." })).rejects.toThrow(/Only the account's CSM/);
    await expect(acceptSignal(w.ctx("SELLER"), s.id, s.lockVersion, { handoffNote: "Sellers don't triage." })).rejects.toBeInstanceOf(DomainError);
    const { csqlId } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Valid handoff note here." });
    await expect(acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Second click from another tab." })).rejects.toThrow(/Already accepted by CSM person/);
    const c = (await getCsql(w.ctx("SELLER"), csqlId)).csql;
    await expect(winCsql(w.ctx("SELLER"), csqlId, c.lockVersion, { amount: "100" })).rejects.toThrow(/can't do that while it's routed/);
    await expect(acceptCsql(w.ctx("SELLER_2"), csqlId, c.lockVersion)).rejects.toThrow(/isn't yours/);
    await expect(acceptCsql(w.ctx("SELLER"), csqlId, c.lockVersion - 1)).rejects.toThrow(/changed since you opened it/);
  });

  it("goes back to the CSM with a reason, then re-routes; leaders can reassign", async () => {
    const [s] = await signalsOf(accountId);
    const { csqlId } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Short note for the seller." });
    let c = (await getCsql(w.ctx("SELLER"), csqlId)).csql;
    c = await returnCsql(w.ctx("SELLER"), csqlId, c.lockVersion, { reason: "Not enough context in the handoff", note: "Who is the buyer?" });
    expect(c).toMatchObject({ status: "RETURNED", returnReason: "Not enough context in the handoff: Who is the buyer?" });
    c = await rerouteCsql(w.ctx("CSM"), csqlId, c.lockVersion, { sellerId: w.people.SELLER_2.id, note: "Buyer is the controller, Pat." });
    expect(c).toMatchObject({ status: "ROUTED", ownerId: w.people.SELLER_2.id });
    expect(c.handoffNote).toContain("Update from CSM person: Buyer is the controller, Pat.");
    await expect(reassignCsql(w.ctx("SELLER"), csqlId, c.lockVersion, { sellerId: w.people.SELLER.id, reason: "Mine now" })).rejects.toThrow(/sales leader/);
    c = await reassignCsql(w.ctx("SALES_LEAD"), csqlId, c.lockVersion, { sellerId: w.people.SELLER.id, reason: "Territory" });
    expect(c.ownerId).toBe(w.people.SELLER.id);
    c = await acceptCsql(w.ctx("SELLER"), csqlId, c.lockVersion);
    c = await recordOpportunity(w.ctx("SELLER"), csqlId, c.lockVersion, { amount: "6000", kind: "SEATS" });
    c = await loseCsql(w.ctx("SELLER"), csqlId, c.lockVersion, { reason: "No budget" });
    expect(c.status).toBe("LOST");
  });

  it("routes accounts without an owner through the segment queue in turn", async () => {
    const [q] = await w.db
      .insert(schema.sellerQueues)
      .values({ orgId: w.org.id, segment: "upper", name: "Upper", memberIds: [w.people.SELLER.id, w.people.SELLER_2.id] })
      .returning();
    const owners: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await makeAccount(w, { ownerId: null, segment: "upper" });
      await ingestUsage(w.db, org(), seatsHigh(a.crmId!), "API", { now: w.now() });
      await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
      const [s] = await signalsOf(a.id);
      const { csqlId } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Round robin check note." });
      owners.push((await getCsql(w.ctx("ADMIN"), csqlId)).csql.ownerId!);
    }
    expect(owners).toEqual([w.people.SELLER.id, w.people.SELLER_2.id, w.people.SELLER.id]);
    await w.db.delete(schema.sellerQueues).where(eq(schema.sellerQueues.id, q.id));
  });

  it("adds a second signal to the open CSQL instead of opening another", async () => {
    const [s] = await signalsOf(accountId);
    const { csqlId } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "First handoff note." });
    const [extra] = await w.db
      .insert(schema.signals)
      .values({ ...s, id: undefined, type: "USAGE_PACE", status: "NEW", csqlId: null, triagedAt: null, triagedBy: null, lockVersion: 1, valueKind: "USAGE", estValueMinor: 700_000 })
      .returning();
    const res = await acceptSignal(w.ctx("CSM"), extra.id, extra.lockVersion, { handoffNote: "Usage is up as well." });
    expect(res.csqlId).toBe(csqlId);
    await expect(acceptSignal(w.ctx("CSM"), s.id, 99, { handoffNote: "x".repeat(12) })).rejects.toBeInstanceOf(DomainError);
  });

  it("lets only CS leaders reassign signals, and scopes CSMs to their book", async () => {
    const [s] = await signalsOf(accountId);
    await expect(reassignSignal(w.ctx("CSM"), s.id, s.lockVersion, { assigneeId: w.people.CSM_2.id, reason: "Holiday" })).rejects.toThrow(/CS leader/);
    await reassignSignal(w.ctx("CS_LEAD"), s.id, s.lockVersion, { assigneeId: w.people.CSM_2.id, reason: "Holiday cover" });
    const mine = await listSignals(w.ctx("CSM_2"), { who: "mine" });
    expect(mine.some((r) => r.signal.id === s.id)).toBe(true);
    const detail = await getSignal(w.ctx("CSM_2"), s.id);
    expect(detail.canTriage).toBe(true);
    await expect(getSignal(w.ctx("SELLER_2"), s.id)).rejects.toThrow(/not found/);
    expect((await listCsqls(w.ctx("SELLER_2"))).every((r) => r.csql.ownerId === w.people.SELLER_2.id)).toBe(true);
  });
});

describe("deadline reminders", () => {
  it("reminds once per stage and escalates to the leader", async () => {
    const a = await makeAccount(w);
    await ingestUsage(w.db, org(), seatsHigh(a.crmId!), "API", { now: w.now() });
    await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
    const start = w.now();
    w.advanceDays(6); // Tuesday next week: 2 business days past the Friday deadline.
    const first = await runReminders(w.ctx("ADMIN"));
    const second = await runReminders(w.ctx("ADMIN"));
    expect(first.escalated).toBeGreaterThanOrEqual(1);
    expect(second.escalated).toBe(first.escalated);
    const notes = await w.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, w.people.CS_LEAD.id), eq(schema.notifications.kind, "escalation")));
    const forThis = notes.filter((n) => n.title.includes(a.name));
    expect(forThis).toHaveLength(1);
    w.setNow(start.toISOString());
  });
});
