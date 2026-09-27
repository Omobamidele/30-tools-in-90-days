import { and, desc, eq, inArray } from "drizzle-orm";
import { decisions, events, clients, users } from "@/db/schema";
import { convertMinor } from "@/core/money";
import { restrictedToOwnEvents } from "@/auth/policy";
import type { ServiceCtx } from "./context";
import { getPortfolio } from "./exposure";
import { listEvents } from "./events";
import { listObligations } from "./obligations";
import { loadFx } from "./fx";
import { eventVariance } from "./post-event";

/** Exposure grouped by client, in the organisation's currency. */
export async function exposureByClient(ctx: ServiceCtx) {
  const p = await getPortfolio(ctx);
  const by = new Map<string, { client: string; events: number; current: number; agency: number; clientShare: number; unassigned: number; cancellation: number; incomplete: number }>();
  for (const r of p.rows) {
    const g = by.get(r.clientName) ?? { client: r.clientName, events: 0, current: 0, agency: 0, clientShare: 0, unassigned: 0, cancellation: 0, incomplete: 0 };
    g.events++;
    if (r.base) {
      g.current += r.base.currentMinor;
      g.agency += r.base.agencyMinor;
      g.clientShare += r.base.clientMinor;
      g.unassigned += r.base.unassignedMinor;
      g.cancellation += r.base.cancellationMinor;
    }
    if (!r.exposure.complete || !r.base) g.incomplete++;
    by.set(r.clientName, g);
  }
  return { currency: p.currency, rows: [...by.values()].sort((a, b) => b.current - a.current) };
}

/** Open payments due in the next N days with outstanding amounts, converted for totals. */
export async function paymentSchedule(ctx: ServiceCtx, days = 90) {
  const now = ctx.now();
  const fx = await loadFx(ctx.db, ctx.actor.orgId);
  const ccy = ctx.actor.baseCurrency;
  const rows = (await listObligations(ctx))
    .filter((o) => o.kind === "PAYMENT" && o.dueAt.getTime() - now.getTime() <= days * 86_400_000)
    .map((o) => {
      const outstanding = Math.max(0, (o.amountMinor ?? 0) - o.paidMinor);
      const rate = o.currency ? fx.rate(o.currency, ccy) : null;
      return { ...o, outstandingMinor: outstanding, baseMinor: rate === null ? null : convertMinor(outstanding, rate) };
    });
  return { currency: ccy, rows, totalMinor: rows.reduce((s, r) => s + (r.baseMinor ?? 0), 0), missingFx: rows.some((r) => r.baseMinor === null) };
}

/** Projected (7 days before) vs actual penalties for finished events, in each event's currency. */
export async function penaltyVariance(ctx: ServiceCtx) {
  const fx = await loadFx(ctx.db, ctx.actor.orgId);
  const finished = (await listEvents(ctx)).filter((e) => ["DELIVERED", "RECONCILED", "CANCELLED"].includes(e.status));
  const out = [];
  for (const e of finished) {
    const v = await eventVariance(ctx, e.id);
    let actual = 0;
    let missingFx = false;
    let recorded = 0;
    for (const k of v.contracts) {
      for (const p of k.penalties) {
        recorded++;
        const rate = fx.rate(k.currency, e.baseCurrency);
        if (rate === null) missingFx = true;
        else actual += convertMinor(p.amountMinor, rate);
      }
    }
    const projected = v.projected.t7 ?? v.projected.start ?? v.projected.t30;
    out.push({
      eventId: e.id,
      name: e.name,
      clientName: e.clientName,
      status: e.status,
      currency: e.baseCurrency,
      projectedMinor: projected?.minor ?? null,
      actualMinor: recorded ? actual : null,
      avoidedMinor: v.avoidedMinor,
      missingFx,
    });
  }
  return out;
}

/** Decisions recorded against alerts, with the exposure they removed. */
export async function decisionsLog(ctx: ServiceCtx) {
  const restricted = restrictedToOwnEvents(ctx.actor);
  const visible = restricted ? (await listEvents(ctx)).map((e) => e.id) : null;
  if (visible && !visible.length) return [];
  return ctx.db
    .select({
      id: decisions.id,
      type: decisions.type,
      note: decisions.note,
      exposureDeltaMinor: decisions.exposureDeltaMinor,
      currency: decisions.currency,
      createdAt: decisions.createdAt,
      byName: users.name,
      eventId: events.id,
      eventName: events.name,
      clientName: clients.name,
    })
    .from(decisions)
    .innerJoin(events, eq(events.id, decisions.eventId))
    .innerJoin(clients, eq(clients.id, events.clientId))
    .innerJoin(users, eq(users.id, decisions.byUserId))
    .where(and(eq(decisions.orgId, ctx.actor.orgId), visible ? inArray(decisions.eventId, visible) : undefined))
    .orderBy(desc(decisions.createdAt));
}

export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    // Neutralise spreadsheet formula injection and quote as needed.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

