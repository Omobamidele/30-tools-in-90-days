import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { contracts, suppliers } from "@/db/schema";
import { assertCan, audit, type ServiceCtx } from "./context";
import { conflict, notFound, parseInput } from "./errors";

export const SUPPLIER_TYPES = ["HOTEL", "VENUE", "CATERER", "AV_PRODUCTION", "TRANSPORT", "DMC", "OTHER"] as const;
export const supplierTypeLabels: Record<(typeof SUPPLIER_TYPES)[number], string> = {
  HOTEL: "Hotel",
  VENUE: "Venue",
  CATERER: "Caterer",
  AV_PRODUCTION: "AV & production",
  TRANSPORT: "Transport",
  DMC: "DMC",
  OTHER: "Other",
};

export const supplierInput = z.object({
  name: z.string().trim().min(1, "Enter the supplier's name"),
  type: z.enum(SUPPLIER_TYPES),
  city: z.string().trim().max(120).optional().default(""),
  country: z.string().trim().max(120).optional().default(""),
  allowDuplicate: z.coerce.boolean().optional().default(false),
});

/** "Hôtel Tivoli, Lisbon" and "hotel tivoli" + "lisbon" normalise to the same key. */
export function normalizeSupplierKey(name: string, city: string | null | undefined): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${clean(name)}|${clean(city ?? "")}`;
}

export async function listSuppliers(ctx: ServiceCtx) {
  return ctx.db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      type: suppliers.type,
      city: suppliers.city,
      country: suppliers.country,
      contractCount: count(contracts.id),
    })
    .from(suppliers)
    .leftJoin(contracts, eq(contracts.supplierId, suppliers.id))
    .where(eq(suppliers.orgId, ctx.actor.orgId))
    .groupBy(suppliers.id)
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(ctx: ServiceCtx, id: string) {
  const [row] = await ctx.db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Supplier");
  return row;
}

export async function createSupplier(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "supplier.edit");
  const input = parseInput(supplierInput, raw);
  const key = normalizeSupplierKey(input.name, input.city);
  if (!input.allowDuplicate) {
    const [dupe] = await ctx.db
      .select({ id: suppliers.id, name: suppliers.name, city: suppliers.city })
      .from(suppliers)
      .where(and(eq(suppliers.orgId, ctx.actor.orgId), eq(suppliers.normalizedKey, key)));
    if (dupe) {
      throw conflict(
        `${dupe.name}${dupe.city ? ` (${dupe.city})` : ""} already exists. Use the existing supplier, or confirm this is a different one.`,
      );
    }
  }
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(suppliers)
      .values({
        orgId: ctx.actor.orgId,
        name: input.name,
        type: input.type,
        city: input.city || null,
        country: input.country || null,
        normalizedKey: key,
      })
      .returning();
    await audit(tx, ctx, { entityType: "supplier", entityId: row.id, action: "created", summary: `Added supplier ${row.name}` });
    return row;
  });
}
