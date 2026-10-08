import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, activityLog, contacts, csqls, importBatches, signalRules, signals, subscriptions, usageSnapshots, users } from "@/db/schema";
import { addDays, daysBetween } from "@/core/dates";
import { localDate } from "@/core/business-time";
import { parseMoney } from "@/core/money";
import { termElapsed } from "@/core/rules/evaluate";
import { canEditAccount, SEES_ALL } from "@/auth/policy";
import { assertCan, audit, type ServiceCtx } from "./context";
import { forbidden, notFound, parseInput, validation } from "./errors";

// Accounts: the customer list and the account page (spec §7), plus the CSV import RevOps uses
// to load accounts and subscriptions from a CRM or billing export (spec FR-1).

function scope(ctx: ServiceCtx) {
  if (SEES_ALL.includes(ctx.actor.role)) return undefined;
  if (ctx.actor.role === "SELLER") return eq(accounts.ownerId, ctx.actor.userId);
  return eq(accounts.csmId, ctx.actor.userId);
}

export type AccountFilters = { q?: string; csmId?: string; ownerId?: string; segment?: string; withSignals?: boolean; stale?: boolean };

export async function listAccounts(ctx: ServiceCtx, f: AccountFilters = {}) {
  const today = localDate(ctx.now(), ctx.actor.timezone);
  const rows = await ctx.db
    .select({
      account: accounts,
      sub: subscriptions,
      csmName: sql<string | null>`(select name from users u where u.id = ${accounts.csmId})`,
      ownerName: sql<string | null>`(select name from users u where u.id = ${accounts.ownerId})`,
    })
    .from(accounts)
    .leftJoin(subscriptions, eq(subscriptions.accountId, accounts.id))
    .where(
      and(
        eq(accounts.orgId, ctx.actor.orgId),
        scope(ctx),
        f.q ? or(ilike(accounts.name, `%${f.q.replace(/[%_]/g, "")}%`), ilike(accounts.domain, `%${f.q.replace(/[%_]/g, "")}%`)) : undefined,
        f.csmId ? eq(accounts.csmId, f.csmId) : undefined,
        f.ownerId ? eq(accounts.ownerId, f.ownerId) : undefined,
        f.segment ? eq(accounts.segment, f.segment) : undefined,
      ),
    )
    .orderBy(accounts.name);
  // Latest usage per account in one query.
  const ids = rows.map((r) => r.account.id);
  // One index lookup per account (usage_account_date_idx) instead of sorting every snapshot.
  const latest = ids.length
    ? (
        await ctx.db.execute<{ account_id: string; active_seats: number; credits_used_term: number; source: string; date: string }>(sql`
          select a.id as account_id, u.active_seats, u.credits_used_term, u.source, u.date::text as date
          from accounts a
          cross join lateral (
            select active_seats, credits_used_term, source, date from usage_snapshots s
            where s.account_id = a.id order by s.date desc limit 1
          ) u
          where a.org_id = ${ctx.actor.orgId}`)
      ).map((r) => ({ accountId: r.account_id, activeSeats: r.active_seats, creditsUsedTerm: r.credits_used_term, source: r.source, date: r.date }))
    : [];
  // Open-signal counts in one grouped query (correlated subqueries cost ~1s at 2,000 accounts).
  const open = ids.length
    ? await ctx.db
        .select({ accountId: signals.accountId, n: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${signals.estValueMinor}), 0)::bigint` })
        .from(signals)
        .where(and(eq(signals.orgId, ctx.actor.orgId), inArray(signals.status, ["NEW", "SNOOZED"])))
        .groupBy(signals.accountId)
    : [];
  const openBy = new Map(open.map((o) => [o.accountId, o]));
  const byId = new Map(latest.map((l) => [l.accountId, l]));
  const out = rows.map((r) => {
    const l = byId.get(r.account.id);
    const o = openBy.get(r.account.id);
    const latestDate = l?.date ?? null;
    const pace =
      r.sub && l && r.sub.creditsCommitted > 0 ? Math.round((l.creditsUsedTerm / Math.max(termElapsed(r.sub.termStart, r.sub.termEnd, l.date), 0.0001) / r.sub.creditsCommitted) * 100) : null;
    return {
      ...r,
      openSignals: o?.n ?? 0,
      openSignalValue: Number(o?.value ?? 0),
      activeSeats: l?.activeSeats ?? null,
      usagePacePct: pace,
      source: l?.source ?? null,
      dataAgeDays: latestDate ? daysBetween(latestDate, today) : null,
      renewalInDays: r.sub ? daysBetween(today, r.sub.termEnd) : null,
    };
  });
  const staleAfter = ctx.actor.config.detection.staleAfterDays;
  return out.filter((r) => (f.withSignals ? r.openSignals > 0 : true) && (f.stale ? r.dataAgeDays === null || r.dataAgeDays > staleAfter : true));
}

export async function getAccount(ctx: ServiceCtx, id: string) {
  const [a] = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.actor.orgId)));
  if (!a) throw notFound("Account");
  const visible = SEES_ALL.includes(ctx.actor.role) || a.csmId === ctx.actor.userId || a.ownerId === ctx.actor.userId;
  if (!visible) throw notFound("Account");
  const today = localDate(ctx.now(), ctx.actor.timezone);
  const [sub, usage, people, sigs, opps, history, team, rules] = await Promise.all([
    ctx.db.select().from(subscriptions).where(eq(subscriptions.accountId, id)),
    ctx.db.select().from(usageSnapshots).where(and(eq(usageSnapshots.accountId, id), gte(usageSnapshots.date, addDays(today, -90)))).orderBy(usageSnapshots.date),
    ctx.db.select().from(contacts).where(eq(contacts.accountId, id)).orderBy(desc(contacts.firstSeenOn)),
    ctx.db.select().from(signals).where(eq(signals.accountId, id)).orderBy(desc(signals.detectedAt)).limit(50),
    ctx.db.select().from(csqls).where(eq(csqls.accountId, id)).orderBy(desc(csqls.createdAt)),
    ctx.db.select().from(activityLog).where(eq(activityLog.accountId, id)).orderBy(desc(activityLog.at)).limit(60),
    ctx.db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE"))),
    ctx.db.select({ type: signalRules.type, params: signalRules.params, enabled: signalRules.enabled }).from(signalRules).where(eq(signalRules.orgId, ctx.actor.orgId)),
  ]);
  const ruleParam = (type: string, key: string, fallback: number) => Number(((rules.find((r) => r.type === type && r.enabled)?.params ?? {}) as Record<string, unknown>)[key] ?? fallback);
  const latest = usage.at(-1) ?? null;
  return {
    account: a,
    subscription: sub[0] ?? null,
    usage,
    latest,
    dataAgeDays: latest ? daysBetween(latest.date, today) : null,
    contacts: people,
    signals: sigs,
    csqls: opps,
    history,
    people: team,
    csmName: team.find((t) => t.id === a.csmId)?.name ?? null,
    ownerName: team.find((t) => t.id === a.ownerId)?.name ?? null,
    canEdit: canEditAccount(ctx.actor, a),
    today,
    thresholds: { seatPct: ruleParam("SEAT_PRESSURE", "utilisationPct", 90), pacePct: ruleParam("USAGE_PACE", "projectedPct", 110), teamUsers: ruleParam("NEW_TEAM", "minActiveUsers", 5) },
  };
}

const teamInput = z.object({ csmId: z.uuid().nullable(), ownerId: z.uuid().nullable(), segment: z.string().nullable() });

export async function updateAccountTeam(ctx: ServiceCtx, id: string, raw: unknown) {
  const input = parseInput(teamInput, raw);
  const [a] = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, ctx.actor.orgId)));
  if (!a) throw notFound("Account");
  if (!canEditAccount(ctx.actor, a)) throw forbidden();
  // A CSM can't hand their own account to someone else; leaders and RevOps can.
  if (ctx.actor.role === "CSM" && input.csmId !== a.csmId) throw forbidden("Ask a CS leader to change the account's CSM.");
  const ids = [input.csmId, input.ownerId].filter(Boolean) as string[];
  const ppl = ids.length ? await ctx.db.select().from(users).where(and(inArray(users.id, ids), eq(users.orgId, ctx.actor.orgId))) : [];
  if (input.csmId && !ppl.some((p) => p.id === input.csmId && ["CSM", "CS_LEAD"].includes(p.role))) throw validation("Choose a CSM.", { csmId: "Choose a CSM or CS leader" });
  if (input.ownerId && !ppl.some((p) => p.id === input.ownerId && ["SELLER", "SALES_LEAD"].includes(p.role))) throw validation("Choose a seller.", { ownerId: "Choose an account manager" });
  if (input.segment && !ctx.actor.config.segments.some((s) => s.key === input.segment)) throw validation("Unknown segment.", { segment: "Choose a segment" });
  await ctx.db.update(accounts).set({ csmId: input.csmId, ownerId: input.ownerId, segment: input.segment }).where(eq(accounts.id, id));
  const name = (x: string | null) => ppl.find((p) => p.id === x)?.name ?? "nobody";
  await audit(ctx.db, ctx, { entityType: "account", entityId: id, accountId: id, action: "team_changed", summary: `Team: CSM ${name(input.csmId)}, owner ${name(input.ownerId)}, segment ${input.segment ?? "none"}` });
}

// ---------------------------------------------------------------------------
// CSV import (accounts + subscriptions)
// ---------------------------------------------------------------------------

export const IMPORT_COLUMNS = ["name", "domain", "crm_id", "segment", "csm_email", "owner_email", "plan", "seats", "credits", "term_start", "term_end", "arr", "addons"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const importRow = z.object({
  name: z.string().trim().min(1, "name is required"),
  domain: z.string().trim().toLowerCase().optional().default(""),
  crm_id: z.string().trim().optional().default(""),
  segment: z.string().trim().optional().default(""),
  csm_email: z.string().trim().toLowerCase().optional().default(""),
  owner_email: z.string().trim().toLowerCase().optional().default(""),
  plan: z.string().trim().min(1, "plan is required"),
  seats: z.coerce.number().int().min(0, "seats must be 0 or more"),
  credits: z.coerce.number().int().min(0).optional().default(0),
  term_start: isoDate,
  term_end: isoDate,
  arr: z.string().trim().min(1, "arr is required"),
  addons: z.string().trim().optional().default(""),
});

/** Upserts accounts and subscriptions by crm_id (or domain). Rows are validated independently. */
export async function importAccounts(ctx: ServiceCtx, filename: string, rows: Array<Record<string, string>>) {
  assertCan(ctx, "integrations.manage");
  if (rows.length > 5000) throw validation("Import at most 5,000 rows at a time.");
  const team = await ctx.db.select().from(users).where(eq(users.orgId, ctx.actor.orgId));
  const byEmail = new Map(team.map((u) => [u.email.toLowerCase(), u]));
  const segments = ctx.actor.config.segments.map((s) => s.key);
  const addonKeys = ctx.actor.config.priceBook.addons.map((a) => a.key);
  const errors: Array<{ row: number; reason: string }> = [];
  let created = 0;
  let updated = 0;

  await ctx.db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const lower = Object.fromEntries(Object.entries(rows[i]).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), v]));
      const r = importRow.safeParse(lower);
      const line = i + 2; // header is line 1
      if (!r.success) {
        errors.push({ row: line, reason: r.error.issues.map((x) => x.message).join("; ") });
        continue;
      }
      const d = r.data;
      if (!d.crm_id && !d.domain) {
        errors.push({ row: line, reason: "needs crm_id or domain to match usage data" });
        continue;
      }
      if (d.term_end <= d.term_start) {
        errors.push({ row: line, reason: "term_end must be after term_start" });
        continue;
      }
      const arrMinor = parseMoney(d.arr);
      if (arrMinor === null || arrMinor < 0) {
        errors.push({ row: line, reason: `arr "${d.arr}" isn't a number` });
        continue;
      }
      if (d.segment && !segments.includes(d.segment)) {
        errors.push({ row: line, reason: `unknown segment "${d.segment}" (use ${segments.join(", ")})` });
        continue;
      }
      const csm = d.csm_email ? byEmail.get(d.csm_email) : undefined;
      const owner = d.owner_email ? byEmail.get(d.owner_email) : undefined;
      if (d.csm_email && (!csm || !["CSM", "CS_LEAD"].includes(csm.role))) {
        errors.push({ row: line, reason: `no CSM with email ${d.csm_email}` });
        continue;
      }
      if (d.owner_email && (!owner || !["SELLER", "SALES_LEAD"].includes(owner.role))) {
        errors.push({ row: line, reason: `no account manager with email ${d.owner_email}` });
        continue;
      }
      const addons = d.addons ? d.addons.split(/[;|,]/).map((s) => s.trim()).filter(Boolean) : [];
      const badAddon = addons.find((a) => !addonKeys.includes(a));
      if (badAddon) {
        errors.push({ row: line, reason: `unknown add-on "${badAddon}" (use ${addonKeys.join(", ")})` });
        continue;
      }
      const [existing] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.orgId, ctx.actor.orgId), d.crm_id ? eq(accounts.crmId, d.crm_id) : eq(accounts.domain, d.domain)));
      const values = { name: d.name, domain: d.domain || null, crmId: d.crm_id || null, segment: d.segment || null, csmId: csm?.id ?? null, ownerId: owner?.id ?? null };
      let accountId: string;
      if (existing) {
        await tx.update(accounts).set(values).where(eq(accounts.id, existing.id));
        accountId = existing.id;
        updated++;
      } else {
        const [a] = await tx.insert(accounts).values({ orgId: ctx.actor.orgId, ...values }).returning();
        accountId = a.id;
        created++;
      }
      const sub = { plan: d.plan, seatsPurchased: d.seats, creditsCommitted: d.credits, termStart: d.term_start, termEnd: d.term_end, arrMinor, addons };
      await tx
        .insert(subscriptions)
        .values({ orgId: ctx.actor.orgId, accountId, ...sub })
        .onConflictDoUpdate({ target: subscriptions.accountId, set: sub });
    }
    await tx.insert(importBatches).values({ orgId: ctx.actor.orgId, kind: "accounts", filename, created, updated, rejected: errors.length, errors: errors.slice(0, 200), createdBy: ctx.actor.userId });
    await audit(tx, ctx, { entityType: "import", entityId: ctx.actor.orgId, action: "accounts_imported", summary: `Imported ${filename}: ${created} new, ${updated} updated, ${errors.length} rejected` });
  });
  return { created, updated, errors };
}

export async function recentImports(ctx: ServiceCtx) {
  return ctx.db.select().from(importBatches).where(eq(importBatches.orgId, ctx.actor.orgId)).orderBy(desc(importBatches.createdAt)).limit(10);
}
