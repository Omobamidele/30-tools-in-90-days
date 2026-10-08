import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { TZDate } from "@date-fns/tz";
import { getISOWeek, getISOWeekYear } from "date-fns";
import { accounts, csqls, notifications, signals, users } from "@/db/schema";
import { emailSender, renderEmail } from "@/adapters/email";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { env } from "@/env";
import type { ServiceCtx } from "./context";

// Monday digest (spec FR-26, A9): each person's open work and last week's results, in plain
// sentences. Deduplicated per person per ISO week; anyone can turn it off under Your account.

function isoWeek(d: Date, tz: string) {
  const t = new TZDate(d.getTime(), tz);
  return `${getISOWeekYear(t)}-W${String(getISOWeek(t)).padStart(2, "0")}`;
}

export async function sendWeeklyDigests(ctx: ServiceCtx) {
  const { db } = ctx;
  const now = ctx.now();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const week = isoWeek(now, ctx.actor.timezone);
  const cfg = ctx.actor.config;
  const cur = ctx.actor.currency;
  const people = await db.select().from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE")));
  const [openSignals, openCsqls, closed] = await Promise.all([
    db.select({ s: signals, csmId: accounts.csmId }).from(signals).innerJoin(accounts, eq(accounts.id, signals.accountId)).where(and(eq(signals.orgId, ctx.actor.orgId), eq(signals.status, "NEW"))),
    db.select().from(csqls).where(and(eq(csqls.orgId, ctx.actor.orgId), inArray(csqls.status, ["ROUTED", "ACCEPTED", "OPPORTUNITY", "RETURNED"]))),
    db.select().from(csqls).where(and(eq(csqls.orgId, ctx.actor.orgId), eq(csqls.status, "WON"), gte(csqls.closedAt, weekAgo), lt(csqls.closedAt, now))),
  ]);
  const wonTotal = closed.reduce((n, c) => n + (c.outcomeAmountMinor ?? 0), 0);
  let sent = 0;
  let skipped = 0;
  for (const u of people) {
    if ((u.preferences as { digest?: boolean }).digest === false) {
      skipped++;
      continue;
    }
    const mySignals = openSignals.filter((r) => (r.s.assigneeId ?? r.csmId) === u.id);
    const myCsqls = openCsqls.filter((c) => c.ownerId === u.id);
    const returned = openCsqls.filter((c) => c.status === "RETURNED" && c.sourcedBy === u.id);
    const lines: string[] = [];
    if (["CSM", "CS_LEAD", "ADMIN"].includes(u.role)) {
      const val = mySignals.reduce((n, r) => n + (r.s.estValueMinor ?? 0), 0);
      lines.push(mySignals.length ? `${mySignals.length} signal${mySignals.length === 1 ? " is" : "s are"} waiting for your triage, about ${formatMoneyShort(val, cur)} a year estimated.` : "No signals are waiting for your triage.");
      if (returned.length) lines.push(`${returned.length} ${returned.length === 1 ? cfg.terminology.csql : cfg.terminology.csqlPlural} came back from sellers and need${returned.length === 1 ? "s" : ""} your answer.`);
    }
    if (["SELLER", "SALES_LEAD"].includes(u.role)) {
      const routed = myCsqls.filter((c) => c.status === "ROUTED").length;
      lines.push(myCsqls.length ? `You have ${myCsqls.length} open ${myCsqls.length === 1 ? cfg.terminology.csql : cfg.terminology.csqlPlural}${routed ? `, ${routed} waiting for you to accept` : ""}.` : `You have no open ${cfg.terminology.csqlPlural}.`);
    }
    lines.push(closed.length ? `Last week the team won ${formatMoney(wonTotal, cur)} of expansion revenue from ${closed.length} ${closed.length === 1 ? cfg.terminology.csql : cfg.terminology.csqlPlural}.` : "No expansion deals from signals closed last week.");
    // Dedupe per person per week through the notifications table.
    const [row] = await db
      .insert(notifications)
      .values({ orgId: ctx.actor.orgId, userId: u.id, kind: "digest", title: `Your week in ${cfg.brand.productName}`, body: lines.join(" "), link: "/", dedupeKey: `digest:${week}`, createdAt: now, readAt: now })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!row) {
      skipped++;
      continue;
    }
    const { text, html } = renderEmail({
      productName: cfg.brand.productName,
      brandColor: cfg.brand.primaryColor,
      heading: `Your week in ${cfg.brand.productName}`,
      lines,
      action: { label: "Open your queue", url: `${env().APP_URL}/` },
      footer: "Sent every Monday. Turn it off under Your account.",
    });
    const res = await emailSender().send({ to: u.email, subject: `Your week: ${lines[0]}`, text, html, fromName: cfg.brand.productName });
    await db.update(notifications).set({ emailStatus: res.sent ? "sent" : `failed: ${res.reason}` }).where(eq(notifications.id, row.id));
    sent++;
  }
  return { sent, skipped, week };
}
