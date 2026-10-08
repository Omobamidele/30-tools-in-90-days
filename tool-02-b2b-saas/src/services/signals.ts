import { and, asc, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, activityLog, contacts, csqls, signalRules, signals, subscriptions, usageSnapshots, users } from "@/db/schema";
import type { RuleType } from "@/config/schema";
import { nextSignalStatus, OPEN_CSQL, type SignalAction, type SignalStatus } from "@/core/workflow";
import { localDate } from "@/core/business-time";
import { daysBetween } from "@/core/dates";
import { parseMoney } from "@/core/money";
import { canTriage, can } from "@/auth/policy";
import { audit, type ServiceCtx, type Tx } from "./context";
import { conflict, forbidden, invalidState, notFound, parseInput, validation } from "./errors";
import { createCsqlFromSignals } from "./csqls";
import { notify } from "./notifications";

// The CSM's queue and triage (spec FR-12–FR-15). A signal is triaged by the account's CSM,
// or by whoever a CS leader assigned it to.

export type SignalFilters = {
  status?: SignalStatus[];
  type?: RuleType;
  /** "mine" = my book or assigned to me (default for CSMs); "all" for leaders. */
  who?: "mine" | "all" | string;
  overdue?: boolean;
  q?: string;
  accountId?: string;
  limit?: number;
};

const triager = sql<string | null>`coalesce(${signals.assigneeId}, ${accounts.csmId})`;

function scopeFor(ctx: ServiceCtx) {
  if (ctx.actor.role === "CSM") return or(eq(accounts.csmId, ctx.actor.userId), eq(signals.assigneeId, ctx.actor.userId));
  if (ctx.actor.role === "SELLER") return eq(accounts.ownerId, ctx.actor.userId);
  return undefined;
}

export async function listSignals(ctx: ServiceCtx, f: SignalFilters = {}) {
  const who =
    f.who === "mine"
      ? sql`${triager} = ${ctx.actor.userId}`
      : f.who && f.who !== "all"
        ? f.who === "unassigned"
          ? sql`${triager} is null`
          : sql`${triager} = ${f.who}`
        : undefined;
  return ctx.db
    .select({
      signal: signals,
      account: { id: accounts.id, name: accounts.name, segment: accounts.segment, csmId: accounts.csmId, ownerId: accounts.ownerId },
      triagerId: triager,
      triagerName: sql<string | null>`(select name from users u where u.id = coalesce(${signals.assigneeId}, ${accounts.csmId}))`,
      ownerName: sql<string | null>`(select name from users u where u.id = ${accounts.ownerId})`,
      ruleName: signalRules.name,
    })
    .from(signals)
    .innerJoin(accounts, eq(accounts.id, signals.accountId))
    .innerJoin(signalRules, eq(signalRules.id, signals.ruleId))
    .where(
      and(
        eq(signals.orgId, ctx.actor.orgId),
        scopeFor(ctx),
        f.status?.length ? inArray(signals.status, f.status) : undefined,
        f.type ? eq(signals.type, f.type) : undefined,
        who,
        f.overdue ? lt(signals.triageDueAt, ctx.now()) : undefined,
        f.q ? ilike(accounts.name, `%${f.q.replace(/[%_]/g, "")}%`) : undefined,
        f.accountId ? eq(signals.accountId, f.accountId) : undefined,
      ),
    )
    .orderBy(desc(signals.priority), asc(signals.triageDueAt))
    .limit(f.limit ?? 500);
}

/** Signals waiting for this person's triage (the sidebar badge). Leaders see everything open. */
export async function countWaiting(ctx: ServiceCtx) {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(signals)
    .innerJoin(accounts, eq(accounts.id, signals.accountId))
    .where(
      and(
        eq(signals.orgId, ctx.actor.orgId),
        eq(signals.status, "NEW"),
        ctx.actor.role === "CSM" ? sql`${triager} = ${ctx.actor.userId}` : ctx.actor.role === "SELLER" ? sql`false` : undefined,
      ),
    );
  return r.n;
}

