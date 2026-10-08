import { and, asc, count, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { clientAgreements, clients, events, liabilityRules } from "@/db/schema";
import { localDate } from "@/core/clauses/schemas";
import type { LiabilityRules } from "@/core/exposure/types";
import { assertCan, audit, changes, type DbLike, type ServiceCtx } from "./context";
import { notFound, parseInput, validation } from "./errors";

export const LIABILITY_CATEGORIES = ["DEPOSIT", "ATTRITION", "FB_SHORTFALL", "CANCELLATION", "OTHER"] as const;
export const liabilityCategoryLabels: Record<(typeof LIABILITY_CATEGORIES)[number], string> = {
  DEPOSIT: "Forfeited deposits",
  ATTRITION: "Room block attrition",
  FB_SHORTFALL: "F&B minimum shortfall",
  CANCELLATION: "Cancellation charges",
  OTHER: "Other penalties",
};

export const clientInput = z.object({
  name: z.string().trim().min(1, "Enter the client's name"),
  industry: z.string().trim().max(120).optional().default(""),
  billingContactName: z.string().trim().max(200).optional().default(""),
  billingContactEmail: z.union([z.literal(""), z.email("Enter a valid email")]).optional().default(""),
  notes: z.string().trim().max(4000).optional().default(""),
});

const ruleInput = z.object({
  category: z.enum(LIABILITY_CATEGORIES),
  bearer: z.enum(["CLIENT", "AGENCY", "SPLIT", "NONE"]),
  agencyPct: z.coerce.number().int().min(0).max(100).default(0),
});

export const agreementInput = z
  .object({
    name: z.string().trim().min(1, "Name the agreement, e.g. Master services agreement 2026"),
    effectiveFrom: localDate,
    effectiveTo: z.union([z.literal(""), localDate]).optional().default(""),
    rules: z.array(ruleInput),
  })
  .superRefine((v, ctx) => {
    if (v.effectiveTo && v.effectiveTo < v.effectiveFrom) {
      ctx.addIssue({ code: "custom", path: ["effectiveTo"], message: "End date must be after the start date" });
    }
    v.rules.forEach((r, i) => {
      if (r.bearer === "SPLIT" && (r.agencyPct <= 0 || r.agencyPct >= 100)) {
        ctx.addIssue({ code: "custom", path: ["rules", i, "agencyPct"], message: "Agency share must be between 1 and 99%" });
      }
    });
  });

const nullIfEmpty = (s: string | undefined) => (s ? s : null);

export async function listClients(ctx: ServiceCtx) {
  assertCan(ctx, "client.view");
  return ctx.db
    .select({
      id: clients.id,
      name: clients.name,
      industry: clients.industry,
      billingContactName: clients.billingContactName,
      eventCount: count(events.id),
    })
    .from(clients)
    .leftJoin(events, eq(events.clientId, clients.id))
    .where(and(eq(clients.orgId, ctx.actor.orgId), isNull(clients.archivedAt)))
    .groupBy(clients.id)
    .orderBy(asc(clients.name));
}

export async function getClient(ctx: ServiceCtx, clientId: string) {
  assertCan(ctx, "client.view");
  const [client] = await ctx.db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.actor.orgId)));
  if (!client) throw notFound("Client");
  const agreements = await ctx.db
    .select()
    .from(clientAgreements)
    .where(eq(clientAgreements.clientId, clientId))
    .orderBy(desc(clientAgreements.effectiveFrom));
  const rules = agreements.length
    ? await ctx.db
        .select()
        .from(liabilityRules)
        .where(or(...agreements.map((a) => eq(liabilityRules.agreementId, a.id))))
    : [];
  return {
    client,
    agreements: agreements.map((a) => ({ ...a, rules: rules.filter((r) => r.agreementId === a.id) })),
  };
}

export async function createClient(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "client.edit");
  const input = parseInput(clientInput, raw);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({
        orgId: ctx.actor.orgId,
        name: input.name,
        industry: nullIfEmpty(input.industry),
        billingContactName: nullIfEmpty(input.billingContactName),
        billingContactEmail: nullIfEmpty(input.billingContactEmail),
        notes: nullIfEmpty(input.notes),
      })
      .returning();
    await audit(tx, ctx, { entityType: "client", entityId: row.id, action: "created", summary: `Created client ${row.name}` });
    return row;
  });
}

