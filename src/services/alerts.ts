import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { alerts, decisions, eventMembers, events, organizations, users } from "@/db/schema";
import { orgConfigSchema, type OrgConfig } from "@/config/schema";
import { parseMoney, formatMoney } from "@/core/money";
import { restrictedToOwnEvents } from "@/auth/policy";
import { audit, type DbLike, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput } from "./errors";
import { authorizeEvent } from "./events";
import { notify, usersWithRoles } from "./notifications";

// Rule names as people see them (plain words, docs/09 § Money). Stored rule keys never change.
export const ALERT_RULES = {
  THRESHOLD: "Above your limit",
  CUTOFF: "Unused rooms before a cutoff",
  TIER_STEP: "Cancellation fee about to rise",
  OVERDUE: "Overdue deadline",
  SAVING: "Money you can save",
} as const;
export type AlertRule = keyof typeof ALERT_RULES;

export type OrgRef = { id: string; timezone: string; baseCurrency: string; config: OrgConfig };

export async function orgRef(db: DbLike, orgId: string): Promise<OrgRef> {
  const [o] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return { id: o.id, timezone: o.timezone, baseCurrency: o.baseCurrency, config: orgConfigSchema.parse(o.config) };
}

/**
 * Opens an alert for a condition, or refreshes the open one. A new alert notifies the
 * event owner and the escalation roles once (deduplicated per alert).
 */
export async function raiseAlert(
  db: DbLike,
  org: OrgRef,
  now: Date,
  a: {
    rule: AlertRule;
    eventId: string;
    obligationId?: string | null;
    contractId?: string | null;
    severity: "HIGH" | "WATCH" | "INFO";
    title: string;
    detail: Record<string, unknown>;
    notifyRoles?: OrgConfig["rules"]["escalateTo"];
    body?: string;
  },
) {
  const [existing] = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.orgId, org.id),
        eq(alerts.rule, a.rule),
        eq(alerts.eventId, a.eventId),
        eq(alerts.status, "OPEN"),
        a.obligationId ? eq(alerts.obligationId, a.obligationId) : isNull(alerts.obligationId),
      ),
    );
  if (existing) {
    await db.update(alerts).set({ title: a.title, detail: a.detail, severity: a.severity }).where(eq(alerts.id, existing.id));
    return { alert: existing, created: false };
  }
  // A person already decided this deadline's alert: that decision stands. Re-raising it on the
  // next re-evaluation would ignore the decision and notify everyone again.
  if (a.obligationId) {
    const [decided] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.orgId, org.id), eq(alerts.rule, a.rule), eq(alerts.eventId, a.eventId), eq(alerts.obligationId, a.obligationId), eq(alerts.status, "DECIDED")))
      .limit(1);
    if (decided) return { alert: decided, created: false };
  }
  const [created] = await db
    .insert(alerts)
    .values({
      orgId: org.id,
      eventId: a.eventId,
      obligationId: a.obligationId ?? null,
      contractId: a.contractId ?? null,
      rule: a.rule,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      dedupeKey: `${a.rule}:${a.eventId}:${a.obligationId ?? "-"}:${now.getTime()}:${randomUUID().slice(0, 8)}`,
      openedAt: now,
    })
    .returning();
  const [ev] = await db.select({ ownerId: events.ownerId, name: events.name }).from(events).where(eq(events.id, a.eventId));
  const roleUsers = await usersWithRoles(db, org.id, a.notifyRoles ?? org.config.rules.escalateTo);
  await notify(db, org, [ev.ownerId, ...roleUsers], {
    kind: a.severity === "HIGH" ? "escalation" : "alert",
    title: `${a.title}: ${ev.name}`,
    body: a.body,
    link: `/events/${a.eventId}`,
    dedupeKey: `alert:${created.id}`,
  });
  return { alert: created, created: true };
}

/** Closes open alerts whose condition no longer holds. */
export async function resolveAlerts(db: DbLike, orgId: string, now: Date, where: { rule: AlertRule; eventId: string; obligationId?: string | null }, note: string) {
  return db
    .update(alerts)
    .set({ status: "AUTO_RESOLVED", closedAt: now, closedNote: note })
    .where(
      and(
        eq(alerts.orgId, orgId),
        eq(alerts.rule, where.rule),
        eq(alerts.eventId, where.eventId),
        eq(alerts.status, "OPEN"),
        where.obligationId === undefined ? undefined : where.obligationId === null ? isNull(alerts.obligationId) : eq(alerts.obligationId, where.obligationId),
      ),
    )
    .returning({ id: alerts.id });
}

export type AlertRow = Awaited<ReturnType<typeof listOpenAlerts>>[number];

