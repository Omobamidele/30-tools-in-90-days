import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { csqls, signals, users } from "@/db/schema";
import type { RuleType } from "@/config/schema";
import { assertCan, type ServiceCtx } from "./context";
import type { Opportunity } from "./csqls";

// Results (spec FR-22): only recorded facts count. Pipeline is what sellers recorded as an
// opportunity; won is what they recorded as closed. Estimated values are reported separately and
// never added to won revenue.

export type Period = "90d" | "quarter" | "year" | "all";

export function periodRange(period: Period, now: Date, tz: string): { from: Date | null; to: Date; label: string } {
  const d = new TZDate(now.getTime(), tz);
  if (period === "all") return { from: null, to: now, label: "all time" };
  if (period === "90d") return { from: new Date(now.getTime() - 90 * 86_400_000), to: now, label: "the last 90 days" };
  if (period === "year") return { from: new Date(new TZDate(d.getFullYear(), 0, 1, tz).getTime()), to: now, label: String(d.getFullYear()) };
  const q = Math.floor(d.getMonth() / 3);
  return { from: new Date(new TZDate(d.getFullYear(), q * 3, 1, tz).getTime()), to: now, label: `Q${q + 1} ${d.getFullYear()}` };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export async function getResults(ctx: ServiceCtx, period: Period) {
  assertCan(ctx, "results.view");
  const { from, to, label } = periodRange(period, ctx.now(), ctx.actor.timezone);
  const inRange = (col: Parameters<typeof gte>[0]) => and(from ? gte(col, from) : undefined, lt(col, new Date(to.getTime() + 1)));
  const org = eq(signals.orgId, ctx.actor.orgId);
  // CSMs and sellers see their own results; leaders and execs see everyone's.
  const ownOnly = ctx.actor.role === "CSM" || ctx.actor.role === "SELLER";
  const csqlScope = ownOnly ? (ctx.actor.role === "CSM" ? eq(csqls.sourcedBy, ctx.actor.userId) : eq(csqls.ownerId, ctx.actor.userId)) : undefined;

  const [raised, triaged, allCsqls, people] = await Promise.all([
    ctx.db.select({ type: signals.type, value: signals.estValueMinor }).from(signals).where(and(org, inRange(signals.detectedAt), ownOnly && ctx.actor.role === "CSM" ? sql`exists (select 1 from accounts a where a.id = ${signals.accountId} and a.csm_id = ${ctx.actor.userId})` : undefined)),
    ctx.db
      .select({ type: signals.type, status: signals.status, reason: signals.dismissReason, detectedAt: signals.detectedAt, triagedAt: signals.triagedAt, triageDueAt: signals.triageDueAt, triagedBy: signals.triagedBy })
      .from(signals)
      .where(and(org, isNotNull(signals.triagedBy), inRange(signals.triagedAt), ownOnly && ctx.actor.role === "CSM" ? eq(signals.triagedBy, ctx.actor.userId) : undefined)),
    ctx.db.select().from(csqls).where(and(eq(csqls.orgId, ctx.actor.orgId), csqlScope)),
    ctx.db.select({ id: users.id, name: users.name }).from(users).where(eq(users.orgId, ctx.actor.orgId)),
  ]);
  const ids = allCsqls.map((c) => c.id);
  const csqlTypes = ids.length ? await ctx.db.select({ csqlId: signals.csqlId, type: signals.type }).from(signals).where(inArray(signals.csqlId, ids)) : [];
  const typesOf = (id: string) => [...new Set(csqlTypes.filter((t) => t.csqlId === id).map((t) => t.type))];
  const within = (d: Date | null) => !!d && (!from || d >= from) && d <= to;
  const oppAt = (c: (typeof allCsqls)[number]) => ((c.opportunity as Opportunity | null)?.recordedAt ? new Date((c.opportunity as Opportunity).recordedAt) : null);
  const oppAmount = (c: (typeof allCsqls)[number]) => (c.opportunity as Opportunity | null)?.amountMinor ?? 0;

  const routed = allCsqls.filter((c) => within(c.createdAt));
  const opps = allCsqls.filter((c) => within(oppAt(c)));
  const won = allCsqls.filter((c) => c.status === "WON" && within(c.closedAt));
  const lost = allCsqls.filter((c) => c.status === "LOST" && within(c.closedAt));
  const noOpp = allCsqls.filter((c) => c.status === "CLOSED_NO_OPP" && within(c.closedAt));
  const accepted = triaged.filter((t) => t.status === "ACCEPTED");
  const dismissed = triaged.filter((t) => t.status === "DISMISSED");

  const types = [...new Set([...raised.map((r) => r.type), ...csqlTypes.map((t) => t.type)])] as RuleType[];
  const byType = types.map((type) => ({
    type,
    raised: raised.filter((r) => r.type === type).length,
    accepted: accepted.filter((r) => r.type === type).length,
    dismissed: dismissed.filter((r) => r.type === type).length,
    opportunities: opps.filter((c) => typesOf(c.id).includes(type)).length,
    pipelineMinor: opps.filter((c) => typesOf(c.id).includes(type)).reduce((n, c) => n + oppAmount(c), 0),
    won: won.filter((c) => typesOf(c.id).includes(type)).length,
    wonMinor: won.filter((c) => typesOf(c.id).includes(type)).reduce((n, c) => n + (c.outcomeAmountMinor ?? 0), 0),
  }));

  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "Unassigned";
  const group = (key: (c: (typeof allCsqls)[number]) => string | null) => {
    const m = new Map<string, { id: string | null; name: string; routed: number; opportunities: number; pipelineMinor: number; won: number; wonMinor: number }>();
    const row = (id: string | null) => {
      const k = id ?? "none";
      if (!m.has(k)) m.set(k, { id, name: name(id), routed: 0, opportunities: 0, pipelineMinor: 0, won: 0, wonMinor: 0 });
      return m.get(k)!;
    };
    for (const c of routed) row(key(c)).routed++;
    for (const c of opps) {
      row(key(c)).opportunities++;
      row(key(c)).pipelineMinor += oppAmount(c);
    }
    for (const c of won) {
      row(key(c)).won++;
      row(key(c)).wonMinor += c.outcomeAmountMinor ?? 0;
    }
    return [...m.values()].sort((a, b) => b.wonMinor - a.wonMinor || b.pipelineMinor - a.pipelineMinor);
  };

  const reasons = new Map<string, number>();
  for (const d of dismissed) reasons.set(d.reason ?? "No reason", (reasons.get(d.reason ?? "No reason") ?? 0) + 1);

  const triageHours = triaged.filter((t) => t.triagedAt).map((t) => (t.triagedAt!.getTime() - t.detectedAt.getTime()) / 3_600_000);
  const sellerHours = allCsqls.filter((c) => c.acceptedAt && within(c.acceptedAt)).map((c) => (c.acceptedAt!.getTime() - c.createdAt.getTime()) / 3_600_000);
  const triageOnTime = triaged.filter((t) => t.triagedAt && t.triagedAt <= t.triageDueAt).length;

  return {
    label,
    period,
    currency: ctx.actor.currency,
    funnel: {
      raised: raised.length,
      estimatedMinor: raised.reduce((n, r) => n + (r.value ?? 0), 0),
      accepted: accepted.length,
      dismissed: dismissed.length,
      routed: routed.length,
      opportunities: opps.length,
      pipelineMinor: opps.reduce((n, c) => n + oppAmount(c), 0),
      won: won.length,
      wonMinor: won.reduce((n, c) => n + (c.outcomeAmountMinor ?? 0), 0),
      lost: lost.length,
      noOpp: noOpp.length,
    },
    byType: byType.sort((a, b) => b.wonMinor - a.wonMinor || b.pipelineMinor - a.pipelineMinor || b.raised - a.raised),
    byCsm: group((c) => c.sourcedBy),
    bySeller: group((c) => c.ownerId),
    dismissReasons: [...reasons.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    lostReasons: lost.map((c) => c.outcomeReason ?? "No reason"),
    responsiveness: {
      medianTriageHours: median(triageHours),
      medianSellerHours: median(sellerHours),
      triageOnTimePct: triaged.length ? Math.round((triageOnTime / triaged.length) * 100) : null,
    },
  };
}
