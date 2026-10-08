import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { activityLog, alerts, events, exposureSnapshots, obligations, organizations, users } from "@/db/schema";
import { orgConfigSchema } from "@/config/schema";
import { computeEventExposure } from "@/core/exposure/event";
import { cancellationStaircase } from "@/core/exposure/timeline";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { computeEventSavings } from "@/core/exposure/savings";
import { formatDate } from "@/ui/format";
import { daysBetween, localDateOf } from "@/core/time";
import type { Db } from "@/db/client";
import type { DbLike, ServiceCtx } from "@/services/context";
import { loadExposureContext, snapshotEventExposure } from "@/services/exposure";
import { raiseAlert, resolveAlerts, type OrgRef } from "@/services/alerts";
import { notify } from "@/services/notifications";
import { drainExtractionQueue, failStuckExtractions } from "@/services/documents";
import { systemCtx } from "@/services/system-ctx";

// Automation rules (spec §11). Every rule is idempotent: alerts are keyed to their
// condition, notifications are deduplicated, so re-running a job changes nothing.

const OPEN_EVENT = ["PLANNING", "CONTRACTED", "LIVE", "POSTPONED"] as const;


async function openEvents(db: DbLike, orgId: string) {
  return db.select().from(events).where(and(eq(events.orgId, orgId), inArray(events.status, [...OPEN_EVENT])));
}

/**
 * R4 (threshold), R6 (cutoff with projected attrition) and R11 (savings) for one event. Called by the
 * daily job and after anything that moves exposure (pickup, forecasts, terms, changes).
 */
export async function evaluateEvent(db: DbLike, org: OrgRef, eventId: string, now: Date) {
  const ec = await loadExposureContext(db, org.id, eventId, now);
  const e = computeEventExposure(ec.input);
  const threshold = ec.event.exposureThresholdMinor ?? org.config.rules.exposureThresholdMinor;
  const ccy = ec.event.baseCurrency;

  if (e.current.totalMinor >= threshold && threshold > 0 && !(await thresholdAlreadyDecided(db, org.id, eventId, threshold))) {
    await raiseAlert(db, org, now, {
      rule: "THRESHOLD",
      eventId,
      severity: "HIGH",
      title: `If nothing changes, penalties reach ${formatMoneyShort(e.current.totalMinor, ccy)}, above your ${formatMoneyShort(threshold, ccy)} limit`,
      detail: { currentMinor: e.current.totalMinor, thresholdMinor: threshold, agencyMinor: e.current.agencyMinor, currency: ccy },
      notifyRoles: [...new Set([...org.config.rules.escalateTo, "MD" as const])],
      body: `${formatMoneyShort(e.current.agencyMinor, ccy)} of it is yours; the client covers ${formatMoneyShort(e.current.clientMinor, ccy)}.`,
    });
  } else {
    await resolveAlerts(db, org.id, now, { rule: "THRESHOLD", eventId }, "Exposure back under the threshold");
  }

  // R6: cutoffs within the warning window where the block is projected short.
  const cutoffs = await db
    .select()
    .from(obligations)
    .where(and(eq(obligations.eventId, eventId), eq(obligations.kind, "CUTOFF"), eq(obligations.status, "OPEN")));
  for (const o of cutoffs) {
    const days = daysBetween(localDateOf(now, ec.event.timezone), localDateOf(o.dueAt, ec.event.timezone));
    const line = e.lines.find((l) => l.clauseId === o.clauseId && l.kind === "ATTRITION");
    const amount = line && line.calc.status === "COMPLETE" ? line.calc.amountMinor : 0;
    if (o.dueAt > now && days <= org.config.rules.cutoffWarningDays && amount > 0 && line) {
      await raiseAlert(db, org, now, {
        rule: "CUTOFF",
        eventId,
        obligationId: o.id,
        contractId: o.contractId,
        severity: days <= 7 ? "HIGH" : "WATCH",
        title: `${line.supplierName}: unused rooms could cost ${formatMoneyShort(amount, line.currency)}. Room cutoff in ${days} day${days === 1 ? "" : "s"}`,
        detail: { days, attritionMinor: amount, currency: line.currency, obligationLabel: o.label },
        body: "Give rooms back or renegotiate before the cutoff to reduce the charge.",
      });
    } else {
      await resolveAlerts(db, org.id, now, { rule: "CUTOFF", eventId, obligationId: o.id }, amount > 0 ? "Cutoff passed" : "No projected attrition");
    }
  }

  // R11 (savings finder): a review date within 14 days where giving rooms back saves money.
  // Anchored to the REVIEW deadline, so each review date alerts at most once.
  const reviews = await db
    .select()
    .from(obligations)
    .where(and(eq(obligations.eventId, eventId), eq(obligations.kind, "REVIEW"), eq(obligations.status, "OPEN")));
  const savings = computeEventSavings(ec.input);
  const today = localDateOf(now, ec.event.timezone);
  for (const o of reviews) {
    const due = localDateOf(o.dueAt, ec.event.timezone);
    const s = savings.find((x) => x.contractId === o.contractId && x.reviewDate === due);
    const days = daysBetween(today, due);
    if (s && o.dueAt > now && days <= 14) {
      await raiseAlert(db, org, now, {
        rule: "SAVING",
        eventId,
        obligationId: o.id,
        contractId: o.contractId,
        severity: "WATCH",
        title: `Give back ${s.roomNights} room night${s.roomNights === 1 ? "" : "s"} at ${s.supplierName} by ${formatDate(due)} to save up to ${formatMoneyShort(s.savingMinor, s.currency)}`,
        detail: { days, savingMinor: s.savingMinor, currency: s.currency, roomNights: s.roomNights, releases: s.releases, reviewDate: due },
        body: `The contract allows up to ${s.maxReductionPct}% back on that date. Only rooms nobody is expected to book are counted.`,
      });
    } else {
      await resolveAlerts(db, org.id, now, { rule: "SAVING", eventId, obligationId: o.id }, s ? "Review date passed" : "Nothing left to save");
    }
  }
  return e;
}

