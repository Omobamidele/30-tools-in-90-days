import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { actualPenalties, contracts, decisions, events, exposureSnapshots, suppliers, users } from "@/db/schema";
import { convertMinor, parseMoney } from "@/core/money";
import { addDays } from "@/core/time";
import { assertCan, audit, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput, validation } from "./errors";
import { authorizeEvent } from "./events";
import { loadFx } from "./fx";

export const PENALTY_CATEGORIES = ["ATTRITION", "FB_SHORTFALL", "CANCELLATION", "OTHER"] as const;
export const penaltyLabels: Record<(typeof PENALTY_CATEGORIES)[number], string> = {
  ATTRITION: "Room block attrition",
  FB_SHORTFALL: "F&B shortfall",
  CANCELLATION: "Cancellation charge",
  OTHER: "Other penalty",
};

export const penaltyInput = z.object({
  category: z.enum(PENALTY_CATEGORIES),
  amount: z.string().min(1, "Enter the amount charged"),
  invoiceRef: z.string().trim().max(120).optional().default(""),
});

export async function recordActualPenalty(ctx: ServiceCtx, contractId: string, raw: unknown) {
  const [k] = await ctx.db.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.actor.orgId)));
  if (!k) throw notFound("Contract");
  await authorizeEvent(ctx, k.eventId, "penalty.record");
  const [ev] = await ctx.db.select().from(events).where(eq(events.id, k.eventId));
  if (!["DELIVERED", "RECONCILED", "CANCELLED"].includes(ev.status)) {
    throw invalidState("Record actual penalties once the event is delivered or cancelled.");
  }
  const input = parseInput(penaltyInput, raw);
  const amount = parseMoney(input.amount);
  if (amount === null || amount < 0) throw validation("Enter the amount charged, e.g. 4,725.00", { amount: "Enter a valid amount" });
  await ctx.db.transaction(async (tx) => {
    await tx.insert(actualPenalties).values({
      orgId: ctx.actor.orgId,
      contractId,
      category: input.category,
      amountMinor: amount,
      invoiceRef: input.invoiceRef || null,
      recordedBy: ctx.actor.userId,
    });
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contractId,
      eventId: k.eventId,
      action: "actual_penalty_recorded",
      summary: `Recorded actual ${penaltyLabels[input.category].toLowerCase()}: ${(amount / 100).toFixed(2)} ${k.currency}${input.invoiceRef ? ` (invoice ${input.invoiceRef})` : ""}`,
    });
  });
}

export async function deleteActualPenalty(ctx: ServiceCtx, id: string) {
  const [p] = await ctx.db
    .select({ p: actualPenalties, eventId: contracts.eventId })
    .from(actualPenalties)
    .innerJoin(contracts, eq(contracts.id, actualPenalties.contractId))
    .where(and(eq(actualPenalties.id, id), eq(actualPenalties.orgId, ctx.actor.orgId)));
  if (!p) throw notFound("Penalty");
  await authorizeEvent(ctx, p.eventId, "penalty.record");
  await ctx.db.transaction(async (tx) => {
    await tx.delete(actualPenalties).where(eq(actualPenalties.id, id));
    await audit(tx, ctx, { entityType: "contract", entityId: p.p.contractId, eventId: p.eventId, action: "actual_penalty_removed", summary: "Removed a recorded penalty" });
  });
}

/** Snapshot on or before a date (end of day UTC), for "what did we project then". */
async function snapshotAtOrBefore(db: ServiceCtx["db"], eventId: string, date: string) {
  const [s] = await db
    .select()
    .from(exposureSnapshots)
    .where(and(eq(exposureSnapshots.eventId, eventId), lte(exposureSnapshots.takenAt, new Date(`${date}T23:59:59Z`))))
    .orderBy(desc(exposureSnapshots.takenAt))
    .limit(1);
  return s ?? null;
}

