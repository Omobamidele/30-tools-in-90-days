import { and, asc, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { clauses, clientAgreements, contracts, events, exposureSnapshots, liabilityRules, obligations, suppliers } from "@/db/schema";
import { computeEventExposure, type ContractInput, type EventExposure, type EventInput, type Scenario } from "@/core/exposure/event";
import { cancellationStaircase } from "@/core/exposure/timeline";
import { computeEventSavings, type SavingOpportunity } from "@/core/exposure/savings";
import { convertMinor, type Minor } from "@/core/money";
import { addDays, localDateOf } from "@/core/time";
import type { DbLike, ServiceCtx } from "./context";
import { authorizeEvent, listEvents } from "./events";
import type { LiabilityRules } from "@/core/exposure/types";
import { depositsPaidByContract } from "./contracts";
import { latestPickup } from "./pickup";
import { loadFx } from "./fx";

export type ExposureContext = {
  input: EventInput;
  event: typeof events.$inferSelect;
  agreementName: string | null;
  draftContracts: Array<{ id: string; title: string }>;
  fxAsOf: (from: string, to: string) => string | null;
};

/**
 * Loads everything the calculation needs for one event. Only ACTIVE contracts and their
 * CONFIRMED clauses count; proposed terms and never-activated contracts make the result
 * incomplete rather than silently lower.
 */
export async function loadExposureContext(db: DbLike, orgId: string, eventId: string, now: Date): Promise<ExposureContext> {
  const map = await loadExposureContexts(db, orgId, [eventId], now);
  const ec = map.get(eventId);
  if (!ec) throw new Error(`Event ${eventId} not found`);
  return ec;
}

/**
 * Batch loader: a fixed number of queries regardless of how many events (the portfolio
 * view loads every open event at once).
 */
export async function loadExposureContexts(db: DbLike, orgId: string, eventIds: string[], now: Date): Promise<Map<string, ExposureContext>> {
  const out = new Map<string, ExposureContext>();
  if (!eventIds.length) return out;
  const eventRows = await db.select().from(events).where(and(inArray(events.id, eventIds), eq(events.orgId, orgId)));
  if (!eventRows.length) return out;
  const contractRows = await db
    .select({ contract: contracts, supplierName: suppliers.name })
    .from(contracts)
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(inArray(contracts.eventId, eventRows.map((e) => e.id)), notInArray(contracts.status, ["SUPERSEDED", "CANCELLED", "CLOSED"])));
  const activeIds = contractRows.filter((r) => r.contract.status === "ACTIVE").map((r) => r.contract.id);
  const clauseRows = activeIds.length
    ? (
        await db
          .select({ clause: clauses })
          .from(clauses)
          .innerJoin(contracts, eq(contracts.id, clauses.contractId))
          .where(
            and(
              inArray(contracts.eventId, eventRows.map((e) => e.id)),
              eq(contracts.status, "ACTIVE"),
              inArray(clauses.status, ["CONFIRMED", "PROPOSED"]),
            ),
          )
      ).map((r) => r.clause)
    : [];
  const blockIds = clauseRows.filter((c) => c.type === "ROOM_BLOCK" && c.status === "CONFIRMED").map((c) => c.id);
  const clientIds = [...new Set(eventRows.map((e) => e.clientId))];
  const [pickup, deposits, agreementRows, fx] = await Promise.all([
    latestPickup(db, blockIds),
    depositsPaidByContract(db, activeIds),
    db.select().from(clientAgreements).where(and(eq(clientAgreements.orgId, orgId), inArray(clientAgreements.clientId, clientIds))),
    loadFx(db, orgId),
  ]);
  const ruleRows = agreementRows.length
    ? await db.select().from(liabilityRules).where(inArray(liabilityRules.agreementId, agreementRows.map((a) => a.id)))
    : [];
  const contractsByEvent = groupBy(contractRows, (r) => r.contract.eventId);
  const clausesByContract = groupBy(clauseRows, (c) => c.contractId);
  const rulesByAgreement = groupBy(ruleRows, (r) => r.agreementId);

  for (const event of eventRows) {
    const mineContracts = contractsByEvent.get(event.id) ?? [];
    const active = mineContracts.filter((r) => r.contract.status === "ACTIVE");
    // A draft that amends an active contract doesn't make the event incomplete: the active version counts.
    const draftContracts = mineContracts
      .filter((r) => r.contract.status !== "ACTIVE" && !r.contract.supersedesId)
      .map((r) => ({ id: r.contract.id, title: `${r.supplierName}: ${r.contract.title}` }));
    // Agreement in force on the event's start date (same rule as rulesForEvent).
    const agreement = agreementRows
      .filter((a) => a.clientId === event.clientId && a.effectiveFrom <= event.startDate && (!a.effectiveTo || a.effectiveTo >= event.startDate))
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
    const rules: LiabilityRules | null = agreement
      ? Object.fromEntries((rulesByAgreement.get(agreement.id) ?? []).map((r) => [r.category, { bearer: r.bearer, agencyPct: r.agencyPct }]))
      : null;

    const contractInputs: ContractInput[] = active.map(({ contract, supplierName }) => {
      const mine = clausesByContract.get(contract.id) ?? [];
      return {
        contractId: contract.id,
        title: contract.title,
        supplierName,
        currency: contract.currency,
        contractedValueMinor: contract.contractedValueMinor,
        depositsPaidMinor: deposits.get(contract.id) ?? 0,
        unconfirmedClauseCount: mine.filter((c) => c.status === "PROPOSED").length,
        clauses: mine
          .filter((c) => c.status === "CONFIRMED")
          .map((c) => ({ id: c.id, type: c.type, label: c.label, terms: c.data, inputs: c.inputs, pickup: pickup.get(c.id) ?? null })),
      };
    });

    out.set(event.id, {
      event,
      agreementName: agreement?.name ?? null,
      draftContracts,
      fxAsOf: fx.asOf,
      input: {
        asOf: localDateOf(now, event.timezone),
        forecastAttendance: event.forecastAttendance,
        baseCurrency: event.baseCurrency,
        contracts: contractInputs,
        liabilityRules: rules,
        fxRate: fx.rate,
      },
    });
  }
  return out;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export type EventExposureView = EventExposure & {
  agreementName: string | null;
  draftContracts: Array<{ id: string; title: string }>;
  thresholdMinor: Minor;
  overThreshold: boolean;
};

function withMeta(ctx: ServiceCtx, ec: ExposureContext, e: EventExposure): EventExposureView {
  const missing = [...e.missing];
  for (const d of ec.draftContracts) missing.push({ field: `contract.${d.id}`, label: `${d.title} isn't active yet` });
  const thresholdMinor = ec.event.exposureThresholdMinor ?? ctx.actor.config.rules.exposureThresholdMinor;
  return {
    ...e,
    missing,
    complete: e.complete && ec.draftContracts.length === 0,
    agreementName: ec.agreementName,
    draftContracts: ec.draftContracts,
    thresholdMinor,
    overThreshold: e.current.totalMinor >= thresholdMinor,
  };
}

export async function getEventExposure(ctx: ServiceCtx, eventId: string, scenario?: Scenario) {
  await authorizeEvent(ctx, eventId, "event.view");
  const ec = await loadExposureContext(ctx.db, ctx.actor.orgId, eventId, ctx.now());
  const current = withMeta(ctx, ec, computeEventExposure(ec.input));
  const scenarioResult = scenario ? withMeta(ctx, ec, computeEventExposure({ ...ec.input, scenario })) : null;
  return { event: ec.event, context: ec, current, scenario: scenarioResult };
}

/** Open savings for one event (savings finder), in contract and event currencies. */
export async function getEventSavings(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  const ec = await loadExposureContext(ctx.db, ctx.actor.orgId, eventId, ctx.now());
  return { currency: ec.event.baseCurrency, savings: computeEventSavings(ec.input) };
}

/** Everything the commitment timeline draws: cancellation staircase + dated obligations. */
export async function getEventTimeline(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  const ec = await loadExposureContext(ctx.db, ctx.actor.orgId, eventId, ctx.now());
  const steps = cancellationStaircase(ec.input, ec.event.endDate);
  const marks = await ctx.db
    .select({
      id: obligations.id,
      kind: obligations.kind,
      label: obligations.label,
      dueAt: obligations.dueAt,
      amountMinor: obligations.amountMinor,
      currency: obligations.currency,
      contractId: obligations.contractId,
    })
    .from(obligations)
    .where(and(eq(obligations.eventId, eventId), eq(obligations.status, "OPEN"), sql`${obligations.kind} <> 'TIER_CHANGE'`))
    .orderBy(obligations.dueAt);
  return { event: ec.event, asOf: ec.input.asOf, steps, marks };
}

export async function snapshotEventExposure(db: DbLike, ctx: ServiceCtx, eventId: string, trigger: string) {
  const ec = await loadExposureContext(db, ctx.actor.orgId, eventId, ctx.now());
  const e = withMeta(ctx, ec, computeEventExposure(ec.input));
  await db.insert(exposureSnapshots).values({
    orgId: ctx.actor.orgId,
    eventId,
    takenAt: ctx.now(),
    trigger,
    complete: e.complete,
    currentMinor: e.current.totalMinor,
    cancellationMinor: e.cancellation.totalMinor,
    agencyMinor: e.current.agencyMinor,
    clientMinor: e.current.clientMinor,
    unassignedMinor: e.current.unassignedMinor,
    currency: e.baseCurrency,
    payload: { lines: e.lines.map((l) => ({ clauseId: l.clauseId, kind: l.kind, contractId: l.contractId, calc: l.calc.status === "COMPLETE" ? l.calc.amountMinor : null, base: l.base?.amountMinor ?? null })), missing: e.missing },
  });
  return e;
}

export async function latestSnapshots(db: DbLike, eventIds: string[]) {
  if (!eventIds.length) return new Map<string, typeof exposureSnapshots.$inferSelect>();
  const rows = await db
    .select()
    .from(exposureSnapshots)
    .where(inArray(exposureSnapshots.eventId, eventIds))
    .orderBy(desc(exposureSnapshots.takenAt));
  const out = new Map<string, typeof exposureSnapshots.$inferSelect>();
  for (const r of rows) if (!out.has(r.eventId)) out.set(r.eventId, r);
  return out;
}

const OPEN_STATUSES = new Set(["PLANNING", "CONTRACTED", "LIVE", "POSTPONED"]);

export type PortfolioRow = {
  eventId: string;
  name: string;
  clientId: string;
  clientName: string;
  destination: string | null;
  coverImage: string | null;
  startDate: string;
  endDate: string;
  status: string;
  currency: string;
  exposure: EventExposureView;
  /** Rooms that can still be given back at a review date, and what that saves (savings finder). */
  savings: SavingOpportunity[];
  /** In the organisation's base currency; null when an FX rate is missing. */
  base: { currentMinor: Minor; cancellationMinor: Minor; agencyMinor: Minor; clientMinor: Minor; unassignedMinor: Minor } | null;
};

/** Live exposure for every open event the actor can see, converted to the org currency. */
export async function getPortfolio(ctx: ServiceCtx) {
  const visible = (await listEvents(ctx)).filter((e) => OPEN_STATUSES.has(e.status));
  const fx = await loadFx(ctx.db, ctx.actor.orgId);
  const orgCcy = ctx.actor.baseCurrency;
  const rows: PortfolioRow[] = [];
  const contexts = await loadExposureContexts(ctx.db, ctx.actor.orgId, visible.map((e) => e.id), ctx.now());
  for (const e of visible) {
    const ec = contexts.get(e.id)!;
    const exp = withMeta(ctx, ec, computeEventExposure(ec.input));
    const rate = fx.rate(e.baseCurrency, orgCcy);
    rows.push({
      eventId: e.id,
      name: e.name,
      clientId: e.clientId,
      clientName: e.clientName,
      destination: e.destination,
      coverImage: e.coverImage,
      startDate: e.startDate,
      endDate: e.endDate,
      status: e.status,
      currency: e.baseCurrency,
      exposure: exp,
      savings: computeEventSavings(ec.input),
      base:
        rate === null
          ? null
          : {
              currentMinor: convertMinor(exp.current.totalMinor, rate),
              cancellationMinor: convertMinor(exp.cancellation.totalMinor, rate),
              agencyMinor: convertMinor(exp.current.agencyMinor, rate),
              clientMinor: convertMinor(exp.current.clientMinor, rate),
              unassignedMinor: convertMinor(exp.current.unassignedMinor, rate),
            },
    });
  }
  const sumOf = (k: keyof NonNullable<PortfolioRow["base"]>) => rows.reduce((s, r) => s + (r.base?.[k] ?? 0), 0);
  return {
    currency: orgCcy,
    rows,
    totals: {
      currentMinor: sumOf("currentMinor"),
      cancellationMinor: sumOf("cancellationMinor"),
      agencyMinor: sumOf("agencyMinor"),
      clientMinor: sumOf("clientMinor"),
      unassignedMinor: sumOf("unassignedMinor"),
    },
    /** Total the savings finder can still save, in the org currency (savings without an FX rate are left out). */
    savingsMinor: rows.reduce((total, r) => {
      const rate = fx.rate(r.currency, orgCcy);
      if (rate === null) return total;
      return total + r.savings.reduce((s, o) => s + (o.savingBaseMinor === null ? 0 : convertMinor(o.savingBaseMinor, rate)), 0);
    }, 0),
    incompleteEvents: rows.filter((r) => !r.exposure.complete || r.base === null).length,
    missingFx: [...new Set(rows.filter((r) => r.base === null).map((r) => r.currency))],
  };
}

/** `null` means no snapshot existed yet on that day: shown as a gap, never as zero. */
export type TrendPoint = { date: string; currentMinor: number | null; cancellationMinor: number | null };

/**
 * Daily series from stored snapshots: for each day, each event contributes its latest
 * snapshot taken on or before that day (carried forward), converted to `currency`.
 * Days before an event's first snapshot contribute nothing; a day no event covers is null.
 * Nothing is interpolated.
 */
function buildTrend(
  rows: Array<typeof exposureSnapshots.$inferSelect>,
  dates: string[],
  tz: string,
  rate: (ccy: string) => string | null,
): TrendPoint[] {
  const byEvent = new Map<string, Array<typeof exposureSnapshots.$inferSelect>>();
  for (const r of rows) byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
  const points: TrendPoint[] = dates.map((date) => ({ date, currentMinor: null, cancellationMinor: null }));
  for (const snaps of byEvent.values()) {
    // rows arrive ascending by takenAt
    let i = -1;
    dates.forEach((date, d) => {
      while (i + 1 < snaps.length && localDateOf(snaps[i + 1].takenAt, tz) <= date) i++;
      if (i < 0) return;
      const s = snaps[i];
      const fx = rate(s.currency);
      if (fx === null) return;
      points[d].currentMinor = (points[d].currentMinor ?? 0) + convertMinor(s.currentMinor, fx);
      points[d].cancellationMinor = (points[d].cancellationMinor ?? 0) + convertMinor(s.cancellationMinor, fx);
    });
  }
  return points;
}

function trendDates(now: Date, tz: string, days: number) {
  const today = localDateOf(now, tz);
  return Array.from({ length: days }, (_, k) => addDays(today, k - days + 1));
}

async function snapshotsSince(db: DbLike, eventIds: string[], since: Date) {
  if (!eventIds.length) return [];
  return db
    .select()
    .from(exposureSnapshots)
    .where(and(inArray(exposureSnapshots.eventId, eventIds), gte(exposureSnapshots.takenAt, since)))
    .orderBy(asc(exposureSnapshots.takenAt));
}

/** Portfolio exposure per day over the last `days` days, in the organisation currency. */
export async function getPortfolioTrend(ctx: ServiceCtx, days = 30) {
  const visible = (await listEvents(ctx)).filter((e) => OPEN_STATUSES.has(e.status));
  const tz = ctx.actor.orgTimezone;
  const dates = trendDates(ctx.now(), tz, days);
  // Look back further than the window so each event's carried-in value is known on day one.
  const since = new Date(ctx.now().getTime() - (days + 90) * 86_400_000);
  const [rows, fx] = await Promise.all([snapshotsSince(ctx.db, visible.map((e) => e.id), since), loadFx(ctx.db, ctx.actor.orgId)]);
  const orgCcy = ctx.actor.baseCurrency;
  const rate = (c: string) => fx.rate(c, orgCcy);
  // Each event's value a week ago (carried forward from its latest snapshot), for "biggest change".
  const weekAgoDate = dates[Math.max(0, dates.length - 8)];
  const weekAgoByEvent: Record<string, number | null> = {};
  for (const e of visible) {
    weekAgoByEvent[e.id] = buildTrend(rows.filter((r) => r.eventId === e.id), [weekAgoDate], tz, rate)[0]?.currentMinor ?? null;
  }
  return { currency: orgCcy, points: buildTrend(rows, dates, tz, rate), weekAgoByEvent, snapshotCount: rows.length };
}

/** One event's exposure per day, in its reporting currency. */
export async function getEventTrend(ctx: ServiceCtx, eventId: string, days = 30) {
  await authorizeEvent(ctx, eventId, "event.view");
  const [event] = await ctx.db.select({ tz: events.timezone, ccy: events.baseCurrency }).from(events).where(eq(events.id, eventId));
  const dates = trendDates(ctx.now(), event.tz, days);
  const since = new Date(ctx.now().getTime() - (days + 90) * 86_400_000);
  const rows = await snapshotsSince(ctx.db, [eventId], since);
  return { currency: event.ccy, points: buildTrend(rows, dates, event.tz, (c) => (c === event.ccy ? "1" : null)), snapshotCount: rows.length };
}