export async function listOpenAlerts(ctx: ServiceCtx, filter: { eventId?: string } = {}) {
  if (filter.eventId) await authorizeEvent(ctx, filter.eventId, "event.view");
  const restricted = restrictedToOwnEvents(ctx.actor);
  const memberOf = restricted
    ? (await ctx.db.select({ id: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, ctx.actor.userId))).map((r) => r.id)
    : [];
  return ctx.db
    .select({
      id: alerts.id,
      rule: alerts.rule,
      severity: alerts.severity,
      title: alerts.title,
      detail: alerts.detail,
      openedAt: alerts.openedAt,
      eventId: events.id,
      eventName: events.name,
      eventTimezone: events.timezone,
      baseCurrency: events.baseCurrency,
      obligationId: alerts.obligationId,
      contractId: alerts.contractId,
    })
    .from(alerts)
    .innerJoin(events, eq(events.id, alerts.eventId))
    .where(
      and(
        eq(alerts.orgId, ctx.actor.orgId),
        eq(alerts.status, "OPEN"),
        filter.eventId ? eq(alerts.eventId, filter.eventId) : undefined,
        restricted ? or(eq(events.ownerId, ctx.actor.userId), memberOf.length ? inArray(events.id, memberOf) : sql`false`) : undefined,
      ),
    )
    .orderBy(sql`case ${alerts.severity} when 'HIGH' then 0 when 'WATCH' then 1 else 2 end`, desc(alerts.openedAt));
}

export const DECISION_TYPES = ["RELEASED_INVENTORY", "RENEGOTIATED", "ACCEPTED_RISK", "CLIENT_INFORMED", "OTHER"] as const;
export const decisionTypeLabels: Record<(typeof DECISION_TYPES)[number], string> = {
  RELEASED_INVENTORY: "Released inventory (rooms or space)",
  RENEGOTIATED: "Renegotiated with the supplier",
  ACCEPTED_RISK: "Accepted the risk",
  CLIENT_INFORMED: "Informed the client",
  OTHER: "Other",
};

export const decisionInput = z
  .object({
    type: z.enum(DECISION_TYPES),
    note: z.string().trim().max(2000).optional().default(""),
    exposureReduction: z.string().optional().default(""),
    /** Room nights given back, when the decision released rooms (recorded for the ledger). */
    roomNights: z.union([z.literal(""), z.coerce.number().int("Whole room nights only").min(0, "Can't be negative")]).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "ACCEPTED_RISK" || v.type === "OTHER") && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Say why, so the decision makes sense later" });
    }
    if (v.exposureReduction && parseMoney(v.exposureReduction) === null) {
      ctx.addIssue({ code: "custom", path: ["exposureReduction"], message: "Enter an amount like 4,725.00" });
    }
  });

/** Closes an alert with a recorded decision (spec FR-8.4). */
export async function decideAlert(ctx: ServiceCtx, alertId: string, raw: unknown) {
  const [a] = await ctx.db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.orgId, ctx.actor.orgId)));
  if (!a) throw notFound("Alert");
  await authorizeEvent(ctx, a.eventId, "decision.record");
  if (a.status !== "OPEN") throw invalidState("This alert is already closed.");
  const input = parseInput(decisionInput, raw);
  const [ev] = await ctx.db.select({ baseCurrency: events.baseCurrency }).from(events).where(eq(events.id, a.eventId));
  const reduction = input.exposureReduction ? parseMoney(input.exposureReduction) : null;
  // The amount is entered in the currency the alert is about (a hotel contract's EUR, say), which
  // can differ from the event's reporting currency. Record it in that currency; reports convert.
  const detail = (a.detail ?? {}) as Record<string, unknown>;
  const amountCurrency = typeof detail.currency === "string" ? detail.currency : ev.baseCurrency;
  const roomNights = input.roomNights === "" ? null : input.roomNights;
  await ctx.db.transaction(async (tx) => {
    const [d] = await tx
      .insert(decisions)
      .values({
        orgId: ctx.actor.orgId,
        eventId: a.eventId,
        alertId,
        type: input.type,
        note: input.note || null,
        exposureDeltaMinor: reduction !== null ? -Math.abs(reduction) : null,
        currency: reduction !== null ? amountCurrency : null,
        detail:
          roomNights !== null || a.rule === "SAVING" || a.rule === "CUTOFF"
            ? { rule: a.rule, roomNights, reviewDate: typeof detail.reviewDate === "string" ? detail.reviewDate : null }
            : null,
        byUserId: ctx.actor.userId,
        // Same clock as the alert's closedAt, so the decision and the closing agree.
        createdAt: ctx.now(),
      })
      .returning();
    await tx.update(alerts).set({ status: "DECIDED", closedAt: ctx.now(), closedNote: decisionTypeLabels[input.type] }).where(eq(alerts.id, alertId));
    await audit(tx, ctx, {
      entityType: "event",
      entityId: a.eventId,
      eventId: a.eventId,
      action: "decision_recorded",
      summary: `Decided on “${a.title}”: ${decisionTypeLabels[input.type]}${reduction !== null ? `, exposure reduced by ${formatMoney(Math.abs(reduction), amountCurrency)}` : ""}${roomNights ? `, ${roomNights} room nights given back` : ""}${input.note ? `. ${input.note}` : ""}`,
      diff: { decisionId: d.id },
    });
  });
}

export async function listDecisions(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  return ctx.db
    .select({ decision: decisions, byName: users.name })
    .from(decisions)
    .innerJoin(users, eq(users.id, decisions.byUserId))
    .where(eq(decisions.eventId, eventId))
    .orderBy(desc(decisions.createdAt));
}

