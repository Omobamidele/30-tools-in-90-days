import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { messages, organizations, threadReads, threads, users } from "@/db/schema";
import { can } from "@/auth/policy";
import { orgConfigSchema } from "@/config/schema";
import { audit, type DbLike, type ServiceCtx } from "./context";
import { parseInput } from "./errors";
import { authorizeEvent, listEvents } from "./events";
import { notify } from "./notifications";

// Event team threads: one discussion per event. Whoever can see the event can read and post;
// @mentions notify the mentioned colleague (only if they can see the event too).

export const messageInput = z.object({
  body: z.string().trim().min(1, "Write a message").max(4000, "Keep messages under 4,000 characters"),
  entityType: z.enum(["contract", "obligation", "change"]).optional(),
  entityId: z.uuid().optional(),
});

async function ensureThread(db: DbLike, orgId: string, eventId: string) {
  await db.insert(threads).values({ orgId, eventId }).onConflictDoNothing({ target: threads.eventId });
  const [t] = await db.select().from(threads).where(eq(threads.eventId, eventId));
  return t;
}

export type ThreadSummary = {
  eventId: string;
  eventName: string;
  clientName: string;
  status: string;
  lastMessageAt: Date | null;
  lastAuthor: string | null;
  lastBody: string | null;
  unread: number;
};

/** Every event the actor can see, with its thread's latest message and unread count. */
export async function listMyThreads(ctx: ServiceCtx): Promise<ThreadSummary[]> {
  const visible = await listEvents(ctx);
  if (!visible.length) return [];
  const eventIds = visible.map((e) => e.id);
  const ts = await ctx.db.select().from(threads).where(inArray(threads.eventId, eventIds));
  const threadIds = ts.map((t) => t.id);
  const last = threadIds.length
    ? await ctx.db
        .selectDistinctOn([messages.threadId], { threadId: messages.threadId, body: messages.body, author: users.name, createdAt: messages.createdAt })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.authorId))
        .where(inArray(messages.threadId, threadIds))
        .orderBy(messages.threadId, desc(messages.createdAt))
    : [];
  const unreadRows = threadIds.length
    ? await ctx.db
        .select({ threadId: messages.threadId, n: sql<number>`count(*)`.mapWith(Number) })
        .from(messages)
        .leftJoin(threadReads, and(eq(threadReads.threadId, messages.threadId), eq(threadReads.userId, ctx.actor.userId)))
        .where(
          and(
            inArray(messages.threadId, threadIds),
            ne(messages.authorId, ctx.actor.userId),
            sql`${messages.createdAt} > coalesce(${threadReads.lastReadAt}, 'epoch'::timestamptz)`,
          ),
        )
        .groupBy(messages.threadId)
    : [];
  const byEvent = new Map(ts.map((t) => [t.eventId, t]));
  const lastBy = new Map(last.map((l) => [l.threadId, l]));
  const unreadBy = new Map(unreadRows.map((u) => [u.threadId, u.n]));
  return visible
    .map((e) => {
      const t = byEvent.get(e.id);
      const l = t ? lastBy.get(t.id) : undefined;
      return {
        eventId: e.id,
        eventName: e.name,
        clientName: e.clientName,
        status: e.status,
        lastMessageAt: l?.createdAt ?? null,
        lastAuthor: l?.author ?? null,
        lastBody: l?.body ?? null,
        unread: t ? (unreadBy.get(t.id) ?? 0) : 0,
      };
    })
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0) || a.eventName.localeCompare(b.eventName));
}

export async function unreadMessageCount(ctx: ServiceCtx) {
  return (await listMyThreads(ctx)).reduce((n, t) => n + t.unread, 0);
}

export async function listMessages(ctx: ServiceCtx, eventId: string, limit = 200) {
  await authorizeEvent(ctx, eventId, "event.view");
  const [t] = await ctx.db.select().from(threads).where(eq(threads.eventId, eventId));
  if (!t) return [];
  const rows = await ctx.db
    .select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, authorId: messages.authorId, authorName: users.name, entityType: messages.entityType, entityId: messages.entityId })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(eq(messages.threadId, t.id))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function markThreadRead(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  const [t] = await ctx.db.select().from(threads).where(eq(threads.eventId, eventId));
  if (!t) return;
  await ctx.db
    .insert(threadReads)
    .values({ threadId: t.id, userId: ctx.actor.userId, lastReadAt: ctx.now() })
    .onConflictDoUpdate({ target: [threadReads.threadId, threadReads.userId], set: { lastReadAt: ctx.now() } });
}

/** Names mentioned as "@Full Name" that match an active colleague (case-insensitive). */
export function findMentions<T extends { id: string; name: string }>(body: string, people: T[]): T[] {
  const lower = body.toLowerCase();
  return people.filter((p) => lower.includes(`@${p.name.toLowerCase()}`));
}

export async function postMessage(ctx: ServiceCtx, eventId: string, raw: unknown) {
  const scope = await authorizeEvent(ctx, eventId, "event.view");
  const input = parseInput(messageInput, raw);
  const t = await ensureThread(ctx.db, ctx.actor.orgId, eventId);
  const now = ctx.now();
  const msg = await ctx.db.transaction(async (tx) => {
    const [m] = await tx
      .insert(messages)
      .values({ orgId: ctx.actor.orgId, threadId: t.id, authorId: ctx.actor.userId, body: input.body, entityType: input.entityType ?? null, entityId: input.entityId ?? null, createdAt: now })
      .returning();
    await tx.update(threads).set({ lastMessageAt: now }).where(eq(threads.id, t.id));
    await tx
      .insert(threadReads)
      .values({ threadId: t.id, userId: ctx.actor.userId, lastReadAt: now })
      .onConflictDoUpdate({ target: [threadReads.threadId, threadReads.userId], set: { lastReadAt: now } });
    await audit(tx, ctx, { entityType: "event", entityId: eventId, eventId, action: "message_posted", summary: "Posted in the event discussion" });
    return m;
  });

  // @mentions: only colleagues who can see this event are notified.
  const colleagues = await ctx.db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")));
  const mentioned = findMentions(input.body, colleagues).filter((p) => p.id !== ctx.actor.userId && can({ userId: p.id, role: p.role }, "event.view", scope));
  if (mentioned.length) {
    const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.actor.orgId));
    const { name: eventName } = (await listEvents(ctx)).find((e) => e.id === eventId) ?? { name: "an event" };
    await notify(ctx.db, { id: org.id, config: orgConfigSchema.parse(org.config) }, mentioned.map((p) => p.id), {
      kind: "mention",
      title: `${ctx.actor.name} mentioned you in ${eventName}`,
      body: input.body.length > 180 ? `${input.body.slice(0, 177)}…` : input.body,
      link: `/events/${eventId}/discussion`,
      dedupeKey: `mention:${msg.id}`,
    });
  }
  return { ...msg, mentioned: mentioned.map((p) => p.name) };
}

