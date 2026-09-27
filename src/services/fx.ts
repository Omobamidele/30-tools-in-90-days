import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { fxRates } from "@/db/schema";
import { localDate } from "@/core/clauses/schemas";
import { assertCan, audit, type DbLike, type ServiceCtx } from "./context";
import { parseInput } from "./errors";

export type FxTable = { rate: (from: string, to: string) => string | null; asOf: (from: string, to: string) => string | null };

/** Admin-maintained rates. Direct pair first, then the inverse (rounded to 8 decimals). */
export async function loadFx(db: DbLike, orgId: string): Promise<FxTable> {
  const rows = await db.select().from(fxRates).where(eq(fxRates.orgId, orgId));
  const find = (from: string, to: string) => rows.find((r) => r.fromCcy === from && r.toCcy === to);
  return {
    rate: (from, to) => {
      if (from === to) return "1";
      const direct = find(from, to);
      if (direct) return direct.rate;
      const inverse = find(to, from);
      if (inverse && Number(inverse.rate) > 0) return (1 / Number(inverse.rate)).toFixed(8);
      return null;
    },
    asOf: (from, to) => (find(from, to) ?? find(to, from))?.asOf ?? null,
  };
}

export const fxInput = z.object({
  fromCcy: z.string().regex(/^[A-Z]{3}$/),
  toCcy: z.string().regex(/^[A-Z]{3}$/),
  rate: z.string().regex(/^\d+(\.\d{1,8})?$/, "Use a rate like 1.0850"),
  asOf: localDate,
});

export async function listFx(ctx: ServiceCtx) {
  return ctx.db.select().from(fxRates).where(eq(fxRates.orgId, ctx.actor.orgId)).orderBy(asc(fxRates.fromCcy));
}

export async function upsertFx(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "settings.edit");
  const input = parseInput(fxInput, raw);
  await ctx.db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.orgId, ctx.actor.orgId), eq(fxRates.fromCcy, input.fromCcy), eq(fxRates.toCcy, input.toCcy)));
    if (existing) await tx.update(fxRates).set({ rate: input.rate, asOf: input.asOf }).where(eq(fxRates.id, existing.id));
    else await tx.insert(fxRates).values({ orgId: ctx.actor.orgId, ...input });
    await audit(tx, ctx, {
      entityType: "settings",
      entityId: ctx.actor.orgId,
      action: "fx_updated",
      summary: `Set exchange rate ${input.fromCcy} → ${input.toCcy} to ${input.rate} (as of ${input.asOf})`,
    });
  });
}
