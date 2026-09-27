import Link from "next/link";
import type { ServiceCtx } from "@/services/context";
import { getPortfolio, getPortfolioTrend, type PortfolioRow } from "@/services/exposure";
import { listObligations } from "@/services/obligations";
import { loadFx } from "@/services/fx";
import { convertMinor } from "@/core/money";
import { term } from "@/config/terms";
import { Panel } from "@/ui/page";
import { Status, healthTone } from "@/ui/status";
import { Kpi } from "@/ui/kpi";
import { MoneyShort } from "@/ui/money";
import { TrendChart } from "@/ui/charts/trend-chart";
import { formatDate, formatDateRange, relativeDue } from "@/ui/format";
import { cx } from "@/ui/cx";
import { isMarker } from "@/core/obligations/generate";
import { listOpenAlerts } from "@/services/alerts";
import { AlertList } from "./alerts/alert-list";
import { toAlertItems } from "./alerts/to-items";
import { localDateOf } from "@/core/time";
import { findCover } from "@/config/imagery";
import { CoverThumb, Photo } from "@/ui/photo";
import { eventCountdown } from "@/ui/event-cover";
import { eventHealth, eventHealthLabels, type EventHealth } from "@/core/exposure/status";
import { deadlineWords, money as words } from "@/ui/copy";
import { moneySentences, summariseMoney } from "@/services/brief";

type Deadline = Awaited<ReturnType<typeof listObligations>>[number];

