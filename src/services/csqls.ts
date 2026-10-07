import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, activityLog, contacts, csqls, sellerQueues, signals, users } from "@/db/schema";
import { combineEstimates, type Estimate } from "@/core/value";
import { routeCsql } from "@/core/routing";
import { addBusinessDays } from "@/core/business-time";
import { allowedCsqlActions, CLOSED_CSQL, nextCsqlStatus, type CsqlAction, type CsqlStatus } from "@/core/workflow";
import { formatMoney, parseMoney } from "@/core/money";
import { canWorkCsql, can, SEES_ALL } from "@/auth/policy";
import { audit, type DbLike, type ServiceCtx, type Tx } from "./context";
import { conflict, forbidden, invalidState, notFound, parseInput, validation } from "./errors";
import { calendarOf } from "./org";
import { notify } from "./notifications";
import { enqueueWebhook } from "./webhooks";

// CSQLs: an accepted signal (or several) handed to a seller with a note and a deadline
// (spec FR-13–FR-20). Every move goes through the state machine in core/workflow.

export type CsqlRow = typeof csqls.$inferSelect;
export type Opportunity = { amountMinor: number; kind: string; crmRef: string | null; expectedClose: string | null; recordedAt: string };

const term = (ctx: ServiceCtx) => ctx.actor.config.terminology.csql;
const label = (ctx: ServiceCtx, n: number) => `${term(ctx)}-${String(n).padStart(4, "0")}`;
export const csqlLabel = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, "0")}`;

async function nextNumber(tx: Tx, orgId: string) {
  // Serialise numbering per org inside the transaction.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
  const [r] = await tx.select({ n: sql<number>`coalesce(max(${csqls.number}), 0)::int` }).from(csqls).where(eq(csqls.orgId, orgId));
  return r.n + 1;
}

async function salesLead(db: DbLike, orgId: string) {
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, orgId), eq(users.role, "SALES_LEAD"), eq(users.status, "ACTIVE"))).limit(1);
  return u ?? null;
}

async function route(tx: Tx, ctx: ServiceCtx, account: typeof accounts.$inferSelect) {
  const owner = account.ownerId ? (await tx.select({ id: users.id, name: users.name, status: users.status }).from(users).where(eq(users.id, account.ownerId)))[0] : undefined;
  const queues = await tx.select().from(sellerQueues).where(eq(sellerQueues.orgId, ctx.actor.orgId));
  const memberIds = [...new Set(queues.flatMap((q) => q.memberIds))];
  const members = memberIds.length ? await tx.select({ id: users.id, name: users.name, status: users.status }).from(users).where(inArray(users.id, memberIds)) : [];
  const res = routeCsql({
    owner: owner ? { id: owner.id, name: owner.name, active: owner.status === "ACTIVE" } : null,
    segment: account.segment,
    queues: queues.map((q) => ({
      id: q.id,
      segment: q.segment,
      name: q.name,
      cursor: q.cursor,
      members: q.memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean).map((m) => ({ id: m!.id, name: m!.name, active: m!.status === "ACTIVE" })),
    })),
    salesLead: await salesLead(tx, ctx.actor.orgId),
  });
  if (!res.ok) throw invalidState(res.reason);
  if (res.queueId !== undefined && res.nextCursor !== undefined) await tx.update(sellerQueues).set({ cursor: res.nextCursor }).where(eq(sellerQueues.id, res.queueId));
  return res;
}

function sellerDue(ctx: ServiceCtx) {
  return addBusinessDays(ctx.now(), ctx.actor.config.deadlines.sellerBusinessDays, calendarOf(ctx));
}

function payload(c: CsqlRow, account: { name: string; crmId: string | null }, prefix: string) {
  return {
    csql: c.number,
    label: csqlLabel(prefix, c.number),
    status: c.status,
    account: { name: account.name, crmId: account.crmId },
    ownerId: c.ownerId,
    sourcedBy: c.sourcedBy,
    estimatedValueMinor: c.adjustedValueMinor ?? c.estValueMinor,
    opportunity: c.opportunity,
    outcomeAmountMinor: c.outcomeAmountMinor,
  };
}

/** Creates a CSQL from accepted signals and routes it (spec A4). Runs inside the caller's transaction. */
export async function createCsqlFromSignals(
  tx: Tx,
  ctx: ServiceCtx,
  account: typeof accounts.$inferSelect,
  accepted: Array<typeof signals.$inferSelect>,
  input: { handoffNote: string; contactId: string | null; adjustedValueMinor: number | null },
) {
  const routed = await route(tx, ctx, account);
  const number = await nextNumber(tx, ctx.actor.orgId);
  const est = combineEstimates(accepted.map((s) => ({ kind: s.valueKind as Estimate["kind"], valueMinor: s.estValueMinor })));
  const [c] = await tx
    .insert(csqls)
    .values({
      orgId: ctx.actor.orgId,
      number,
      accountId: account.id,
      sourcedBy: ctx.actor.userId,
      ownerId: routed.sellerId,
      routedReason: routed.reason,
      status: "ROUTED",
      handoffNote: input.handoffNote,
      contactId: input.contactId,
      estValueMinor: est,
      adjustedValueMinor: input.adjustedValueMinor,
      clockStartedAt: ctx.now(),
      dueAt: sellerDue(ctx),
      createdAt: ctx.now(),
    })
    .returning();
  await audit(tx, ctx, { entityType: "csql", entityId: c.id, accountId: account.id, action: "routed", summary: `Created ${label(ctx, number)} and routed it: ${routed.reason}` });
  await notify(tx, ctx, {
    userId: routed.sellerId,
    kind: "routed",
    title: `New ${term(ctx)} for you: ${account.name}`,
    body: `${ctx.actor.name}: ${input.handoffNote}`,
    link: `/csqls/${c.id}`,
    dedupeKey: `routed:${c.id}:${routed.sellerId}`,
  });
  await enqueueWebhook(tx, ctx, "csql.routed", payload(c, account, term(ctx)));
  return c;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type CsqlFilters = { status?: CsqlStatus[]; ownerId?: string; sourcedBy?: string; mine?: boolean; accountId?: string };

export async function listCsqls(ctx: ServiceCtx, f: CsqlFilters = {}) {
  const scope = SEES_ALL.includes(ctx.actor.role)
    ? undefined
    : ctx.actor.role === "SELLER"
      ? eq(csqls.ownerId, ctx.actor.userId)
      : or(eq(csqls.sourcedBy, ctx.actor.userId), eq(accounts.csmId, ctx.actor.userId));
  const owner = sql<string | null>`(select name from users u where u.id = ${csqls.ownerId})`;
  const sourcer = sql<string>`(select name from users u where u.id = ${csqls.sourcedBy})`;
  return ctx.db
    .select({ csql: csqls, account: { id: accounts.id, name: accounts.name, segment: accounts.segment }, ownerName: owner, sourcedByName: sourcer })
    .from(csqls)
    .innerJoin(accounts, eq(accounts.id, csqls.accountId))
    .where(
      and(
        eq(csqls.orgId, ctx.actor.orgId),
        scope,
        f.status?.length ? inArray(csqls.status, f.status) : undefined,
        f.ownerId ? eq(csqls.ownerId, f.ownerId) : undefined,
        f.sourcedBy ? eq(csqls.sourcedBy, f.sourcedBy) : undefined,
        f.accountId ? eq(csqls.accountId, f.accountId) : undefined,
        f.mine ? (ctx.actor.role === "CSM" || ctx.actor.role === "CS_LEAD" ? eq(csqls.sourcedBy, ctx.actor.userId) : eq(csqls.ownerId, ctx.actor.userId)) : undefined,
      ),
    )
    .orderBy(desc(csqls.createdAt));
}

export async function getCsql(ctx: ServiceCtx, id: string) {
  const [row] = await ctx.db.select({ csql: csqls, account: accounts }).from(csqls).innerJoin(accounts, eq(accounts.id, csqls.accountId)).where(and(eq(csqls.id, id), eq(csqls.orgId, ctx.actor.orgId)));
  if (!row) throw notFound(term(ctx));
  const { csql: c, account } = row;
  const visible = SEES_ALL.includes(ctx.actor.role) || c.ownerId === ctx.actor.userId || c.sourcedBy === ctx.actor.userId || account.csmId === ctx.actor.userId;
  if (!visible) throw notFound(term(ctx));
  const [evidence, people, contact, history] = await Promise.all([
    ctx.db.select().from(signals).where(eq(signals.csqlId, c.id)).orderBy(signals.detectedAt),
    ctx.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [c.ownerId, c.sourcedBy, account.csmId].filter(Boolean) as string[])),
    c.contactId ? ctx.db.select().from(contacts).where(eq(contacts.id, c.contactId)) : Promise.resolve([]),
    ctx.db.select().from(activityLog).where(and(eq(activityLog.entityType, "csql"), eq(activityLog.entityId, c.id))).orderBy(desc(activityLog.at)),
  ]);
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  const actions = allowedCsqlActions(c.status).filter((a) => canDo(ctx, c, a));
  return { csql: c, account, evidence, history, owner: name(c.ownerId), sourcedBy: name(c.sourcedBy), contact: contact[0] ?? null, actions, label: label(ctx, c.number) };
}

/** Who may take which action: sellers work their own; the sourcing CSM handles a return. */
function canDo(ctx: ServiceCtx, c: CsqlRow, action: CsqlAction): boolean {
  if (action === "REASSIGN") return can(ctx.actor, "csql.reassign");
  if (action === "REROUTE" || (action === "CLOSE_NO_OPP" && c.status === "RETURNED")) {
    return c.sourcedBy === ctx.actor.userId || ["ADMIN", "CS_LEAD"].includes(ctx.actor.role);
  }
  return canWorkCsql(ctx.actor, c);
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

async function move(
  ctx: ServiceCtx,
  id: string,
  action: CsqlAction,
  lockVersion: number,
  apply: (tx: Tx, c: CsqlRow, account: typeof accounts.$inferSelect) => Promise<{ set: Partial<typeof csqls.$inferInsert>; summary: string; after?: (c: CsqlRow) => Promise<void> }>,
) {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx.select({ csql: csqls, account: accounts }).from(csqls).innerJoin(accounts, eq(accounts.id, csqls.accountId)).where(and(eq(csqls.id, id), eq(csqls.orgId, ctx.actor.orgId))).for("update");
    if (!row) throw notFound(term(ctx));
    const { csql: c, account } = row;
    if (!canDo(ctx, c, action)) throw forbidden(action === "REASSIGN" ? "Only a sales leader or admin can reassign." : `This ${term(ctx)} isn't yours to work on.`);
    if (c.lockVersion !== lockVersion) {
      const [who] = await tx.select({ name: users.name }).from(users).where(eq(users.id, c.ownerId ?? c.sourcedBy));
      throw conflict(`This ${term(ctx)} changed since you opened it (now ${c.status.toLowerCase().replace("_", " ")}${who ? `, ${who.name}` : ""}). Refresh to see the latest.`);
    }
    const to = nextCsqlStatus(c.status, action);
    if (!to) throw invalidState(`You can't do that while it's ${c.status.toLowerCase().replace(/_/g, " ")}.`);
    const { set, summary, after } = await apply(tx, c, account);
    const [updated] = await tx
      .update(csqls)
      .set({ ...set, status: to, lockVersion: c.lockVersion + 1, updatedAt: ctx.now() })
      .where(eq(csqls.id, id))
      .returning();
    await audit(tx, ctx, { entityType: "csql", entityId: id, accountId: account.id, action: action.toLowerCase(), summary });
    if (after) await after(updated);
    return updated;
  });
}

