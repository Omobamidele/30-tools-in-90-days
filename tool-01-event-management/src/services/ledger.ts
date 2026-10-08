import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { alerts, changeRequests, decisions, events, users } from "@/db/schema";
import { convertMinor, type Minor } from "@/core/money";
import { localDateOf } from "@/core/time";
import type { ServiceCtx } from "./context";
import { listEvents } from "./events";
import { loadFx } from "./fx";
import { penaltyVariance } from "./reports";

// Money protected (milestone 14): what the team RECORDED, never what the system merely suggested.
// Every line links to its record. A decision counts only once a person records it; a finished
// event's projected-vs-charged figures are shown as a comparison, not claimed as savings.

export type LedgerPeriod = "quarter" | "year" | "all";

export function periodStart(period: LedgerPeriod, now: Date, tz: string): { from: Date | null; label: string } {
  if (period === "all") return { from: null, label: "since you started" };
  const [y, m] = localDateOf(now, tz).split("-").map(Number);
  if (period === "year") return { from: new Date(Date.UTC(y, 0, 1)), label: `in ${y}` };
  const q = Math.floor((m - 1) / 3);
  return { from: new Date(Date.UTC(y, q * 3, 1)), label: `this quarter (Q${q + 1} ${y})` };
}

export type LedgerDecision = {
  id: string;
  at: Date;
  eventId: string;
  eventName: string;
  what: string;
  type: "RELEASED_INVENTORY" | "RENEGOTIATED";
  by: string | null;
  note: string | null;
  amountMinor: Minor;
  currency: string;
  baseMinor: Minor | null;
  roomNights: number | null;
};

export type LedgerChange = {
  id: string;
  number: number;
  title: string;
  eventId: string;
  eventName: string;
  appliedAt: Date;
  currency: string;
  priceMinor: Minor;
  costMinor: Minor;
  basePriceMinor: Minor | null;
  baseMarginMinor: Minor | null;
};

export type LedgerFinished = {
  eventId: string;
  name: string;
  endDate: string;
  projectedBaseMinor: Minor | null;
  actualBaseMinor: Minor | null;
};

export async function getLedger(ctx: ServiceCtx, period: LedgerPeriod = "quarter") {
  const now = ctx.now();
  const { from, label } = periodStart(period, now, ctx.actor.orgTimezone);
  const ccy = ctx.actor.baseCurrency;
  const [visible, fx] = await Promise.all([listEvents(ctx), loadFx(ctx.db, ctx.actor.orgId)]);
  const ids = visible.map((e) => e.id);
  const toBase = (minor: number, from: string) => {
    const rate = fx.rate(from, ccy);
    return rate === null ? null : convertMinor(minor, rate);
  };

  const decisionRows = ids.length
    ? await ctx.db
        .select({ d: decisions, eventName: events.name, baseCurrency: events.baseCurrency, by: users.name, alertTitle: alerts.title })
        .from(decisions)
        .innerJoin(events, eq(events.id, decisions.eventId))
        .leftJoin(users, eq(users.id, decisions.byUserId))
        .leftJoin(alerts, eq(alerts.id, decisions.alertId))
        .where(
          and(
            inArray(decisions.eventId, ids),
            inArray(decisions.type, ["RELEASED_INVENTORY", "RENEGOTIATED"]),
            isNotNull(decisions.exposureDeltaMinor),
            from ? gte(decisions.createdAt, from) : undefined,
          ),
        )
        .orderBy(desc(decisions.createdAt))
    : [];
  const removed: LedgerDecision[] = decisionRows.map(({ d, eventName, baseCurrency, by, alertTitle }) => {
    const amount = Math.abs(d.exposureDeltaMinor ?? 0);
    const currency = d.currency ?? baseCurrency;
    const detail = (d.detail ?? {}) as { roomNights?: number | null };
    return {
      id: d.id,
      at: d.createdAt,
      eventId: d.eventId,
      eventName,
      what: alertTitle ?? "Decision recorded",
      type: d.type as LedgerDecision["type"],
      by,
      note: d.note,
      amountMinor: amount,
      currency,
      baseMinor: toBase(amount, currency),
      roomNights: typeof detail.roomNights === "number" ? detail.roomNights : null,
    };
  });

  const changeRows = ids.length
    ? await ctx.db
        .select({
          id: changeRequests.id,
          number: changeRequests.number,
          title: changeRequests.title,
          eventId: events.id,
          eventName: events.name,
          appliedAt: changeRequests.appliedAt,
          currency: events.baseCurrency,
          priceMinor: sql<number>`(select coalesce(sum(l.price_delta_minor),0) from change_lines l where l.change_request_id = ${changeRequests.id})`.mapWith(Number),
          costMinor: sql<number>`(select coalesce(sum(l.cost_delta_minor),0) from change_lines l where l.change_request_id = ${changeRequests.id})`.mapWith(Number),
        })
        .from(changeRequests)
        .innerJoin(events, eq(events.id, changeRequests.eventId))
        .where(and(inArray(changeRequests.eventId, ids), eq(changeRequests.status, "APPLIED"), from ? gte(changeRequests.appliedAt, from) : undefined))
        .orderBy(desc(changeRequests.appliedAt))
    : [];
  const billed: LedgerChange[] = changeRows
    .filter((c) => c.priceMinor > 0 && c.appliedAt)
    .map((c) => ({
      ...c,
      appliedAt: c.appliedAt!,
      basePriceMinor: toBase(c.priceMinor, c.currency),
      baseMarginMinor: toBase(c.priceMinor - c.costMinor, c.currency),
    }));

  const fromDate = from ? from.toISOString().slice(0, 10) : null;
  const finishedEvents = visible.filter((e) => ["DELIVERED", "RECONCILED", "CANCELLED"].includes(e.status) && (!fromDate || e.endDate >= fromDate));
  const variance = finishedEvents.length ? (await penaltyVariance(ctx)).filter((v) => finishedEvents.some((e) => e.id === v.eventId)) : [];
  const finished: LedgerFinished[] = variance.map((v) => ({
    eventId: v.eventId,
    name: v.name,
    endDate: finishedEvents.find((e) => e.id === v.eventId)!.endDate,
    projectedBaseMinor: v.projectedMinor === null ? null : toBase(v.projectedMinor, v.currency),
    actualBaseMinor: v.actualMinor === null || v.missingFx ? null : toBase(v.actualMinor, v.currency),
  }));

  const sum = (xs: Array<number | null>) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  return {
    period,
    label,
    currency: ccy,
    removed: {
      items: removed,
      totalMinor: sum(removed.map((r) => r.baseMinor)),
      roomNights: sum(removed.map((r) => r.roomNights)),
      missingFx: removed.some((r) => r.baseMinor === null),
    },
    billed: {
      items: billed,
      totalMinor: sum(billed.map((b) => b.basePriceMinor)),
      marginMinor: sum(billed.map((b) => b.baseMarginMinor)),
      missingFx: billed.some((b) => b.basePriceMinor === null),
    },
    finished: {
      items: finished,
      projectedMinor: sum(finished.map((f) => (f.actualBaseMinor === null ? null : f.projectedBaseMinor))),
      actualMinor: sum(finished.map((f) => (f.projectedBaseMinor === null ? null : f.actualBaseMinor))),
    },
  };
}