/** Projected (T-30, T-7, start) vs actual penalties for one event, in its reporting currency. */
export async function eventVariance(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  const [ev] = await ctx.db.select().from(events).where(eq(events.id, eventId));
  const contractRows = await ctx.db
    .select({ id: contracts.id, title: contracts.title, currency: contracts.currency, supplierName: suppliers.name, status: contracts.status })
    .from(contracts)
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(contracts.eventId, eventId), inArray(contracts.status, ["ACTIVE", "CLOSED", "CANCELLED"])))
    .orderBy(asc(suppliers.name));
  const penalties = contractRows.length
    ? await ctx.db
        .select({ p: actualPenalties, by: users.name })
        .from(actualPenalties)
        .leftJoin(users, eq(users.id, actualPenalties.recordedBy))
        .where(inArray(actualPenalties.contractId, contractRows.map((c) => c.id)))
        .orderBy(asc(actualPenalties.createdAt))
    : [];
  const [t30, t7, t0] = await Promise.all([
    snapshotAtOrBefore(ctx.db, eventId, addDays(ev.startDate, -30)),
    snapshotAtOrBefore(ctx.db, eventId, addDays(ev.startDate, -7)),
    snapshotAtOrBefore(ctx.db, eventId, ev.startDate),
  ]);
  // Decisions record amounts in the currency they were entered in; convert to the event's.
  const [avoided, fx] = await Promise.all([ctx.db.select().from(decisions).where(eq(decisions.eventId, eventId)), loadFx(ctx.db, ctx.actor.orgId)]);
  let avoidedMinor = 0;
  let avoidedMissingFx = false;
  for (const d of avoided) {
    if (!d.exposureDeltaMinor) continue;
    const rate = fx.rate(d.currency ?? ev.baseCurrency, ev.baseCurrency);
    if (rate === null) avoidedMissingFx = true;
    else avoidedMinor += convertMinor(Math.abs(d.exposureDeltaMinor), rate);
  }
  return {
    event: ev,
    contracts: contractRows.map((c) => ({ ...c, penalties: penalties.filter((x) => x.p.contractId === c.id).map((x) => ({ ...x.p, byName: x.by })) })),
    projected: {
      t30: t30 ? { at: t30.takenAt, minor: ev.status === "CANCELLED" ? t30.cancellationMinor : t30.currentMinor, currency: t30.currency } : null,
      t7: t7 ? { at: t7.takenAt, minor: ev.status === "CANCELLED" ? t7.cancellationMinor : t7.currentMinor, currency: t7.currency } : null,
      start: t0 ? { at: t0.takenAt, minor: ev.status === "CANCELLED" ? t0.cancellationMinor : t0.currentMinor, currency: t0.currency } : null,
    },
    avoidedMinor,
    avoidedMissingFx,
  };
}

/**
 * Actual penalties recorded per event, converted to the organisation currency. Events whose
 * penalty currency has no exchange rate are reported in `missingFx` rather than guessed.
 */
export async function actualPenaltiesByEvent(ctx: ServiceCtx, eventIds: string[]) {
  const out = new Map<string, number>();
  const missingFx = new Set<string>();
  if (!eventIds.length) return { totals: out, missingFx };
  const rows = await ctx.db
    .select({ eventId: contracts.eventId, currency: contracts.currency, total: sql<number>`coalesce(sum(${actualPenalties.amountMinor}), 0)`.mapWith(Number) })
    .from(actualPenalties)
    .innerJoin(contracts, eq(contracts.id, actualPenalties.contractId))
    .where(and(eq(actualPenalties.orgId, ctx.actor.orgId), inArray(contracts.eventId, eventIds)))
    .groupBy(contracts.eventId, contracts.currency);
  const fx = await loadFx(ctx.db, ctx.actor.orgId);
  for (const r of rows) {
    const rate = fx.rate(r.currency, ctx.actor.baseCurrency);
    if (rate === null) {
      missingFx.add(r.eventId);
      continue;
    }
    out.set(r.eventId, (out.get(r.eventId) ?? 0) + convertMinor(r.total, rate));
  }
  return { totals: out, missingFx };
}

export async function assertPortfolio(ctx: ServiceCtx) {
  assertCan(ctx, "portfolio.view");
}
