import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createClient } from "@/services/clients";
import { createEvent } from "@/services/events";
import { findMentions, listMessages, listMyThreads, markThreadRead, postMessage } from "@/services/threads";
import { setEmailSenderForTests } from "@/adapters/email";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

let w: World;
let eventId: string;

beforeAll(async () => {
  setEmailSenderForTests({ driver: "disabled", send: async () => ({ sent: false, reason: "disabled" }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Client T" });
  const e = await createEvent(ops, {
    clientId: client.id,
    name: "Threaded summit",
    type: "Customer event",
    startDate: "2027-11-10",
    endDate: "2027-11-11",
    timezone: "America/New_York",
    ownerId: w.people.EVENT_MANAGER.id,
    forecastAttendance: 50,
    baseCurrency: "USD",
  });
  eventId = e.id;
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

describe("event threads", () => {
  it("lets the event team post and read; outsiders can't see the thread", async () => {
    await postMessage(w.ctx("EVENT_MANAGER"), eventId, { body: "Hotel confirmed the block." });
    const msgs = await listMessages(w.ctx("OPS_DIRECTOR"), eventId);
    expect(msgs.map((m) => m.body)).toEqual(["Hotel confirmed the block."]);
    await expect(listMessages(w.ctx("EVENT_MANAGER_2"), eventId)).rejects.toBeInstanceOf(DomainError);
    await expect(postMessage(w.ctx("EVENT_MANAGER_2"), eventId, { body: "hi" })).rejects.toBeInstanceOf(DomainError);
    expect((await listMyThreads(w.ctx("EVENT_MANAGER_2"))).some((t) => t.eventId === eventId)).toBe(false);
  });

  it("rejects empty messages", async () => {
    await expect(postMessage(w.ctx("EVENT_MANAGER"), eventId, { body: "   " })).rejects.toBeInstanceOf(DomainError);
  });

  it("notifies @mentioned colleagues only when they can see the event", async () => {
    const res = await postMessage(w.ctx("EVENT_MANAGER"), eventId, { body: "@OPS_DIRECTOR person and @EVENT_MANAGER_2 person: release rooms?" });
    expect(res.mentioned).toEqual(["OPS_DIRECTOR person"]);
    const opsNotes = await w.db.select().from(schema.notifications).where(and(eq(schema.notifications.userId, w.people.OPS_DIRECTOR.id), eq(schema.notifications.kind, "mention")));
    expect(opsNotes).toHaveLength(1);
    expect(opsNotes[0].link).toBe(`/events/${eventId}/discussion`);
    const em2Notes = await w.db.select().from(schema.notifications).where(eq(schema.notifications.userId, w.people.EVENT_MANAGER_2.id));
    expect(em2Notes).toHaveLength(0);
  });

  it("counts unread messages from others until the thread is read", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const before = (await listMyThreads(ops)).find((t) => t.eventId === eventId)!;
    expect(before.unread).toBe(2);
    expect(before.lastBody).toContain("release rooms");
    w.setNow("2027-09-01T13:00:00.000Z");
    await markThreadRead(ops, eventId);
    expect((await listMyThreads(ops)).find((t) => t.eventId === eventId)!.unread).toBe(0);
    // The author never sees their own messages as unread.
    expect((await listMyThreads(w.ctx("EVENT_MANAGER"))).find((t) => t.eventId === eventId)!.unread).toBe(0);
  });

  it("matches mentions by full name, case-insensitively", () => {
    const people = [
      { id: "1", name: "Priya Nair" },
      { id: "2", name: "Sam Okafor" },
    ];
    expect(findMentions("thanks @priya nair", people).map((p) => p.id)).toEqual(["1"]);
    expect(findMentions("email priya@example.com", people)).toEqual([]);
  });
});