const reasonInput = z.object({ reason: z.string().trim().min(1, "Choose a reason"), note: z.string().trim().max(2000).optional().default("") });

export async function acceptCsql(ctx: ServiceCtx, id: string, lockVersion: number) {
  return move(ctx, id, "ACCEPT", lockVersion, async (tx, c, account) => ({
    set: { acceptedAt: ctx.now(), dueAt: null, clockStartedAt: null },
    summary: `${ctx.actor.name} accepted it`,
    after: async (u) => {
      await notify(tx, ctx, { userId: c.sourcedBy, kind: "routed", title: `${ctx.actor.name} accepted ${label(ctx, c.number)}: ${account.name}`, link: `/csqls/${id}`, dedupeKey: `accepted:${id}`, email: false });
      await enqueueWebhook(tx, ctx, "csql.accepted", payload(u, account, term(ctx)));
    },
  }));
}

export async function returnCsql(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(reasonInput, raw);
  return move(ctx, id, "RETURN", lockVersion, async (tx, c, account) => ({
    set: { returnReason: [input.reason, input.note].filter(Boolean).join(": "), clockStartedAt: ctx.now(), dueAt: addBusinessDays(ctx.now(), ctx.actor.config.deadlines.triageBusinessDays, calendarOf(ctx)) },
    summary: `Returned to ${term(ctx) === "CSQL" ? "the CSM" : "customer success"}: ${input.reason}${input.note ? ` (${input.note})` : ""}`,
    after: async () => {
      await notify(tx, ctx, {
        userId: c.sourcedBy,
        kind: "returned",
        title: `${ctx.actor.name} returned ${label(ctx, c.number)}: ${account.name}`,
        body: `${input.reason}${input.note ? `: ${input.note}` : ""}`,
        link: `/csqls/${id}`,
        dedupeKey: `returned:${id}:${c.lockVersion}`,
      });
    },
  }));
}

