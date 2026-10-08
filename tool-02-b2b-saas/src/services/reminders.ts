import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { accounts, csqls, signals, users } from "@/db/schema";
import { deadlineState, type DeadlineState } from "@/core/business-time";
import type { ServiceCtx } from "./context";
import { calendarOf } from "./org";
import { notify } from "./notifications";

// Deadline reminders and escalation (spec §6.2, A3, A5). Idempotent: each (item, stage, due date)
// notifies once, so the hourly job can run as often as it likes.

export type ReminderSummary = { dueSoon: number; overdue: number; escalated: number };

export async function runReminders(ctx: ServiceCtx): Promise<ReminderSummary> {
  const { db } = ctx;
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const cfg = ctx.actor.config;
  const out: ReminderSummary = { dueSoon: 0, overdue: 0, escalated: 0 };
  const leadsOf = async (role: "CS_LEAD" | "SALES_LEAD") =>
    (await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.role, role), eq(users.status, "ACTIVE")))).map((u) => u.id);
  const [csLeads, salesLeads] = await Promise.all([leadsOf("CS_LEAD"), leadsOf("SALES_LEAD")]);

  const count = (state: DeadlineState) => {
    if (state === "DUE_SOON") out.dueSoon++;
    if (state === "OVERDUE") out.overdue++;
    if (state === "ESCALATE") out.escalated++;
  };

  // Signals waiting for triage. The clock started when the window began (detected or woke).
  const open = await db
    .select({ s: signals, account: { name: accounts.name, csmId: accounts.csmId } })
    .from(signals)
    .innerJoin(accounts, eq(accounts.id, signals.accountId))
    .where(and(eq(signals.orgId, ctx.actor.orgId), eq(signals.status, "NEW")));
  for (const { s, account } of open) {
    const started = new Date(s.triageDueAt.getTime() - cfg.deadlines.triageBusinessDays * 86_400_000);
    const state = deadlineState(started, s.triageDueAt, now, cal);
    if (state === "ON_TRACK") continue;
    count(state);
    const owner = s.assigneeId ?? account.csmId;
    const key = `triage:${s.id}:${state}:${s.triageDueAt.toISOString()}`;
    const title = state === "DUE_SOON" ? `Triage due soon: ${account.name}` : state === "OVERDUE" ? `Triage overdue: ${account.name}` : `Needs reassigning: ${account.name} signal is 2+ business days overdue`;
    const targets = state === "DUE_SOON" ? [owner] : state === "OVERDUE" ? [owner, ...csLeads] : csLeads;
    for (const to of new Set(targets.filter(Boolean) as string[])) {
      await notify(db, ctx, { userId: to, kind: state === "ESCALATE" ? "escalation" : "deadline", title, body: s.explanation, link: `/signals/${s.id}`, dedupeKey: key, email: state !== "DUE_SOON" });
    }
  }

  // CSQLs waiting for a seller (ROUTED) or for the CSM after a return (RETURNED).
  const waiting = await db
    .select({ c: csqls, account: { name: accounts.name } })
    .from(csqls)
    .innerJoin(accounts, eq(accounts.id, csqls.accountId))
    .where(and(eq(csqls.orgId, ctx.actor.orgId), inArray(csqls.status, ["ROUTED", "RETURNED"]), isNotNull(csqls.dueAt), isNotNull(csqls.clockStartedAt)));
  for (const { c, account } of waiting) {
    const state = deadlineState(c.clockStartedAt!, c.dueAt!, now, cal);
    if (state === "ON_TRACK") continue;
    count(state);
    const seller = c.status === "ROUTED";
    const owner = seller ? c.ownerId : c.sourcedBy;
    const leads = seller ? salesLeads : csLeads;
    const label = `${cfg.terminology.csql}-${String(c.number).padStart(4, "0")}`;
    const what = seller ? "waiting for the seller" : "returned and waiting for the CSM";
    const title = state === "DUE_SOON" ? `${label} due soon: ${account.name}` : state === "OVERDUE" ? `${label} overdue: ${account.name}, ${what}` : `Needs reassigning: ${label} (${account.name}) is 2+ business days overdue`;
    const targets = state === "DUE_SOON" ? [owner] : state === "OVERDUE" ? [owner, ...leads] : leads;
    for (const to of new Set(targets.filter(Boolean) as string[])) {
      await notify(db, ctx, { userId: to, kind: state === "ESCALATE" ? "escalation" : "deadline", title, link: `/csqls/${c.id}`, dedupeKey: `csql:${c.id}:${state}:${c.dueAt!.toISOString()}`, email: state !== "DUE_SOON" });
    }
  }
  return out;
}