export async function updateClient(ctx: ServiceCtx, clientId: string, raw: unknown) {
  assertCan(ctx, "client.edit");
  const input = parseInput(clientInput, raw);
  const { client } = await getClient(ctx, clientId);
  const next = {
    name: input.name,
    industry: nullIfEmpty(input.industry),
    billingContactName: nullIfEmpty(input.billingContactName),
    billingContactEmail: nullIfEmpty(input.billingContactEmail),
    notes: nullIfEmpty(input.notes),
  };
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.update(clients).set(next).where(eq(clients.id, clientId)).returning();
    await audit(tx, ctx, {
      entityType: "client",
      entityId: clientId,
      action: "updated",
      summary: `Updated client ${row.name}`,
      diff: changes(client, next),
    });
    return row;
  });
}

async function writeRules(tx: DbLike, orgId: string, agreementId: string, rules: z.infer<typeof ruleInput>[]) {
  await tx.delete(liabilityRules).where(eq(liabilityRules.agreementId, agreementId));
  const rows = rules
    .filter((r) => r.bearer !== "NONE")
    .map((r) => ({
      orgId,
      agreementId,
      category: r.category,
      bearer: r.bearer as "CLIENT" | "AGENCY" | "SPLIT",
      agencyPct: r.bearer === "SPLIT" ? r.agencyPct : r.bearer === "AGENCY" ? 100 : 0,
    }));
  if (rows.length) await tx.insert(liabilityRules).values(rows);
}

export async function createAgreement(ctx: ServiceCtx, clientId: string, raw: unknown) {
  assertCan(ctx, "client.edit");
  const input = parseInput(agreementInput, raw);
  await getClient(ctx, clientId);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clientAgreements)
      .values({
        orgId: ctx.actor.orgId,
        clientId,
        name: input.name,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: nullIfEmpty(input.effectiveTo),
      })
      .returning();
    await writeRules(tx, ctx.actor.orgId, row.id, input.rules);
    await audit(tx, ctx, {
      entityType: "client",
      entityId: clientId,
      action: "agreement_created",
      summary: `Added agreement ${row.name}`,
      diff: { rules: input.rules },
    });
    return row;
  });
}

export async function updateAgreement(ctx: ServiceCtx, agreementId: string, raw: unknown) {
  assertCan(ctx, "client.edit");
  const input = parseInput(agreementInput, raw);
  const [existing] = await ctx.db
    .select()
    .from(clientAgreements)
    .where(and(eq(clientAgreements.id, agreementId), eq(clientAgreements.orgId, ctx.actor.orgId)));
  if (!existing) throw notFound("Agreement");
  const before = await ctx.db.select().from(liabilityRules).where(eq(liabilityRules.agreementId, agreementId));
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .update(clientAgreements)
      .set({ name: input.name, effectiveFrom: input.effectiveFrom, effectiveTo: nullIfEmpty(input.effectiveTo) })
      .where(eq(clientAgreements.id, agreementId))
      .returning();
    await writeRules(tx, ctx.actor.orgId, agreementId, input.rules);
    await audit(tx, ctx, {
      entityType: "client",
      entityId: existing.clientId,
      action: "agreement_updated",
      summary: `Updated liability rules in ${row.name}`,
      diff: {
        before: before.map((r) => ({ category: r.category, bearer: r.bearer, agencyPct: r.agencyPct })),
        after: input.rules,
      },
    });
    return row;
  });
}

/**
 * Liability rules in force for an event: the client's agreement effective on the event's
 * start date. Returns null when there is none (exposure is then "unassigned").
 */
export async function rulesForEvent(
  db: DbLike,
  orgId: string,
  clientId: string,
  eventStartDate: string,
): Promise<{ agreementId: string; agreementName: string; rules: LiabilityRules } | null> {
  const [agreement] = await db
    .select()
    .from(clientAgreements)
    .where(
      and(
        eq(clientAgreements.orgId, orgId),
        eq(clientAgreements.clientId, clientId),
        lte(clientAgreements.effectiveFrom, eventStartDate),
        or(isNull(clientAgreements.effectiveTo), gte(clientAgreements.effectiveTo, eventStartDate)),
      ),
    )
    .orderBy(desc(clientAgreements.effectiveFrom))
    .limit(1);
  if (!agreement) return null;
  const rows = await db.select().from(liabilityRules).where(eq(liabilityRules.agreementId, agreement.id));
  const rules: LiabilityRules = {};
  for (const r of rows) rules[r.category] = { bearer: r.bearer, agencyPct: r.agencyPct };
  return { agreementId: agreement.id, agreementName: agreement.name, rules };
}

export function assertNoValidationIssue(cond: boolean, message: string, field: string) {
  if (!cond) throw validation(message, { [field]: message });
}