/**
 * A person decided the last "above your limit" alert, and penalties haven't dropped below the
 * limit since (by the daily snapshots). The breach is the same one, so it isn't raised again.
 * If penalties went below the limit after the decision and are over it again, that's new.
 */
async function thresholdAlreadyDecided(db: DbLike, orgId: string, eventId: string, threshold: number) {
  const [decided] = await db
    .select({ closedAt: alerts.closedAt })
    .from(alerts)
    .where(and(eq(alerts.orgId, orgId), eq(alerts.rule, "THRESHOLD"), eq(alerts.eventId, eventId), eq(alerts.status, "DECIDED")))
    .orderBy(desc(alerts.closedAt))
    .limit(1);
  if (!decided?.closedAt) return false;
  const [below] = await db
    .select({ id: exposureSnapshots.id })
    .from(exposureSnapshots)
    .where(and(eq(exposureSnapshots.eventId, eventId), gt(exposureSnapshots.takenAt, decided.closedAt), lt(exposureSnapshots.currentMinor, threshold)))
    .limit(1);
  return !below;
}

/** Passed cutoffs and review points are history: close them and their alerts. */
async function closePassedMarkers(db: DbLike, org: OrgRef, now: Date, eventId: string) {
  const passed = await db
    .select()
    .from(obligations)
    .where(and(eq(obligations.eventId, eventId), inArray(obligations.kind, ["CUTOFF", "REVIEW"]), eq(obligations.status, "OPEN"), lt(obligations.dueAt, now)));
  for (const o of passed) {
    await db.update(obligations).set({ status: "DONE", doneAt: now }).where(eq(obligations.id, o.id));
    await resolveAlerts(db, org.id, now, { rule: "CUTOFF", eventId, obligationId: o.id }, "Cutoff passed");
    await resolveAlerts(db, org.id, now, { rule: "SAVING", eventId, obligationId: o.id }, "Review date passed");
    await db.insert(activityLog).values({
      orgId: org.id,
      actorType: "SYSTEM",
      actorLabel: "System",
      entityType: "contract",
      entityId: o.contractId,
      eventId,
      action: "marker_passed",
      summary: `${o.label} passed`,
      at: now,
    });
  }
}