export async function getSignal(ctx: ServiceCtx, id: string) {
  const [row] = await ctx.db
    .select({ signal: signals, account: accounts, rule: signalRules })
    .from(signals)
    .innerJoin(accounts, eq(accounts.id, signals.accountId))
    .innerJoin(signalRules, eq(signalRules.id, signals.ruleId))
    .where(and(eq(signals.id, id), eq(signals.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Signal");
  const { signal, account, rule } = row;
  if (ctx.actor.role === "CSM" && account.csmId !== ctx.actor.userId && signal.assigneeId !== ctx.actor.userId) throw notFound("Signal");
  if (ctx.actor.role === "SELLER" && account.ownerId !== ctx.actor.userId) throw notFound("Signal");
  const [sub, people, others, openCsql, latest, history, team] = await Promise.all([
    ctx.db.select().from(subscriptions).where(eq(subscriptions.accountId, account.id)),
    ctx.db.select().from(contacts).where(eq(contacts.accountId, account.id)).orderBy(contacts.name),
    ctx.db.select().from(signals).where(and(eq(signals.accountId, account.id), inArray(signals.status, ["NEW", "SNOOZED"]), sql`${signals.id} <> ${id}`)),
    ctx.db.select().from(csqls).where(and(eq(csqls.accountId, account.id), inArray(csqls.status, OPEN_CSQL))).limit(1),
    ctx.db.select().from(usageSnapshots).where(eq(usageSnapshots.accountId, account.id)).orderBy(desc(usageSnapshots.date)).limit(1),
    ctx.db.select().from(activityLog).where(and(eq(activityLog.entityType, "signal"), eq(activityLog.entityId, id))).orderBy(desc(activityLog.at)),
    ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [account.csmId, account.ownerId, signal.assigneeId, signal.triagedBy].filter(Boolean) as string[])),
  ]);
  const name = (uid: string | null) => team.find((t) => t.id === uid)?.name ?? null;
  const today = localDate(ctx.now(), ctx.actor.timezone);
  return {
    signal,
    account,
    rule,
    subscription: sub[0] ?? null,
    contacts: people,
    otherOpen: others,
    openCsql: openCsql[0] ?? null,
    latestUsage: latest[0] ?? null,
    dataAgeDays: latest[0] ? daysBetween(latest[0].date, today) : null,
    history,
    csmName: name(account.csmId),
    ownerName: name(account.ownerId),
    assigneeName: name(signal.assigneeId),
    triagedByName: name(signal.triagedBy),
    canTriage: canTriage(ctx.actor, { csmId: signal.assigneeId ?? account.csmId }) || (ctx.actor.role === "CSM" && signal.assigneeId === ctx.actor.userId),
    canReassign: can(ctx.actor, "signal.reassign"),
  };
}

function assertTriage(ctx: ServiceCtx, s: typeof signals.$inferSelect, a: typeof accounts.$inferSelect) {
  const owner = s.assigneeId ?? a.csmId;
  if (!canTriage(ctx.actor, { csmId: owner })) throw forbidden("Only the account's CSM, the person it's assigned to, or a CS leader can triage this signal.");
}

async function lockSignal(tx: Tx, ctx: ServiceCtx, id: string, lockVersion: number, action: SignalAction) {
  const [row] = await tx.select({ signal: signals, account: accounts }).from(signals).innerJoin(accounts, eq(accounts.id, signals.accountId)).where(and(eq(signals.id, id), eq(signals.orgId, ctx.actor.orgId))).for("update");
  if (!row) throw notFound("Signal");
  assertTriage(ctx, row.signal, row.account);
  if (row.signal.lockVersion !== lockVersion) {
    const [who] = row.signal.triagedBy ? await tx.select({ name: users.name }).from(users).where(eq(users.id, row.signal.triagedBy)) : [];
    const when = row.signal.triagedAt ? row.signal.triagedAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: ctx.actor.timezone }) : null;
    throw conflict(
      who && when ? `Already ${row.signal.status.toLowerCase()} by ${who.name} at ${when}. Refresh to see it.` : "This signal changed since you opened it. Refresh to see the latest.",
    );
  }
  const to = nextSignalStatus(row.signal.status, action);
  if (!to) throw invalidState(`This signal is already ${row.signal.status.toLowerCase()}.`);
  return { ...row, to };
}

const acceptInput = z.object({
  handoffNote: z.string().trim().min(10, "Write a short handoff note for the seller (at least 10 characters)").max(4000),
  contactId: z.uuid().optional().or(z.literal("")),
  adjustedValue: z.string().trim().optional().default(""),
  /** Other open signals on the same account to include. */
  alsoSignalIds: z.array(z.uuid()).optional().default([]),
  /** "existing" adds to the account's open CSQL (default when one exists); "new" needs a reason. */
  mode: z.enum(["new", "existing"]).optional(),
  separateReason: z.string().trim().max(500).optional().default(""),
});

