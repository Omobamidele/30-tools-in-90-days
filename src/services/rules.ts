import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, contacts, csqls, signalRuleVersions, signalRules, signals, subscriptions, usageSnapshots } from "@/db/schema";
import { ruleParamsSchemas, type RuleSeed, type RuleType } from "@/config/schema";
import { addDays } from "@/core/dates";
import { evaluateRule, isStale } from "@/core/rules/evaluate";
import type { Snapshot } from "@/core/rules/types";
import { estimateValue } from "@/core/value";
import { localDate } from "@/core/business-time";
import { parseMoney } from "@/core/money";
import { assertCan, audit, type DbLike, type ServiceCtx } from "./context";
import { notFound, parseInput, validation } from "./errors";
import { termsOf } from "./org";

// Signal rules (spec FR-6, FR-23): instances are configuration; rule types are core. Every edit
// is versioned with a note, and the editor previews what a change would raise today.

export async function seedRules(db: DbLike, orgId: string, rules: RuleSeed[], by: string | null) {
  for (const r of rules) {
    const params = ruleParamsSchemas[r.type].parse(r.params);
    const [row] = await db
      .insert(signalRules)
      .values({ orgId, key: r.key, type: r.type, name: r.name, params, weight: r.weight, minArrMinor: r.minArrMinor, segments: r.segments, cooldownDays: r.cooldownDays, enabled: r.enabled })
      .returning();
    await db.insert(signalRuleVersions).values({ orgId, ruleId: row.id, version: 1, snapshot: row, note: "Initial rule set", changedBy: by });
  }
}

/** Rules with their 90-day funnel: raised → accepted → opportunity → won (spec FR-23). */
export async function listRules(ctx: ServiceCtx) {
  const since = new Date(ctx.now().getTime() - 90 * 86_400_000);
  const rules = await ctx.db.select().from(signalRules).where(eq(signalRules.orgId, ctx.actor.orgId)).orderBy(signalRules.name);
  const stats = await ctx.db
    .select({
      ruleId: signals.ruleId,
      raised: sql<number>`count(*)::int`,
      accepted: sql<number>`count(*) filter (where ${signals.status} = 'ACCEPTED' and ${signals.triagedBy} is not null)::int`,
      dismissed: sql<number>`count(*) filter (where ${signals.status} = 'DISMISSED')::int`,
      opportunity: sql<number>`count(*) filter (where ${csqls.status} in ('OPPORTUNITY','WON','LOST'))::int`,
      won: sql<number>`count(*) filter (where ${csqls.status} = 'WON')::int`,
    })
    .from(signals)
    .leftJoin(csqls, eq(csqls.id, signals.csqlId))
    .where(and(eq(signals.orgId, ctx.actor.orgId), gte(signals.detectedAt, since)))
    .groupBy(signals.ruleId);
  return rules.map((r) => ({ rule: r, funnel: stats.find((s) => s.ruleId === r.id) ?? { raised: 0, accepted: 0, dismissed: 0, opportunity: 0, won: 0 } }));
}