/** R5: warn before a cancellation step raises the charge; close passed steps. */
async function tierSteps(db: DbLike, org: OrgRef, now: Date, eventId: string) {
  const steps = await db
    .select()
    .from(obligations)
    .where(and(eq(obligations.eventId, eventId), eq(obligations.kind, "TIER_CHANGE"), eq(obligations.status, "OPEN")));
  if (!steps.length) return;
  const ec = await loadExposureContext(db, org.id, eventId, now);
  const [ev] = await db.select().from(events).where(eq(events.id, eventId));
  const staircase = cancellationStaircase(ec.input, ev.endDate);
  for (const o of steps) {
    const localDue = localDateOf(o.dueAt, ev.timezone);
    if (o.dueAt <= now) {
      await db.update(obligations).set({ status: "DONE", doneAt: now }).where(eq(obligations.id, o.id));
      await resolveAlerts(db, org.id, now, { rule: "TIER_STEP", eventId, obligationId: o.id }, "Step took effect");
      await db.insert(activityLog).values({
        orgId: org.id,
        actorType: "SYSTEM",
        actorLabel: "System",
        entityType: "contract",
        entityId: o.contractId,
        eventId,
        action: "tier_step_passed",
        summary: `${o.label} took effect`,
        at: now,
      });
      continue;
    }
    const days = daysBetween(localDateOf(now, ev.timezone), localDue);
    if (days > org.config.rules.tierStepWarningDays) continue;
    const before = staircase.filter((s) => s.date < localDue).at(-1)?.totalMinor ?? 0;
    const after = staircase.find((s) => s.date === localDue)?.totalMinor ?? before;
    await raiseAlert(db, org, now, {
      rule: "TIER_STEP",
      eventId,
      obligationId: o.id,
      contractId: o.contractId,
      severity: days <= 7 ? "HIGH" : "WATCH",
      title: `Cancellation fee goes up in ${days} day${days === 1 ? "" : "s"}: cancelling would cost ${formatMoneyShort(after, ev.baseCurrency)} instead of ${formatMoneyShort(before, ev.baseCurrency)}`,
      detail: { days, beforeMinor: before, afterMinor: after, currency: ev.baseCurrency },
      body: "If the event is at risk, decide before the step date.",
    });
  }
}

/** R2: remind owners at the configured offsets (one reminder per obligation per offset). */
async function reminders(db: DbLike, org: OrgRef, now: Date) {
  const offsets = [...org.config.rules.reminderOffsetsDays].sort((a, b) => a - b);
  const rows = await db
    .select({ o: obligations, eventName: events.name, tz: events.timezone })
    .from(obligations)
    .innerJoin(events, eq(events.id, obligations.eventId))
    .where(and(eq(obligations.orgId, org.id), eq(obligations.status, "OPEN"), sql`${obligations.kind} not in ('TIER_CHANGE')`, gt(obligations.dueAt, now)));
  let sent = 0;
  for (const { o, eventName, tz } of rows) {
    if (!o.ownerId) continue;
    const days = daysBetween(localDateOf(now, tz), localDateOf(o.dueAt, tz));
    const offset = offsets.find((x) => x >= days);
    if (offset === undefined) continue;
    sent += await notify(db, org, [o.ownerId], {
      kind: "reminder",
      title: `${o.label} due ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`,
      body: `${eventName}${o.amountMinor !== null && o.currency ? ` · ${formatMoney(o.amountMinor, o.currency)}` : ""}`,
      link: `/events/${o.eventId}/deadlines`,
      dedupeKey: `remind:${o.id}:${offset}`,
    });
  }
  return sent;
}

/** R3: escalate deadlines overdue by more than the configured hours. */
async function overdue(db: DbLike, org: OrgRef, now: Date) {
  const cutoff = new Date(now.getTime() - org.config.rules.overdueEscalationHours * 3600_000);
  const rows = await db
    .select()
    .from(obligations)
    .where(
      and(
        eq(obligations.orgId, org.id),
        eq(obligations.status, "OPEN"),
        sql`${obligations.kind} not in ('TIER_CHANGE','REVIEW','CUTOFF')`,
        lt(obligations.dueAt, cutoff),
      ),
    );
  for (const o of rows) {
    await raiseAlert(db, org, now, {
      rule: "OVERDUE",
      eventId: o.eventId,
      obligationId: o.id,
      contractId: o.contractId,
      severity: "HIGH",
      title: `Overdue: ${o.label}`,
      detail: { dueAt: o.dueAt.toISOString(), amountMinor: o.amountMinor, currency: o.currency },
    });
  }
  // Close overdue alerts whose obligation is no longer open.
  const closed = await db.select({ id: obligations.id, eventId: obligations.eventId }).from(obligations).where(and(eq(obligations.orgId, org.id), sql`${obligations.status} <> 'OPEN'`));
  for (const c of closed) await resolveAlerts(db, org.id, now, { rule: "OVERDUE", eventId: c.eventId, obligationId: c.id }, "Deadline closed");
  return rows.length;
}

