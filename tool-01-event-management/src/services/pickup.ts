import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { clauses, contracts, pickupSnapshots, pickupValues } from "@/db/schema";
import { localDate, roomBlockTerms } from "@/core/clauses/schemas";
import type { PickupInput } from "@/core/exposure/types";
import { audit, type DbLike, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput, validation } from "./errors";
import { authorizeEvent } from "./events";

export const pickupInput = z.object({
  capturedAt: z.iso.datetime().optional(),
  nights: z
    .array(
      z.object({
        date: localDate,
        pickedUp: z.coerce.number().int("Whole rooms only").min(0, "Can't be negative"),
        forecastFinal: z.union([z.literal(""), z.null(), z.coerce.number().int().min(0)]).optional(),
      }),
    )
    .min(1),
});

async function loadBlock(ctx: ServiceCtx, clauseId: string) {
  const [row] = await ctx.db
    .select({ clause: clauses, contract: contracts })
    .from(clauses)
    .innerJoin(contracts, eq(contracts.id, clauses.contractId))
    .where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Room block");
  if (row.clause.type !== "ROOM_BLOCK") throw invalidState("Pickup can only be recorded for room blocks.");
  return row;
}

/** Records a dated pickup snapshot for a room block (manual grid, parsed CSV, or an emailed hotel report). */
export async function recordPickup(
  ctx: ServiceCtx,
  clauseId: string,
  raw: unknown,
  source: "MANUAL" | "CSV" | "EMAIL" = "MANUAL",
  fileId: string | null = null,
  /** For work no person did (an emailed report): audit as the system with this label. */
  systemLabel: string | null = null,
) {
  const { clause, contract } = await loadBlock(ctx, clauseId);
  await authorizeEvent(ctx, contract.eventId, "pickup.edit");
  const input = parseInput(pickupInput, raw);
  const terms = roomBlockTerms.parse(clause.data);
  const nightsInBlock = new Set(terms.nights.map((n) => n.date));
  const unknown = input.nights.filter((n) => !nightsInBlock.has(n.date));
  if (unknown.length) {
    throw validation(`${unknown.map((n) => n.date).join(", ")} ${unknown.length === 1 ? "isn't a night" : "aren't nights"} in this block.`);
  }
  const capturedAt = input.capturedAt ? new Date(input.capturedAt) : ctx.now();
  return ctx.db.transaction(async (tx) => {
    const [snap] = await tx
      .insert(pickupSnapshots)
      .values({ orgId: ctx.actor.orgId, clauseId, capturedAt, source, fileId, createdBy: ctx.actor.userId })
      .returning();
    await tx.insert(pickupValues).values(
      input.nights.map((n) => ({
        snapshotId: snap.id,
        nightDate: n.date,
        roomsPickedUp: n.pickedUp,
        forecastFinal: n.forecastFinal === "" || n.forecastFinal === undefined || n.forecastFinal === null ? null : Number(n.forecastFinal),
      })),
    );
    const total = input.nights.reduce((s, n) => s + n.pickedUp, 0);
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contract.id,
      eventId: contract.eventId,
      action: "pickup_recorded",
      summary: `Recorded pickup for ${clause.label}: ${total.toLocaleString("en-US")} room nights (${source === "CSV" ? "CSV import" : source === "EMAIL" ? "hotel report by email" : "entered"})`,
      ...(systemLabel ? { actorType: "SYSTEM" as const, actorLabel: systemLabel } : {}),
    });
    return snap;
  });
}

/** Latest pickup snapshot per room-block clause. */
export async function latestPickup(db: DbLike, clauseIds: string[]): Promise<Map<string, PickupInput>> {
  const out = new Map<string, PickupInput>();
  if (!clauseIds.length) return out;
  // One row per block: the newest snapshot. Same capture time (e.g. two entries in one
  // minute): the later entry wins.
  const snaps = await db
    .selectDistinctOn([pickupSnapshots.clauseId], { id: pickupSnapshots.id, clauseId: pickupSnapshots.clauseId, capturedAt: pickupSnapshots.capturedAt })
    .from(pickupSnapshots)
    .where(inArray(pickupSnapshots.clauseId, clauseIds))
    .orderBy(pickupSnapshots.clauseId, desc(pickupSnapshots.capturedAt), desc(pickupSnapshots.createdAt));
  const latest = new Map(snaps.map((s) => [s.clauseId, s]));
  if (!latest.size) return out;
  const values = await db
    .select()
    .from(pickupValues)
    .where(inArray(pickupValues.snapshotId, [...latest.values()].map((s) => s.id)));
  const bySnapshot = new Map<string, typeof values>();
  for (const v of values) bySnapshot.set(v.snapshotId, [...(bySnapshot.get(v.snapshotId) ?? []), v]);
  for (const [clauseId, snap] of latest) {
    const nights: PickupInput["nights"] = {};
    for (const v of bySnapshot.get(snap.id) ?? []) {
      nights[v.nightDate] = { pickedUp: v.roomsPickedUp, forecastFinal: v.forecastFinal };
    }
    out.set(clauseId, { capturedAt: snap.capturedAt.toISOString(), nights });
  }
  return out;
}

/** Pickup history for a block (pace view): total rooms picked up per snapshot. */
export async function pickupHistory(ctx: ServiceCtx, clauseId: string) {
  const { contract } = await loadBlock(ctx, clauseId);
  await authorizeEvent(ctx, contract.eventId, "event.view");
  const snaps = await ctx.db.select().from(pickupSnapshots).where(eq(pickupSnapshots.clauseId, clauseId)).orderBy(desc(pickupSnapshots.capturedAt));
  if (!snaps.length) return [];
  const values = await ctx.db.select().from(pickupValues).where(inArray(pickupValues.snapshotId, snaps.map((s) => s.id)));
  return snaps.map((s) => ({
    id: s.id,
    capturedAt: s.capturedAt,
    source: s.source,
    nights: values
      .filter((v) => v.snapshotId === s.id)
      .map((v) => ({ date: v.nightDate, pickedUp: v.roomsPickedUp, forecastFinal: v.forecastFinal }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }));
}