export async function acceptSignal(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(acceptInput, raw);
  const adjustedValueMinor = input.adjustedValue ? parseMoney(input.adjustedValue) : null;
  if (input.adjustedValue && (adjustedValueMinor === null || adjustedValueMinor < 0)) throw validation("Enter the value as a number, like 7,200.", { adjustedValue: "Enter a number, like 7,200" });

  return ctx.db.transaction(async (tx) => {
    const { signal, account } = await lockSignal(tx, ctx, id, lockVersion, "ACCEPT");
    if (input.contactId) {
      const [c] = await tx.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, input.contactId), eq(contacts.accountId, account.id)));
      if (!c) throw validation("Choose a contact from this account.", { contactId: "Choose a contact from this account" });
    }
    const extra = input.alsoSignalIds.length
      ? await tx.select().from(signals).where(and(inArray(signals.id, input.alsoSignalIds), eq(signals.accountId, account.id), inArray(signals.status, ["NEW", "SNOOZED"])))
      : [];
    const all = [signal, ...extra.filter((s) => s.id !== signal.id)];
    const [openCsql] = await tx.select().from(csqls).where(and(eq(csqls.accountId, account.id), inArray(csqls.status, OPEN_CSQL))).limit(1);
    const mode = input.mode ?? (openCsql ? "existing" : "new");
    if (openCsql && mode === "new" && !input.separateReason) {
      throw validation(`This account already has an open CSQL. Add to it, or say why a separate one is needed.`, { separateReason: "Say why a separate CSQL is needed" });
    }

    let csqlId: string;
    let csqlNumber: number;
    if (openCsql && mode === "existing") {
      csqlId = openCsql.id;
      csqlNumber = openCsql.number;
      await tx.update(csqls).set({ handoffNote: `${openCsql.handoffNote}\n\nAdded by ${ctx.actor.name}: ${input.handoffNote}`, lockVersion: openCsql.lockVersion + 1 }).where(eq(csqls.id, openCsql.id));
      await audit(tx, ctx, { entityType: "csql", entityId: openCsql.id, accountId: account.id, action: "evidence_added", summary: `${ctx.actor.name} added ${all.length} signal${all.length === 1 ? "" : "s"}: ${signal.explanation}` });
      if (openCsql.ownerId) await notify(tx, ctx, { userId: openCsql.ownerId, kind: "routed", title: `More evidence on ${account.name}`, body: input.handoffNote, link: `/csqls/${openCsql.id}`, dedupeKey: `added:${openCsql.id}:${signal.id}` });
    } else {
      const c = await createCsqlFromSignals(tx, ctx, account, all, {
        handoffNote: input.separateReason ? `${input.handoffNote}\n\n(Separate from the open CSQL because: ${input.separateReason})` : input.handoffNote,
        contactId: input.contactId || null,
        adjustedValueMinor,
      });
      csqlId = c.id;
      csqlNumber = c.number;
    }
    for (const s of all) {
      await tx.update(signals).set({ status: "ACCEPTED", csqlId, triagedBy: ctx.actor.userId, triagedAt: ctx.now(), lockVersion: s.lockVersion + 1 }).where(eq(signals.id, s.id));
      await audit(tx, ctx, { entityType: "signal", entityId: s.id, accountId: account.id, action: "accepted", summary: `Accepted into ${ctx.actor.config.terminology.csql}-${String(csqlNumber).padStart(4, "0")}` });
    }
    return { csqlId, csqlNumber };
  });
}

const dismissInput = z.object({ reason: z.string().trim().min(1, "Choose a reason"), note: z.string().trim().max(2000).optional().default("") });

export async function dismissSignal(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(dismissInput, raw);
  const reasons = ctx.actor.config.dismissReasons;
  if (input.reason !== "Other" && !reasons.includes(input.reason)) throw validation("Choose a reason from the list.", { reason: "Choose a reason from the list" });
  if (input.reason === "Other" && !input.note) throw validation("Say why, when the reason is Other.", { note: "Say why" });
  return ctx.db.transaction(async (tx) => {
    const { signal, account, to } = await lockSignal(tx, ctx, id, lockVersion, "DISMISS");
    await tx.update(signals).set({ status: to, dismissReason: input.reason, dismissNote: input.note || null, triagedBy: ctx.actor.userId, triagedAt: ctx.now(), lockVersion: signal.lockVersion + 1 }).where(eq(signals.id, id));
    await audit(tx, ctx, { entityType: "signal", entityId: id, accountId: account.id, action: "dismissed", summary: `Dismissed: ${input.reason}${input.note ? ` (${input.note})` : ""}` });
  });
}

