import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { alerts, clients, eventMembers, events, obligations, users } from "@/db/schema";
import { localDate } from "@/core/clauses/schemas";
import { COVERS } from "@/config/imagery";
import { can, restrictedToOwnEvents, type EventScope } from "@/auth/policy";
import { assertCan, audit, changes, type DbLike, type ServiceCtx } from "./context";
import { conflict, forbidden, notFound, parseInput } from "./errors";

export const EVENT_STATUSES = ["PLANNING", "CONTRACTED", "LIVE", "DELIVERED", "RECONCILED", "CANCELLED", "POSTPONED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const eventStatusLabels: Record<EventStatus, string> = {
  PLANNING: "Planning",
  CONTRACTED: "Contracted",
  LIVE: "Live",
  DELIVERED: "Delivered",
  RECONCILED: "Reconciled",
  CANCELLED: "Cancelled",
  POSTPONED: "Postponed",
};

// Allowed status moves (spec FR-2.2). Cancelled/Postponed are reachable from any open state.
const transitions: Record<EventStatus, EventStatus[]> = {
  PLANNING: ["CONTRACTED", "CANCELLED", "POSTPONED"],
  CONTRACTED: ["LIVE", "PLANNING", "CANCELLED", "POSTPONED"],
  LIVE: ["DELIVERED", "CANCELLED", "POSTPONED"],
  DELIVERED: ["RECONCILED", "LIVE"],
  RECONCILED: [],
  CANCELLED: ["RECONCILED"],
  POSTPONED: ["PLANNING", "CONTRACTED", "LIVE", "CANCELLED"],
};

export function allowedTransitions(status: EventStatus): EventStatus[] {
  return transitions[status];
}

export const eventInput = z
  .object({
    clientId: z.uuid("Choose a client"),
    name: z.string().trim().min(1, "Enter the event name"),
    type: z.string().trim().min(1, "Choose an event type"),
    startDate: localDate,
    endDate: localDate,
    destination: z.string().trim().max(200).optional().default(""),
    timezone: z.string().trim().min(1, "Choose the event's timezone"),
    ownerId: z.uuid("Choose an owner"),
    forecastAttendance: z.coerce.number().int("Whole numbers only").min(0, "Can't be negative"),
    baseCurrency: z.string().regex(/^[A-Z]{3}$/, "Choose a currency"),
    exposureThreshold: z.string().optional().default(""),
    memberIds: z.array(z.uuid()).optional().default([]),
    // A key from the cover catalogue, or "" for no cover.
    coverImage: z
      .string()
      .optional()
      .default("")
      .refine((k) => k === "" || COVERS.some((c) => c.key === k), "Choose one of the listed cover photos"),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after the start date" });
    try {
      new Intl.DateTimeFormat("en", { timeZone: v.timezone });
    } catch {
      ctx.addIssue({ code: "custom", path: ["timezone"], message: "Unknown timezone" });
    }
  });

export async function eventScope(db: DbLike, orgId: string, eventId: string): Promise<EventScope & { id: string }> {
  const [row] = await db
    .select({ id: events.id, ownerId: events.ownerId })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.orgId, orgId)));
  if (!row) throw notFound("Event");
  const members = await db.select({ userId: eventMembers.userId }).from(eventMembers).where(eq(eventMembers.eventId, eventId));
  return { id: row.id, ownerId: row.ownerId, memberIds: members.map((m) => m.userId) };
}

/** Loads the event scope and checks the action; throws not found for events outside the actor's reach. */
export async function authorizeEvent(ctx: ServiceCtx, eventId: string, action: Parameters<typeof can>[1]) {
  const scope = await eventScope(ctx.db, ctx.actor.orgId, eventId);
  if (!can(ctx.actor, "event.view", scope)) throw notFound("Event");
  assertCan(ctx, action, scope);
  return scope;
}

export async function listEvents(ctx: ServiceCtx) {
  const restricted = restrictedToOwnEvents(ctx.actor);
  const memberOf = restricted
    ? (await ctx.db.select({ id: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, ctx.actor.userId))).map(
        (r) => r.id,
      )
    : [];
  return ctx.db
    .select({
      id: events.id,
      name: events.name,
      type: events.type,
      startDate: events.startDate,
      endDate: events.endDate,
      destination: events.destination,
      coverImage: events.coverImage,
      status: events.status,
      forecastAttendance: events.forecastAttendance,
      baseCurrency: events.baseCurrency,
      timezone: events.timezone,
      clientId: clients.id,
      clientName: clients.name,
      ownerId: users.id,
      ownerName: users.name,
      contractCount: sql<number>`(select count(*) from contracts k where k.event_id = ${events.id} and k.status <> 'SUPERSEDED')`.mapWith(Number),
      activeContractCount: sql<number>`(select count(*) from contracts k where k.event_id = ${events.id} and k.status = 'ACTIVE')`.mapWith(Number),
    })
    .from(events)
    .innerJoin(clients, eq(clients.id, events.clientId))
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(
      and(
        eq(events.orgId, ctx.actor.orgId),
        restricted
          ? or(eq(events.ownerId, ctx.actor.userId), memberOf.length ? inArray(events.id, memberOf) : sql`false`)
          : undefined,
      ),
    )
    .orderBy(asc(events.startDate));
}