/** R10: prompt owners to mark finished events delivered and record actual penalties. */
async function deliveredPrompts(db: DbLike, org: OrgRef, now: Date) {
  const rows = await db.select().from(events).where(and(eq(events.orgId, org.id), inArray(events.status, ["CONTRACTED", "LIVE"])));
  for (const e of rows) {
    if (localDateOf(now, e.timezone) <= e.endDate) continue;
    await notify(db, org, [e.ownerId], {
      kind: "prompt",
      title: `${e.name} has ended: mark it delivered`,
      body: "Then record any penalties the suppliers actually charged.",
      link: `/events/${e.id}`,
      dedupeKey: `delivered:${e.id}`,
    });
  }
}

async function forEachOrg(db: Db, fn: (org: OrgRef) => Promise<void>, onlyOrgId?: string) {
  const orgs = await db.select().from(organizations).where(onlyOrgId ? eq(organizations.id, onlyOrgId) : undefined);
  for (const o of orgs) await fn({ id: o.id, timezone: o.timezone, baseCurrency: o.baseCurrency, config: orgConfigSchema.parse(o.config) });
}

export async function runDaily(db: Db, now = new Date()) {
  const summary = { events: 0, snapshots: 0, reminders: 0 };
  await forEachOrg(db, async (org) => {
    const ctx = await systemCtx(db, org, now);
    for (const e of await openEvents(db, org.id)) {
      summary.events++;
      await tierSteps(db, org, now, e.id);
      await closePassedMarkers(db, org, now, e.id);
      await evaluateEvent(db, org, e.id, now);
      await snapshotEventExposure(db, ctx, e.id, "daily");
      summary.snapshots++;
    }
    summary.reminders += await reminders(db, org, now);
    await deliveredPrompts(db, org, now);
  });
  return summary;
}

export async function runHourly(db: Db, now = new Date()) {
  const summary = { overdue: 0, stuckExtractions: 0, extractionsRun: 0, expiredApprovals: 0 };
  summary.stuckExtractions = (await failStuckExtractions(db, now)).length;
  // Restart the extraction queue in case its worker stopped (a restart mid-import, or runs waiting to retry).
  summary.extractionsRun = (await drainExtractionQueue(db, { now: () => now, minAgeMs: 5 * 60_000 })).processed;
  await forEachOrg(db, async (org) => {
    summary.overdue += await overdue(db, org, now);
    const { expireApprovals } = await import("@/services/changes");
    summary.expiredApprovals += await expireApprovals(db, org, now);
  });
  return summary;
}

/** ISO week key (e.g. 2026-W40), so the brief goes out at most once per person per week. */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * R12: the Monday money brief. Every active person gets a plain-English summary of what they
 * can see (their own ServiceCtx, so permissions apply), unless they turned it off in Your
 * account. Deduplicated per person per ISO week through the notifications table.
 */
export async function runWeekly(db: Db, now = new Date(), opts: { orgId?: string } = {}) {
  const { buildBrief } = await import("@/services/brief");
  const { getPreferences } = await import("@/services/preferences");
  const summary = { considered: 0, sent: 0, optedOut: 0, nothingOpen: 0 };
  await forEachOrg(db, async (org) => {
    const people = await db.select().from(users).where(and(eq(users.orgId, org.id), eq(users.status, "ACTIVE")));
    for (const u of people) {
      summary.considered++;
      const ctx: ServiceCtx = {
        db,
        now: () => now,
        actor: { userId: u.id, name: u.name, role: u.role, orgId: org.id, orgTimezone: org.timezone, baseCurrency: org.baseCurrency, config: org.config },
      };
      if (!(await getPreferences(ctx)).weeklyBrief) {
        summary.optedOut++;
        continue;
      }
      const brief = await buildBrief(ctx);
      if (!brief.send) {
        summary.nothingOpen++;
        continue;
      }
      summary.sent += await notify(db, org, [u.id], {
        kind: "brief",
        title: brief.subject,
        body: brief.body,
        link: "/",
        dedupeKey: `brief:${isoWeek(now)}`,
      });
    }
  }, opts.orgId);
  return summary;
}
