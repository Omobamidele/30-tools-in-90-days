import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { contracts, eventMembers, events, obligations, payments, suppliers, users } from "@/db/schema";
import { localDate } from "@/core/clauses/schemas";
import { formatMoney, parseMoney } from "@/core/money";
import { restrictedToOwnEvents } from "@/auth/policy";
import { audit, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput, validation } from "./errors";
import { authorizeEvent } from "./events";

export const obligationKindLabels = {
  PAYMENT: "Payment",
  CUTOFF: "Cutoff",
  REVIEW: "Block review",
  GUARANTEE: "Guarantee",
  TIER_CHANGE: "Cancellation tier",
  OTHER: "Deadline",
} as const;

export type ObligationRow = Awaited<ReturnType<typeof listObligations>>[number];

/** Obligations across events the actor can see; filters mirror the Deadlines view. */
export async function listObligations(
  ctx: ServiceCtx,
  filter: { eventId?: string; ownerId?: string; includeDone?: boolean } = {},
) {
  if (filter.eventId) await authorizeEvent(ctx, filter.eventId, "event.view");
  const restricted = restrictedToOwnEvents(ctx.actor);
  const memberOf = restricted
    ? (await ctx.db.select({ id: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, ctx.actor.userId))).map((r) => r.id)
    : [];

  return ctx.db
    .select({
      id: obligations.id,
      kind: obligations.kind,
      label: obligations.label,
      dueAt: obligations.dueAt,
      dueTz: obligations.dueTz,
      amountMinor: obligations.amountMinor,
      currency: obligations.currency,
      status: obligations.status,
      doneAt: obligations.doneAt,
      ownerId: obligations.ownerId,
      ownerName: users.name,
      eventId: events.id,
      eventName: events.name,
      contractId: contracts.id,
      contractTitle: contracts.title,
      supplierName: suppliers.name,
      paidMinor: sql<number>`(select coalesce(sum(p.amount_minor), 0) from payments p where p.obligation_id = ${obligations.id})`.mapWith(Number),
    })
    .from(obligations)
    .innerJoin(events, eq(events.id, obligations.eventId))
    .innerJoin(contracts, eq(contracts.id, obligations.contractId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .leftJoin(users, eq(users.id, obligations.ownerId))
    .where(
      and(
        eq(obligations.orgId, ctx.actor.orgId),
        filter.includeDone ? inArray(obligations.status, ["OPEN", "DONE", "WAIVED"]) : eq(obligations.status, "OPEN"),
        filter.eventId ? eq(obligations.eventId, filter.eventId) : undefined,
        filter.ownerId ? eq(obligations.ownerId, filter.ownerId) : undefined,
        restricted
          ? or(eq(events.ownerId, ctx.actor.userId), memberOf.length ? inArray(events.id, memberOf) : sql`false`)
          : undefined,
      ),
    )
    .orderBy(asc(obligations.dueAt));
}

async function loadObligation(ctx: ServiceCtx, id: string) {
  const [row] = await ctx.db.select().from(obligations).where(and(eq(obligations.id, id), eq(obligations.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Deadline");
  return row;
}

export async function markObligationDone(ctx: ServiceCtx, id: string) {
  const o = await loadObligation(ctx, id);
  await authorizeEvent(ctx, o.eventId, "event.edit");
  if (o.status !== "OPEN") throw invalidState("This deadline is already closed.");
  await ctx.db.transaction(async (tx) => {
    await tx.update(obligations).set({ status: "DONE", doneAt: ctx.now(), doneBy: ctx.actor.userId }).where(eq(obligations.id, id));
    await audit(tx, ctx, { entityType: "obligation", entityId: id, eventId: o.eventId, action: "done", summary: `Marked done: ${o.label}` });
  });
}

export async function reopenObligation(ctx: ServiceCtx, id: string) {
  const o = await loadObligation(ctx, id);
  await authorizeEvent(ctx, o.eventId, "event.edit");
  if (o.status !== "DONE" && o.status !== "WAIVED") throw invalidState("Only closed deadlines can be reopened.");
  await ctx.db.transaction(async (tx) => {
    await tx.update(obligations).set({ status: "OPEN", doneAt: null, doneBy: null, waivedReason: null }).where(eq(obligations.id, id));
    await audit(tx, ctx, { entityType: "obligation", entityId: id, eventId: o.eventId, action: "reopened", summary: `Reopened: ${o.label}` });
  });
}

export async function waiveObligation(ctx: ServiceCtx, id: string, reason: string) {
  const o = await loadObligation(ctx, id);
  await authorizeEvent(ctx, o.eventId, "event.edit");
  if (!reason.trim()) throw validation("Say why this deadline no longer applies.", { reason: "Required" });
  await ctx.db.transaction(async (tx) => {
    await tx.update(obligations).set({ status: "WAIVED", waivedReason: reason.trim(), doneAt: ctx.now(), doneBy: ctx.actor.userId }).where(eq(obligations.id, id));
    await audit(tx, ctx, { entityType: "obligation", entityId: id, eventId: o.eventId, action: "waived", summary: `Waived: ${o.label} (${reason.trim()})` });
  });
}

export const paymentInput = z.object({
  paidAt: localDate,
  amount: z.string().min(1, "Enter the amount paid"),
  reference: z.string().trim().max(120).optional().default(""),
});

export async function recordPayment(ctx: ServiceCtx, obligationId: string, raw: unknown) {
  const o = await loadObligation(ctx, obligationId);
  await authorizeEvent(ctx, o.eventId, "payment.record");
  if (o.kind !== "PAYMENT") throw invalidState("Payments can only be recorded against payment deadlines.");
  const input = parseInput(paymentInput, raw);
  const amount = parseMoney(input.amount);
  if (amount === null || amount <= 0) throw validation("Enter the amount paid, e.g. 40,000.00", { amount: "Enter a valid amount" });
  await ctx.db.transaction(async (tx) => {
    await tx.insert(payments).values({
      orgId: ctx.actor.orgId,
      obligationId,
      paidAt: input.paidAt,
      amountMinor: amount,
      reference: input.reference || null,
      recordedBy: ctx.actor.userId,
    });
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`.mapWith(Number) })
      .from(payments)
      .where(eq(payments.obligationId, obligationId));
    if (o.amountMinor !== null && total >= o.amountMinor && o.status === "OPEN") {
      await tx.update(obligations).set({ status: "DONE", doneAt: ctx.now(), doneBy: ctx.actor.userId }).where(eq(obligations.id, obligationId));
    }
    await audit(tx, ctx, {
      entityType: "obligation",
      entityId: obligationId,
      eventId: o.eventId,
      action: "payment_recorded",
      summary: `Recorded payment of ${formatMoney(amount, o.currency ?? "")} for ${o.label}`,
    });
  });
}

export async function setObligationOwner(ctx: ServiceCtx, id: string, ownerId: string) {
  const o = await loadObligation(ctx, id);
  await authorizeEvent(ctx, o.eventId, "event.edit");
  const [u] = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.id, ownerId), eq(users.orgId, ctx.actor.orgId)));
  if (!u) throw notFound("User");
  await ctx.db.transaction(async (tx) => {
    await tx.update(obligations).set({ ownerId }).where(eq(obligations.id, id));
    await audit(tx, ctx, { entityType: "obligation", entityId: id, eventId: o.eventId, action: "owner_changed", summary: `Assigned ${o.label} to ${u.name}` });
  });
}