// Overview (docs/09 § Money, milestone 13): the answer in sentences first, then three calm
// figures, then what to do. Summary money is rounded ($98.6k); exact figures live on each
// event's Exposure tab. Order: how much is at risk, and whose? what's next? what do I do this week?
export async function Portfolio({ ctx }: { ctx: ServiceCtx }) {
  const now = ctx.now();
  const [p, deadlines, fx, openAlerts, trend] = await Promise.all([
    getPortfolio(ctx),
    listObligations(ctx),
    loadFx(ctx.db, ctx.actor.orgId),
    listOpenAlerts(ctx),
    getPortfolioTrend(ctx, 30),
  ]);
  const alertItems = await toAlertItems(ctx, openAlerts);
  const ccy = p.currency;
  const cfg = ctx.actor.config;
  const eventWord = (n: number) => term(cfg, "event", { plural: n !== 1, lower: true });

  // Payments due in the next 30 days, converted to the org currency.
  const in30 = deadlines.filter((o) => o.kind === "PAYMENT" && o.dueAt.getTime() - now.getTime() <= 30 * 86_400_000);
  let paymentsDue = 0;
  let paymentsMissingFx = false;
  for (const o of in30) {
    const outstanding = Math.max(0, (o.amountMinor ?? 0) - o.paidMinor);
    const rate = o.currency ? fx.rate(o.currency, ccy) : null;
    if (rate === null) paymentsMissingFx = true;
    else paymentsDue += convertMinor(outstanding, rate);
  }
  const overdue = deadlines.filter((o) => o.dueAt < now && !isMarker(o.kind));
  const nextByEvent = new Map<string, Deadline>();
  for (const o of deadlines) if (o.dueAt >= now && !nextByEvent.has(o.eventId)) nextByEvent.set(o.eventId, o);
  const nextStep = deadlines.find((o) => o.kind === "TIER_CHANGE" && o.dueAt >= now);

  // One plain word per event (src/core/exposure/status.ts).
  const week = 7 * 86_400_000;
  const health = new Map<string, EventHealth>();
  for (const r of p.rows) {
    const urgent = deadlines.some(
      (o) =>
        o.eventId === r.eventId &&
        ((o.dueAt < now && !isMarker(o.kind)) || ((o.kind === "TIER_CHANGE" || o.kind === "PAYMENT") && o.dueAt >= now && o.dueAt.getTime() - now.getTime() <= week)),
    );
    health.set(
      r.eventId,
      eventHealth({
        alertSeverities: alertItems.filter((a) => a.eventId === r.eventId && a.severity !== "INFO").map((a) => a.severity as "HIGH" | "WATCH"),
        overThreshold: r.exposure.overThreshold,
        incomplete: !r.exposure.complete || r.base === null,
        urgentDeadline: urgent,
      }),
    );
  }
  const needDecision = [...health.values()].filter((h) => h === "DECIDE").length;

  // The answer in sentences, from the same builder as the Monday brief email (src/services/brief.ts),
  // so the screen and the inbox never disagree. The week's change comes from stored snapshots only.
  const pts = trend.points;
  const said = moneySentences(summariseMoney(p, trend), eventWord);

  // The soonest event that hasn't finished: what the team is working towards right now.
  const today = localDateOf(now, ctx.actor.orgTimezone);
  const nextUp = [...p.rows].filter((r) => r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const rows = [...p.rows].sort(
    (a, b) => rank(health.get(a.eventId)) - rank(health.get(b.eventId)) || (b.base?.currentMinor ?? 0) - (a.base?.currentMinor ?? 0),
  );

  const savings = p.rows
    .flatMap((r) => r.savings.map((s) => ({ ...s, eventId: r.eventId, eventName: r.name })))
    .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  const payments14 = deadlines
    .filter((o) => o.kind === "PAYMENT" && o.dueAt.getTime() - now.getTime() <= 14 * 86_400_000 && (o.amountMinor ?? 0) > o.paidMinor)
    .slice(0, 4);
  const decisions = alertItems.filter((a) => a.severity === "HIGH");
  const todoCount = decisions.length + savings.length + payments14.length;
  const mark = "whitespace-nowrap underline decoration-on-canvas-mark decoration-2 underline-offset-[6px]";

  return (
    <div className="flex flex-col gap-8">
      {/* The answer, in a sentence. It sits on the canvas, so it uses the on-canvas tokens. */}
      <section aria-labelledby="answer" className="max-w-4xl">
        <h2 id="answer" className="font-display text-[26px] leading-[34px] font-medium text-on-canvas md:text-[30px] md:leading-[40px]">
          {said.headline.lead}
          <span className={mark}>{said.headline.amount}</span>
          {said.headline.tail}
        </h2>
        <p className="mt-3 text-section text-on-canvas-muted">
          {said.split}
          {said.trend ? ` ${said.trend}` : null}
        </p>
        {said.savings ? (
          <p className="mt-2 text-section font-medium text-on-canvas">
            {said.savings}{" "}
            <a href="#what-to-do" className="underline decoration-on-canvas-mark underline-offset-4 hover:decoration-2">
              See how
            </a>
          </p>
        ) : null}
      </section>

      <div className={cx("grid grid-cols-1 gap-5", nextUp && "xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]")}>
        {nextUp ? <NextUp row={nextUp} ccy={ccy} today={today} next={nextByEvent.get(nextUp.eventId) ?? null} now={now} /> : null}
        <div className={cx("grid grid-cols-1 gap-4 sm:grid-cols-3", nextUp && "xl:grid-cols-1")}>
          <Kpi label={words.current.plain} term={words.current.term} value={<MoneyShort minor={p.totals.currentMinor} currency={ccy} />}>
            <p className="text-table text-muted">
              {words.yours} <MoneyShort minor={p.totals.agencyMinor} currency={ccy} className="font-medium text-ink" /> · {words.clients}{" "}
              <MoneyShort minor={p.totals.clientMinor} currency={ccy} className="font-medium text-ink" />
            </p>
          </Kpi>
          <Kpi label={words.cancel.plain} term={words.cancel.term} value={<MoneyShort minor={p.totals.cancellationMinor} currency={ccy} />}>
            <p className="text-table text-muted">
              {nextStep ? (
                <>
                  Next rise {relativeDue(nextStep.dueAt, nextStep.dueTz, now).text.toLowerCase()} ·{" "}
                  <Link href={`/events/${nextStep.eventId}`} className="text-ink hover:underline">
                    {nextStep.eventName}
                  </Link>
                </>
              ) : (
                "No fee rises ahead"
              )}
            </p>
          </Kpi>
          <Kpi label={words.payments.plain} term={words.payments.term} value={<MoneyShort minor={paymentsDue} currency={ccy} />}>
            <p className="text-table text-muted">
              {in30.length} payment{in30.length === 1 ? "" : "s"}
              {paymentsMissingFx ? " · some left out: exchange rate missing" : ""} ·{" "}
              {overdue.length ? (
                <Link href="/deadlines?who=all" className="font-medium text-risk hover:underline">
                  {overdue.length} overdue
                </Link>
              ) : (
                <span className="text-settled">nothing overdue</span>
              )}
            </p>
          </Kpi>
        </div>
      </div>

      {p.incompleteEvents ? (
        <p data-surface className="flex items-center gap-2 rounded-panel border border-rule bg-surface px-4 py-2.5 text-table text-muted">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-watch" />
          <span>
            <strong className="font-medium text-ink">
              {p.incompleteEvents} {eventWord(p.incompleteEvents)} with figures still missing
            </strong>
            {p.missingFx.length ? ` (no exchange rate for ${p.missingFx.join(", ")})` : ""}. The totals above leave out what can&apos;t be worked out yet.
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title={`Your ${eventWord(2)}`}
            description={
              needDecision
                ? `${needDecision} need${needDecision === 1 ? "s" : ""} a decision. Open one to see every figure behind it.`
                : "Open one to see every figure behind it."
            }
          >
            <ul className="divide-y divide-rule">
              {rows.map((r) => {
                const h = health.get(r.eventId) ?? "ON_TRACK";
                const next = nextByEvent.get(r.eventId);
                const rel = next ? relativeDue(next.dueAt, next.dueTz, now) : null;
                return (
                  <li key={r.eventId} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-sunken/50 sm:flex-nowrap">
                    <CoverThumb photo={findCover(r.coverImage)} size={44} />
                    <div className="min-w-0 flex-1 basis-[calc(100%-60px)] sm:basis-auto">
                      <Link href={`/events/${r.eventId}`} className="block truncate font-medium after:absolute after:inset-0 after:content-[''] hover:underline">
                        {r.name}
                      </Link>
                      <p className="truncate text-meta text-faint">
                        {r.clientName} · {formatDateRange(r.startDate, r.endDate)}
                      </p>
                      <p className="mt-1 truncate text-meta text-muted">
                        {next && rel ? `${deadlineWords[next.kind]} ${rel.text.toLowerCase()}` : "No deadlines open"}
                      </p>
                    </div>
                    <div className="flex w-full shrink-0 items-center justify-between gap-3 pl-[60px] sm:w-auto sm:flex-col sm:items-end sm:gap-1.5 sm:pl-0">
                      <Status tone={healthTone[h]}>{eventHealthLabels[h]}</Status>
                      <span className="text-meta text-faint">
                        {r.base ? (
                          <>
                            <MoneyShort minor={r.base.currentMinor} currency={ccy} className={cx("text-table font-medium", r.exposure.overThreshold ? "text-risk" : "text-ink")} /> if
                            nothing changes
                          </>
                        ) : (
                          "Exchange rate missing"
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <details className="group panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-table font-medium text-ink">
              <span>
                Show the 30-day chart
                <span className="block text-meta font-normal text-faint">Penalties if nothing changes, from daily snapshots, in {ccy}</span>
              </span>
              <span aria-hidden className="text-lg leading-none text-faint transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="border-t border-rule px-3 pt-3">
              <TrendChart points={pts.map((x) => ({ date: x.date, value: x.currentMinor }))} currency={ccy} label={words.current.plain} />
            </div>
          </details>
        </div>

        <div id="what-to-do" className="scroll-mt-20">
          <Panel title="What to do this week" description={todoCount ? `${todoCount} thing${todoCount === 1 ? "" : "s"}, most urgent first` : "Nothing needs you this week"}>
            {decisions.length ? (
              <section aria-labelledby="todo-decide">
                <h3 id="todo-decide" className={todoHeading}>
                  Decide
                </h3>
                <AlertList alerts={decisions} showEvent limit={3} />
              </section>
            ) : null}
            {savings.length ? (
              <section aria-labelledby="todo-save" className="border-t border-rule">
                <h3 id="todo-save" className={todoHeading}>
                  Save money
                </h3>
                <ul className="divide-y divide-rule">
                  {savings.slice(0, 4).map((s) => (
                    <li key={`${s.contractId}-${s.blockName}`} className="px-5 py-3 text-table">
                      <p>
                        Give back <span className="font-medium">{s.roomNights} room night{s.roomNights === 1 ? "" : "s"}</span> at {s.supplierName} by{" "}
                        <span className="font-medium">{formatDate(s.reviewDate)}</span>
                      </p>
                      <p className="mt-0.5 text-meta text-muted">
                        Saves up to <MoneyShort minor={s.savingMinor} currency={s.currency} className="font-semibold text-settled" /> ·{" "}
                        <Link href={`/events/${s.eventId}/exposure`} className="hover:text-ink hover:underline">
                          {s.eventName}
                        </Link>
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {payments14.length ? (
              <section aria-labelledby="todo-pay" className="border-t border-rule">
                <h3 id="todo-pay" className={todoHeading}>
                  Pay
                </h3>
                <ul className="divide-y divide-rule">
                  {payments14.map((o) => {
                    const rel = relativeDue(o.dueAt, o.dueTz, now);
                    return (
                      <li key={o.id} className="flex items-start justify-between gap-3 px-5 py-3 text-table">
                        <span className="min-w-0">
                          <span className="block truncate">{o.supplierName}</span>
                          <span className="block truncate text-meta text-faint">{o.eventName}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          {o.currency ? <MoneyShort minor={Math.max(0, (o.amountMinor ?? 0) - o.paidMinor)} currency={o.currency} className="font-medium" /> : null}
                          <span className={cx("block text-meta", o.dueAt < now || rel.days <= 7 ? "text-risk" : "text-muted")}>{rel.text}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
            <p className="border-t border-rule px-5 py-3 text-table">
              <Link href="/deadlines?who=all" className="font-medium text-brand">
                Every deadline
              </Link>
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const todoHeading = "px-5 pt-4 text-meta font-semibold tracking-[0.06em] text-faint uppercase";
const rank = (h: EventHealth | undefined) => (h === "DECIDE" ? 0 : h === "WATCH" ? 1 : 2);

/**
 * Overview hero (docs/09 § Layout signatures): the next event on its cover photo, with the
 * three things a director asks about it, in plain words. The whole card opens the event.
 * Figures are in the organisation currency (`ccy`), like the rest of the overview.
 */
function NextUp({ row, ccy, today, next, now }: { row: PortfolioRow; ccy: string; today: string; next: Deadline | null; now: Date }) {
  const countdown = eventCountdown(today, row.startDate, row.endDate);
  const rel = next ? relativeDue(next.dueAt, next.dueTz, now) : null;
  const saving = row.savings[0];
  const light = "text-[#d5dae3]";
  return (
    <section
      aria-labelledby="next-up-title"
      data-canvas="photo"
      className="on-photo photo-card relative isolate flex min-h-[320px] flex-col justify-between gap-8 overflow-hidden rounded-panel bg-midnight p-6 text-white md:p-7"
    >
      <Photo photo={findCover(row.coverImage)} sizes="(min-width: 1280px) 720px, 100vw" priority className="-z-10" />
      <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--scrim-feature)" }} />
      <div className="flex items-start justify-between gap-4">
        <p className={cx("flex items-center gap-2 text-meta font-semibold tracking-[0.08em] uppercase", light)}>
          <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent" />
          Next up
        </p>
        {countdown ? (
          <p className="text-right leading-none">
            <span className="num block font-display text-hero font-medium">{countdown.value}</span>
            <span className={cx("text-meta", light)}>{countdown.label}</span>
          </p>
        ) : null}
      </div>
      <div>
        <h2 id="next-up-title" className="font-display text-hero font-medium">
          <Link href={`/events/${row.eventId}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
            {row.name}
          </Link>
        </h2>
        <p className={cx("mt-2 text-table", light)}>
          {row.clientName} · {formatDateRange(row.startDate, row.endDate)}
          {row.destination ? ` · ${row.destination}` : ""}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/15 pt-4 sm:grid-cols-3">
          <div>
            <dt className={cx("text-meta", light)}>{words.current.plain}</dt>
            <dd className="mt-0.5 font-display text-section font-medium">
              {row.base ? <MoneyShort minor={row.base.currentMinor} currency={ccy} /> : "Exchange rate missing"}
              {row.exposure.overThreshold ? <span className="ml-2 font-sans text-meta font-semibold text-[#fda29b]">{words.overLimit}</span> : null}
            </dd>
          </div>
          <div>
            <dt className={cx("text-meta", light)}>{words.cancel.plain}</dt>
            <dd className="mt-0.5 font-display text-section font-medium">{row.base ? <MoneyShort minor={row.base.cancellationMinor} currency={ccy} /> : "–"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className={cx("text-meta", light)}>Next deadline</dt>
            <dd className="mt-0.5 truncate text-table font-medium" title={next?.label}>
              {next && rel ? (
                <>
                  {deadlineWords[next.kind]} <span className={rel.days <= 7 ? "text-[#fda29b]" : light}>{rel.text.toLowerCase()}</span>
                </>
              ) : (
                "None open"
              )}
            </dd>
          </div>
        </dl>
        {saving ? (
          <p className={cx("mt-4 text-table", light)}>
            <span className="font-medium text-white">
              Give back {saving.roomNights} room night{saving.roomNights === 1 ? "" : "s"} by {formatDate(saving.reviewDate)}
            </span>{" "}
            to save up to <MoneyShort minor={saving.savingMinor} currency={saving.currency} className="font-medium text-white" />.
          </p>
        ) : null}
      </div>
    </section>
  );
}