export async function bulkDismiss(ctx: ServiceCtx, items: Array<{ id: string; lockVersion: number }>, raw: unknown) {
  let done = 0;
  const failed: string[] = [];
  for (const it of items) {
    try {
      await dismissSignal(ctx, it.id, it.lockVersion, raw);
      done++;
    } catch {
      failed.push(it.id);
    }
  }
  return { done, failed };
}

const snoozeInput = z.object({ until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date") });

export async function snoozeSignal(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(snoozeInput, raw);
  const today = localDate(ctx.now(), ctx.actor.timezone);
  if (input.until <= today) throw validation("Choose a date after today.", { until: "Choose a date after today" });
  if (daysBetween(today, input.until) > 180) throw validation("Snooze for at most 180 days; dismiss it instead.", { until: "At most 180 days ahead" });
  return ctx.db.transaction(async (tx) => {
    const { signal, account, to } = await lockSignal(tx, ctx, id, lockVersion, "SNOOZE");
    await tx.update(signals).set({ status: to, snoozeUntil: input.until, lockVersion: signal.lockVersion + 1 }).where(eq(signals.id, id));
    await audit(tx, ctx, { entityType: "signal", entityId: id, accountId: account.id, action: "snoozed", summary: `Snoozed until ${input.until}` });
  });
}

const reassignInput = z.object({ assigneeId: z.uuid("Choose a person"), reason: z.string().trim().min(1, "Say why").max(500) });

export async function reassignSignal(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  if (!can(ctx.actor, "signal.reassign")) throw forbidden("Only a CS leader or admin can reassign signals.");
  const input = parseInput(reassignInput, raw);
  return ctx.db.transaction(async (tx) => {
    const [s] = await tx.select().from(signals).where(and(eq(signals.id, id), eq(signals.orgId, ctx.actor.orgId))).for("update");
    if (!s) throw notFound("Signal");
    if (s.lockVersion !== lockVersion) throw conflict("This signal changed since you opened it. Refresh to see the latest.");
    if (!["NEW", "SNOOZED"].includes(s.status)) throw invalidState("Only open signals can be reassigned.");
    const [u] = await tx.select().from(users).where(and(eq(users.id, input.assigneeId), eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")));
    if (!u || !["CSM", "CS_LEAD"].includes(u.role)) throw validation("Choose an active CSM or CS leader.", { assigneeId: "Choose an active CSM" });
    await tx.update(signals).set({ assigneeId: u.id, lockVersion: s.lockVersion + 1 }).where(eq(signals.id, id));
    await audit(tx, ctx, { entityType: "signal", entityId: id, accountId: s.accountId, action: "reassigned", summary: `Assigned to ${u.name}: ${input.reason}` });
    await notify(tx, ctx, { userId: u.id, kind: "reassigned", title: `Signal assigned to you`, body: `${s.explanation}. ${input.reason}`, link: `/signals/${id}`, dedupeKey: `sigassign:${id}:${u.id}:${s.lockVersion}` });
  });
}

/** Signal counts and estimated value by status, for the board header and the overview. */
export async function signalTotals(ctx: ServiceCtx, who: SignalFilters["who"]) {
  const rows = await listSignals(ctx, { who, limit: 5000 });
  const weekAgo = ctx.now().getTime() - 7 * 86_400_000;
  const out: Record<SignalStatus, { count: number; valueMinor: number }> = {
    NEW: { count: 0, valueMinor: 0 },
    SNOOZED: { count: 0, valueMinor: 0 },
    ACCEPTED: { count: 0, valueMinor: 0 },
    DISMISSED: { count: 0, valueMinor: 0 },
    EXPIRED: { count: 0, valueMinor: 0 },
  };
  for (const { signal: s } of rows) {
    const recent = s.status === "NEW" || s.status === "SNOOZED" || (s.triagedAt ?? s.lastEvaluatedAt).getTime() >= weekAgo;
    if (!recent) continue;
    out[s.status].count++;
    out[s.status].valueMinor += s.estValueMinor ?? 0;
  }
  return out;
}