export async function getEvent(ctx: ServiceCtx, eventId: string) {
  const scope = await authorizeEvent(ctx, eventId, "event.view");
  const [row] = await ctx.db
    .select({ event: events, clientName: clients.name, ownerName: users.name })
    .from(events)
    .innerJoin(clients, eq(clients.id, events.clientId))
    .innerJoin(users, eq(users.id, events.ownerId))
    .where(eq(events.id, eventId));
  const members = scope.memberIds.length
    ? await ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, scope.memberIds))
    : [];
  return { ...row, members, scope };
}

function parseThreshold(s: string): number | null {
  const t = s.replace(/[^\d.]/g, "");
  if (!t) return null;
  return Math.round(Number(t) * 100);
}

async function assertSameOrg(ctx: ServiceCtx, clientId: string, userIds: string[]) {
  const [c] = await ctx.db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.actor.orgId)));
  if (!c) throw notFound("Client");
  if (userIds.length) {
    const found = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, userIds), eq(users.orgId, ctx.actor.orgId)));
    if (found.length !== new Set(userIds).size) throw notFound("User");
  }
}

export async function createEvent(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "event.create");
  const input = parseInput(eventInput, raw);
  // Event managers can only create events they own.
  if (ctx.actor.role === "EVENT_MANAGER" && input.ownerId !== ctx.actor.userId) {
    throw forbidden("Event managers can only create events they own.");
  }
  await assertSameOrg(ctx, input.clientId, [input.ownerId, ...input.memberIds]);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(events)
      .values({
        orgId: ctx.actor.orgId,
        clientId: input.clientId,
        name: input.name,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        destination: input.destination || null,
        timezone: input.timezone,
        ownerId: input.ownerId,
        forecastAttendance: input.forecastAttendance,
        baseCurrency: input.baseCurrency,
        exposureThresholdMinor: parseThreshold(input.exposureThreshold),
        coverImage: input.coverImage || null,
      })
      .returning();
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== input.ownerId);
    if (memberIds.length) await tx.insert(eventMembers).values(memberIds.map((userId) => ({ eventId: row.id, userId })));
    await audit(tx, ctx, { entityType: "event", entityId: row.id, eventId: row.id, action: "created", summary: `Created event ${row.name}` });
    return row;
  });
}

export async function updateEvent(ctx: ServiceCtx, eventId: string, raw: unknown, expectedLockVersion: number) {
  await authorizeEvent(ctx, eventId, "event.edit");
  const input = parseInput(eventInput, raw);
  await assertSameOrg(ctx, input.clientId, [input.ownerId, ...input.memberIds]);
  const [before] = await ctx.db.select().from(events).where(eq(events.id, eventId));
  const next = {
    clientId: input.clientId,
    name: input.name,
    type: input.type,
    startDate: input.startDate,
    endDate: input.endDate,
    destination: input.destination || null,
    timezone: input.timezone,
    ownerId: input.ownerId,
    forecastAttendance: input.forecastAttendance,
    baseCurrency: input.baseCurrency,
    exposureThresholdMinor: parseThreshold(input.exposureThreshold),
    coverImage: input.coverImage || null,
  };
  return ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(events)
      .set({ ...next, lockVersion: sql`${events.lockVersion} + 1` })
      .where(and(eq(events.id, eventId), eq(events.lockVersion, expectedLockVersion)))
      .returning();
    if (!updated.length) throw conflict("This event was changed by someone else. Reload to see their changes before saving.");
    await tx.delete(eventMembers).where(eq(eventMembers.eventId, eventId));
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== input.ownerId);
    if (memberIds.length) await tx.insert(eventMembers).values(memberIds.map((userId) => ({ eventId, userId })));
    await audit(tx, ctx, {
      entityType: "event",
      entityId: eventId,
      eventId,
      action: "updated",
      summary: `Updated event details`,
      diff: changes(before, next),
    });
    return updated[0];
  });
}

export async function setEventStatus(ctx: ServiceCtx, eventId: string, status: EventStatus) {
  await authorizeEvent(ctx, eventId, "event.edit");
  const [before] = await ctx.db.select().from(events).where(eq(events.id, eventId));
  if (!transitions[before.status].includes(status)) {
    throw conflict(`An event can't move from ${eventStatusLabels[before.status]} to ${eventStatusLabels[status]}.`);
  }
  await ctx.db.transaction(async (tx) => {
    await tx.update(events).set({ status }).where(eq(events.id, eventId));
    if (status === "DELIVERED" || status === "RECONCILED" || status === "CANCELLED") {
      // Deadlines other than payments no longer apply once the event is over; payments stay
      // open because the money is still owed. Alerts about the future close with them.
      const reason = status === "CANCELLED" ? "Event cancelled" : "Event delivered";
      await tx
        .update(obligations)
        .set({ status: "WAIVED", waivedReason: reason, doneAt: ctx.now(), doneBy: ctx.actor.userId })
        .where(and(eq(obligations.eventId, eventId), eq(obligations.status, "OPEN"), ne(obligations.kind, "PAYMENT")));
      await tx
        .update(alerts)
        .set({ status: "AUTO_RESOLVED", closedAt: ctx.now(), closedNote: reason })
        .where(and(eq(alerts.eventId, eventId), eq(alerts.status, "OPEN"), ne(alerts.rule, "OVERDUE")));
    }
    await audit(tx, ctx, {
      entityType: "event",
      entityId: eventId,
      eventId,
      action: "status_changed",
      summary: `Status changed from ${eventStatusLabels[before.status]} to ${eventStatusLabels[status]}`,
      diff: { status: { from: before.status, to: status } },
    });
  });
}

export async function listOrgUsers(ctx: ServiceCtx) {
  return ctx.db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")))
    .orderBy(asc(users.name));
}