export async function getRule(ctx: ServiceCtx, id: string) {
  const [rule] = await ctx.db.select().from(signalRules).where(and(eq(signalRules.id, id), eq(signalRules.orgId, ctx.actor.orgId)));
  if (!rule) throw notFound("Rule");
  const [versions, reasons, valueCompare] = await Promise.all([
    ctx.db.select().from(signalRuleVersions).where(eq(signalRuleVersions.ruleId, id)).orderBy(desc(signalRuleVersions.version)),
    ctx.db
      .select({ reason: signals.dismissReason, n: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(eq(signals.ruleId, id), eq(signals.status, "DISMISSED")))
      .groupBy(signals.dismissReason)
      .orderBy(desc(sql`count(*)`)),
    // Estimated value vs what sellers recorded, for converted signals.
    ctx.db
      .select({ est: signals.estValueMinor, opp: sql<number | null>`(${csqls.opportunity}->>'amountMinor')::bigint`, won: csqls.outcomeAmountMinor })
      .from(signals)
      .innerJoin(csqls, eq(csqls.id, signals.csqlId))
      .where(and(eq(signals.ruleId, id), inArray(csqls.status, ["OPPORTUNITY", "WON", "LOST"]))),
  ]);
  const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  return {
    rule,
    versions,
    reasons,
    medianEstimatedMinor: median(valueCompare.map((v) => v.est).filter((v): v is number => v !== null)),
    medianOpportunityMinor: median(valueCompare.map((v) => (v.opp === null ? null : Number(v.opp))).filter((v): v is number => v !== null)),
  };
}

const editInput = z.object({
  name: z.string().trim().min(3).max(120),
  params: z.record(z.string(), z.unknown()),
  weight: z.coerce.number().int().min(0).max(20),
  minArr: z.string().trim().optional().default(""),
  segments: z.array(z.string()).default([]),
  cooldownDays: z.coerce.number().int().min(0).max(365),
  enabled: z.boolean(),
  note: z.string().trim().min(3, "Add a short note saying what changed and why").max(500),
});

function parseRuleEdit(ctx: ServiceCtx, type: RuleType, raw: unknown) {
  const input = parseInput(editInput, raw);
  const params = ruleParamsSchemas[type].safeParse(input.params);
  if (!params.success) {
    const fe: Record<string, string> = {};
    for (const i of params.error.issues) fe[`params.${i.path.join(".")}`] = i.message;
    throw validation("Some settings need attention.", fe);
  }
  const minArrMinor = input.minArr ? parseMoney(input.minArr) : 0;
  if (minArrMinor === null || minArrMinor < 0) throw validation("Enter the minimum ARR as a number.", { minArr: "Enter a number, like 20,000" });
  const known = ctx.actor.config.segments.map((s) => s.key);
  const bad = input.segments.find((s) => !known.includes(s));
  if (bad) throw validation("Unknown segment.", { segments: `Unknown segment "${bad}"` });
  return { ...input, params: params.data, minArrMinor };
}

export async function updateRule(ctx: ServiceCtx, id: string, version: number, raw: unknown) {
  assertCan(ctx, "rules.manage");
  return ctx.db.transaction(async (tx) => {
    const [rule] = await tx.select().from(signalRules).where(and(eq(signalRules.id, id), eq(signalRules.orgId, ctx.actor.orgId))).for("update");
    if (!rule) throw notFound("Rule");
    if (rule.version !== version) throw validation("Someone changed this rule since you opened it. Reload to see their version.");
    const input = parseRuleEdit(ctx, rule.type, raw);
    const next = rule.version + 1;
    const [updated] = await tx
      .update(signalRules)
      .set({ name: input.name, params: input.params, weight: input.weight, minArrMinor: input.minArrMinor, segments: input.segments, cooldownDays: input.cooldownDays, enabled: input.enabled, version: next })
      .where(eq(signalRules.id, id))
      .returning();
    await tx.insert(signalRuleVersions).values({ orgId: ctx.actor.orgId, ruleId: id, version: next, snapshot: updated, note: input.note, changedBy: ctx.actor.userId, changedAt: ctx.now() });
    await audit(tx, ctx, { entityType: "rule", entityId: id, action: "updated", summary: `Rule "${updated.name}" v${next}: ${input.note}`, data: { before: rule, after: updated } });
    return updated;
  });
}

/**
 * What a rule would raise today with these settings, without writing anything. Uses the same
 * pure rule functions as detection, so the preview can't disagree with what will happen.
 */
export async function previewRule(ctx: ServiceCtx, id: string, raw: unknown) {
  assertCan(ctx, "rules.manage");
  const [rule] = await ctx.db.select().from(signalRules).where(and(eq(signalRules.id, id), eq(signalRules.orgId, ctx.actor.orgId)));
  if (!rule) throw notFound("Rule");
  const input = parseRuleEdit(ctx, rule.type, { ...(raw as object), note: "preview" });
  const today = localDate(ctx.now(), ctx.actor.timezone);
  const terms = termsOf(ctx.actor.config);
  const accts = await ctx.db.select().from(accounts).where(and(eq(accounts.orgId, ctx.actor.orgId), eq(accounts.status, "ACTIVE")));
  const ids = accts.map((a) => a.id);
  if (!ids.length) return { count: 0, totalMinor: 0, sample: [] };
  const [subs, snaps, people] = await Promise.all([
    ctx.db.select().from(subscriptions).where(inArray(subscriptions.accountId, ids)),
    ctx.db.select().from(usageSnapshots).where(and(inArray(usageSnapshots.accountId, ids), gte(usageSnapshots.date, addDays(today, -90)), lte(usageSnapshots.date, today))).orderBy(usageSnapshots.date),
    ctx.db.select().from(contacts).where(inArray(contacts.accountId, ids)),
  ]);
  const hits: Array<{ accountId: string; account: string; explanation: string; valueMinor: number | null }> = [];
  for (const a of accts) {
    const s = subs.find((x) => x.accountId === a.id);
    if (!s || s.arrMinor < input.minArrMinor) continue;
    if (input.segments.length && !input.segments.includes(a.segment ?? "")) continue;
    const window: Snapshot[] = snaps
      .filter((x) => x.accountId === a.id)
      .map((x) => ({ date: x.date, activeSeats: x.activeSeats, creditsUsedTerm: x.creditsUsedTerm, workspaces: x.workspaces as Snapshot["workspaces"], gatedAttempts: x.gatedAttempts as Record<string, number>, openEscalations: x.openEscalations }));
    if (isStale(window.at(-1)?.date ?? null, today, ctx.actor.config.detection.staleAfterDays)) continue;
    const c = evaluateRule(rule.type, {
      window,
      subscription: { plan: s.plan, seatsPurchased: s.seatsPurchased, creditsCommitted: s.creditsCommitted, termStart: s.termStart, termEnd: s.termEnd, arrMinor: s.arrMinor, addons: s.addons },
      contacts: people.filter((p) => p.accountId === a.id).map((p) => ({ id: p.id, name: p.name, title: p.title, seniority: p.seniority, firstSeenOn: p.firstSeenOn })),
      params: input.params as never,
      today,
      terms,
    });
    if (c) hits.push({ accountId: a.id, account: a.name, explanation: c.explanation, valueMinor: estimateValue(c.valueInputs, ctx.actor.config.priceBook, terms).valueMinor });
  }
  hits.sort((x, y) => (y.valueMinor ?? -1) - (x.valueMinor ?? -1));
  return { count: hits.length, totalMinor: hits.reduce((n, h) => n + (h.valueMinor ?? 0), 0), sample: hits.slice(0, 10) };
}
