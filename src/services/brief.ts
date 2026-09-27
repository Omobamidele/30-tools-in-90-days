import { formatMoneyShort, type Minor } from "@/core/money";
import { term } from "@/config/terms";
import { formatDate, relativeDue } from "@/ui/format";
import { localDateOf } from "@/core/time";
import type { ServiceCtx } from "./context";
import { getPortfolio, getPortfolioTrend } from "./exposure";
import { listOpenAlerts } from "./alerts";
import { listObligations } from "./obligations";
import { eventCountdown } from "@/ui/event-cover";
import { getLedger } from "./ledger";

// The money summary in sentences (milestone 13). The overview and the Monday brief email both
// use these functions, so the screen and the inbox can never disagree.

type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
type Trend = Awaited<ReturnType<typeof getPortfolioTrend>>;

export type MoneySummary = {
  currency: string;
  openEvents: number;
  currentMinor: Minor;
  agencyMinor: Minor;
  clientMinor: Minor;
  unassignedMinor: Minor;
  /** Live total minus the stored snapshot total 7 days ago; null without real snapshots. */
  changeMinor: Minor | null;
  /** The event whose figure moved most over the same week. */
  mover: { name: string; deltaMinor: Minor } | null;
  savingsMinor: Minor;
};

export function summariseMoney(p: Portfolio, trend: Trend): MoneySummary {
  const pts = trend.points;
  const weekAgo = pts.length > 7 ? pts[pts.length - 8].currentMinor : null;
  const mover =
    p.rows
      .map((r) => {
        const before = trend.weekAgoByEvent[r.eventId];
        return r.base && before !== null && before !== undefined ? { name: r.name, deltaMinor: r.base.currentMinor - before } : null;
      })
      .filter((m): m is { name: string; deltaMinor: number } => m !== null && m.deltaMinor !== 0)
      .sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor))[0] ?? null;
  return {
    currency: p.currency,
    openEvents: p.rows.length,
    currentMinor: p.totals.currentMinor,
    agencyMinor: p.totals.agencyMinor,
    clientMinor: p.totals.clientMinor,
    unassignedMinor: p.totals.unassignedMinor,
    changeMinor: weekAgo !== null && weekAgo > 0 ? p.totals.currentMinor - weekAgo : null,
    mover,
    savingsMinor: p.savingsMinor,
  };
}

export type MoneySentences = {
  /** Split so the screen can emphasise the amount: `${lead}${amount}${tail}`. */
  headline: { lead: string; amount: string; tail: string };
  split: string;
  trend: string | null;
  savings: string | null;
};

export function moneySentences(s: MoneySummary, eventWord: (n: number) => string): MoneySentences {
  const short = (m: number) => formatMoneyShort(m, s.currency);
  const trend =
    s.changeMinor !== null && Math.abs(s.changeMinor) >= 100
      ? `That's ${s.changeMinor < 0 ? "down" : "up"} ${short(Math.abs(s.changeMinor))} on last week${
          s.mover ? `, mostly ${s.mover.name} (${s.mover.deltaMinor < 0 ? "−" : "+"}${short(Math.abs(s.mover.deltaMinor))})` : ""
        }.`
      : null;
  return {
    headline: { lead: `If nothing changes, your ${s.openEvents} open ${eventWord(s.openEvents)} will owe suppliers about `, amount: short(s.currentMinor), tail: " in penalties." },
    split: `${short(s.agencyMinor)} of that is yours; clients cover ${short(s.clientMinor)}${
      s.unassignedMinor > 0 ? `, and ${short(s.unassignedMinor)} isn't agreed with a client yet` : ""
    }.`,
    trend,
    savings: s.savingsMinor > 0 ? `You can still save up to ${short(s.savingsMinor)} by giving rooms back before their review dates.` : null,
  };
}

export type Brief = { send: boolean; subject: string; body: string };

/**
 * The Monday money brief for whoever `ctx` is: everything is scoped by their permissions,
 * so an event manager hears only about their own events. `send` is false with nothing open.
 */
export async function buildBrief(ctx: ServiceCtx): Promise<Brief> {
  const now = ctx.now();
  const [p, trend, alerts, deadlines, ledger] = await Promise.all([getPortfolio(ctx), getPortfolioTrend(ctx, 30), listOpenAlerts(ctx), listObligations(ctx), getLedger(ctx, "quarter")]);
  if (p.rows.length === 0) return { send: false, subject: "", body: "" };

  const cfg = ctx.actor.config;
  const eventWord = (n: number) => term(cfg, "event", { plural: n !== 1, lower: true });
  const summary = summariseMoney(p, trend);
  const s = moneySentences(summary, eventWord);
  const decisions = alerts.filter((a) => a.severity === "HIGH");
  const savings = p.rows.flatMap((r) => r.savings.map((o) => ({ ...o, eventName: r.name }))).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  const payments = deadlines.filter((o) => o.kind === "PAYMENT" && o.dueAt.getTime() - now.getTime() <= 7 * 86_400_000 && (o.amountMinor ?? 0) > o.paidMinor);

  const today = localDateOf(now, ctx.actor.orgTimezone);
  const nextUp = [...p.rows].filter((r) => r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const countdown = nextUp ? eventCountdown(today, nextUp.startDate, nextUp.endDate) : null;

  const lines: string[] = [`${s.headline.lead}${s.headline.amount}${s.headline.tail}`, s.split];
  if (s.trend) lines.push(s.trend);
  lines.push("", "This week:");
  if (!decisions.length && !savings.length && !payments.length) lines.push("Nothing needs you. Every deadline this week is on track.");
  for (const a of decisions.slice(0, 3)) lines.push(`• Decide: ${a.title} (${a.eventName}).`);
  if (decisions.length > 3) lines.push(`• …and ${decisions.length - 3} more decision${decisions.length - 3 === 1 ? "" : "s"} on the overview.`);
  for (const o of savings.slice(0, 3)) {
    lines.push(
      `• Save money: give back ${o.roomNights} room night${o.roomNights === 1 ? "" : "s"} at ${o.supplierName} by ${formatDate(o.reviewDate)} to save up to ${formatMoneyShort(o.savingMinor, o.currency)} (${o.eventName}).`,
    );
  }
  for (const o of payments.slice(0, 3)) {
    const due = relativeDue(o.dueAt, o.dueTz, now).text.toLowerCase();
    const amount = o.currency ? `${formatMoneyShort(Math.max(0, (o.amountMinor ?? 0) - o.paidMinor), o.currency)} ` : "";
    lines.push(`• Pay: ${amount}to ${o.supplierName} ${due} (${o.eventName}).`);
  }
  if (nextUp && countdown) lines.push("", `Next up: ${nextUp.name}, ${countdown.value} ${countdown.label}.`);
  // What the team recorded this quarter (Money protected), only when there is something.
  const protectedParts = [
    ledger.removed.totalMinor > 0 ? `${formatMoneyShort(ledger.removed.totalMinor, ledger.currency)} of penalties removed by decisions` : null,
    ledger.billed.totalMinor > 0 ? `${formatMoneyShort(ledger.billed.totalMinor, ledger.currency)} of client changes billed` : null,
  ].filter(Boolean);
  if (protectedParts.length) lines.push("", `Recorded so far this quarter: ${protectedParts.join(", and ")}.`);

  const todo = decisions.length + savings.length + payments.length;
  return {
    send: true,
    subject: `Monday brief: ${formatMoneyShort(summary.currentMinor, summary.currency)} at stake${todo ? `, ${todo} thing${todo === 1 ? "" : "s"} to do this week` : ", nothing needs you"}`,
    body: lines.join("\n"),
  };
}