const rerouteInput = z.object({ sellerId: z.uuid().optional(), note: z.string().trim().max(2000).optional().default("") });

/** After a return, the CSM re-routes (optionally to a named seller) with an updated note. */
export async function rerouteCsql(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(rerouteInput, raw);
  return move(ctx, id, "REROUTE", lockVersion, async (tx, c, account) => {
    let sellerId: string;
    let reason: string;
    if (input.sellerId) {
      const [s] = await tx.select().from(users).where(and(eq(users.id, input.sellerId), eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")));
      if (!s || !["SELLER", "SALES_LEAD"].includes(s.role)) throw validation("Choose an active seller.", { sellerId: "Choose an active seller" });
      sellerId = s.id;
      reason = `Re-routed by ${ctx.actor.name} to ${s.name}`;
    } else {
      const r = await route(tx, ctx, account);
      sellerId = r.sellerId;
      reason = `Re-routed: ${r.reason}`;
    }
    return {
      set: {
        ownerId: sellerId,
        routedReason: reason,
        returnReason: null,
        handoffNote: input.note ? `${c.handoffNote}\n\nUpdate from ${ctx.actor.name}: ${input.note}` : c.handoffNote,
        clockStartedAt: ctx.now(),
        dueAt: sellerDue(ctx),
      },
      summary: reason,
      after: async (u) => {
        await notify(tx, ctx, { userId: sellerId, kind: "routed", title: `${label(ctx, c.number)} routed to you: ${account.name}`, body: input.note || c.handoffNote, link: `/csqls/${id}`, dedupeKey: `routed:${id}:${sellerId}:${u.lockVersion}` });
        await enqueueWebhook(tx, ctx, "csql.routed", payload(u, account, term(ctx)));
      },
    };
  });
}

const reassignInput = z.object({ sellerId: z.uuid("Choose a seller"), reason: z.string().trim().min(1, "Say why it's being reassigned").max(500) });

export async function reassignCsql(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(reassignInput, raw);
  return move(ctx, id, "REASSIGN", lockVersion, async (tx, c, account) => {
    const [s] = await tx.select().from(users).where(and(eq(users.id, input.sellerId), eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")));
    if (!s || !["SELLER", "SALES_LEAD"].includes(s.role)) throw validation("Choose an active seller.", { sellerId: "Choose an active seller" });
    const restart = c.status === "ROUTED";
    return {
      set: { ownerId: s.id, routedReason: `Reassigned by ${ctx.actor.name}: ${input.reason}`, ...(restart ? { clockStartedAt: ctx.now(), dueAt: sellerDue(ctx) } : {}) },
      summary: `Reassigned to ${s.name}: ${input.reason}`,
      after: async () => {
        await notify(tx, ctx, { userId: s.id, kind: "reassigned", title: `${label(ctx, c.number)} reassigned to you: ${account.name}`, body: input.reason, link: `/csqls/${id}`, dedupeKey: `reassigned:${id}:${s.id}:${c.lockVersion}` });
      },
    };
  });
}

const oppInput = z.object({
  amount: z.string().trim().min(1, "Enter the opportunity amount"),
  kind: z.enum(["SEATS", "USAGE_TIER", "ADDON", "MULTI"]),
  crmRef: z.string().trim().max(300).optional().default(""),
  expectedClose: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date").optional().or(z.literal("")),
});

export async function recordOpportunity(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(oppInput, raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor === null || amountMinor <= 0) throw validation("Enter the amount as a number, like 18,000.", { amount: "Enter a positive amount, like 18,000" });
  return move(ctx, id, "RECORD_OPPORTUNITY", lockVersion, async (tx, c, account) => {
    const first = !c.opportunity;
    const opp: Opportunity = { amountMinor, kind: input.kind, crmRef: input.crmRef || null, expectedClose: input.expectedClose || null, recordedAt: first ? ctx.now().toISOString() : (c.opportunity as Opportunity).recordedAt };
    return {
      set: { opportunity: opp },
      summary: `${first ? "Opportunity recorded" : "Opportunity updated"}: ${formatMoney(amountMinor, ctx.actor.currency)} ARR${opp.crmRef ? ` (${opp.crmRef})` : ""}`,
      after: async (u) => {
        if (first) await enqueueWebhook(tx, ctx, "csql.opportunity_created", payload(u, account, term(ctx)));
      },
    };
  });
}

const wonInput = z.object({ amount: z.string().trim().min(1, "Enter the closed amount") });

export async function winCsql(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(wonInput, raw);
  const amountMinor = parseMoney(input.amount);
  if (amountMinor === null || amountMinor <= 0) throw validation("Enter the closed ARR as a number.", { amount: "Enter a positive amount" });
  return move(ctx, id, "WIN", lockVersion, async (tx, c, account) => ({
    set: { outcomeAmountMinor: amountMinor, closedAt: ctx.now(), outcomeReason: null },
    summary: `Won: ${formatMoney(amountMinor, ctx.actor.currency)} ARR`,
    after: async (u) => {
      await notify(tx, ctx, { userId: c.sourcedBy, kind: "won", title: `Won: ${account.name}, ${formatMoney(amountMinor, ctx.actor.currency)} ARR from your ${term(ctx)}`, link: `/csqls/${id}`, dedupeKey: `won:${id}` });
      await enqueueWebhook(tx, ctx, "csql.closed", payload(u, account, term(ctx)));
    },
  }));
}

export async function loseCsql(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(reasonInput, raw);
  return move(ctx, id, "LOSE", lockVersion, async (tx, c, account) => ({
    set: { outcomeReason: [input.reason, input.note].filter(Boolean).join(": "), closedAt: ctx.now() },
    summary: `Lost: ${input.reason}`,
    after: async (u) => {
      await notify(tx, ctx, { userId: c.sourcedBy, kind: "won", title: `Lost: ${account.name} (${label(ctx, c.number)})`, body: input.reason, link: `/csqls/${id}`, dedupeKey: `lost:${id}`, email: false });
      await enqueueWebhook(tx, ctx, "csql.closed", payload(u, account, term(ctx)));
    },
  }));
}

export async function closeNoOpp(ctx: ServiceCtx, id: string, lockVersion: number, raw: unknown) {
  const input = parseInput(reasonInput, raw);
  return move(ctx, id, "CLOSE_NO_OPP", lockVersion, async (tx, c, account) => ({
    set: { outcomeReason: [input.reason, input.note].filter(Boolean).join(": "), closedAt: ctx.now(), dueAt: null },
    summary: `Closed with no opportunity: ${input.reason}`,
    after: async (u) => {
      if (c.sourcedBy !== ctx.actor.userId) {
        await notify(tx, ctx, { userId: c.sourcedBy, kind: "returned", title: `No opportunity: ${account.name} (${label(ctx, c.number)})`, body: input.reason, link: `/csqls/${id}`, dedupeKey: `noopp:${id}`, email: false });
      }
      await enqueueWebhook(tx, ctx, "csql.closed", payload(u, account, term(ctx)));
    },
  }));
}

export const isClosed = (s: CsqlStatus) => CLOSED_CSQL.includes(s);

/** Active sellers for reassign/reroute pickers. */
export async function listSellers(ctx: ServiceCtx) {
  return ctx.db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE"), inArray(users.role, ["SELLER", "SALES_LEAD"])))
    .orderBy(users.name);
}

// ---------------------------------------------------------------------------
// CRM inbound (spec FR-28): the vendor's CRM automation reports an amount or an outcome.
// It goes through the same state machine a person would, acting as the system.
// ---------------------------------------------------------------------------

const crmInput = z
  .object({
    csql: z.number().int().positive().optional(),
    crmRef: z.string().trim().min(1).optional(),
    amount: z.number().positive().optional(),
    outcome: z.enum(["WON", "LOST"]).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.csql !== undefined || v.crmRef, "Send csql (the number) or crmRef")
  .refine((v) => v.amount !== undefined || v.outcome, "Send an amount, an outcome, or both");

export async function applyCrmUpdate(ctx: ServiceCtx, raw: unknown) {
  const input = parseInput(crmInput, raw);
  const [c] = await ctx.db
    .select()
    .from(csqls)
    .where(and(eq(csqls.orgId, ctx.actor.orgId), input.csql !== undefined ? eq(csqls.number, input.csql) : sql`${csqls.opportunity}->>'crmRef' = ${input.crmRef!}`));
  if (!c) throw notFound(term(ctx));
  let current = c;
  const amount = input.amount !== undefined ? input.amount.toFixed(2) : undefined;
  if (current.status === "ROUTED") current = await acceptCsql(ctx, current.id, current.lockVersion);
  if (amount && (current.status === "ACCEPTED" || current.status === "OPPORTUNITY")) {
    const prev = current.opportunity as Opportunity | null;
    current = await recordOpportunity(ctx, current.id, current.lockVersion, { amount, kind: prev?.kind ?? "MULTI", crmRef: prev?.crmRef ?? input.crmRef ?? "", expectedClose: prev?.expectedClose ?? "" });
  }
  if (input.outcome === "WON") {
    if (current.status !== "OPPORTUNITY") throw invalidState("Record an opportunity amount before marking it won.");
    current = await winCsql(ctx, current.id, current.lockVersion, { amount: amount ?? ((current.opportunity as Opportunity).amountMinor / 100).toFixed(2) });
  }
  if (input.outcome === "LOST") {
    if (current.status !== "OPPORTUNITY") throw invalidState("Only an opportunity can be marked lost.");
    current = await loseCsql(ctx, current.id, current.lockVersion, { reason: input.reason || "Lost (reported by the CRM)" });
  }
  return { csql: current.number, status: current.status };
}
