import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getResults, periodRange, type Period } from "@/services/results";
import { listCsqls } from "@/services/csqls";
import { formatMoneyShort } from "@/core/money";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { Avatar, CompanyLogo, RULE_META, TypeBadge } from "@/ui/bits";
import { ago } from "@/ui/format";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Results" };

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "90d", label: "Last 90 days" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

// Results as a story (docs/09 rev. 3, and the locked rule in CLAUDE.md): what customer success
// spotted, what sellers won, and the people behind each win. Only recorded outcomes count.

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  const sp = (await searchParams) as { period?: string };
  const period = (PERIODS.find((p) => p.key === sp.period)?.key ?? "90d") as Period;
  const ctx = await appCtx();
  const [r, csqls] = await Promise.all([getResults(ctx, period), listCsqls(ctx, {})]);
  const f = r.funnel;
  const c = r.currency;
  const t = ctx.actor.config.terminology;
  const now = ctx.now();
  const { from } = periodRange(period, now, ctx.actor.timezone);
  const own = ctx.actor.role === "CSM" || ctx.actor.role === "SELLER";
  const money = (m: number) => formatMoneyShort(m, c);
  const hours = (h: number | null) => (h === null ? "no data yet" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);
  const wins = csqls
    .filter((x) => x.csql.status === "WON" && x.csql.closedAt && (!from || x.csql.closedAt >= from))
    .sort((a, b) => (b.csql.closedAt?.getTime() ?? 0) - (a.csql.closedAt?.getTime() ?? 0));

  const steps = [
    { n: f.raised, label: "customers spotted" },
    { n: f.accepted, label: "accepted by customer success" },
    { n: f.routed, label: "handed to sellers" },
    { n: f.opportunities, label: f.opportunities === 1 ? "became an opportunity" : "became opportunities" },
    { n: f.won, label: "won" },
  ];

  return (
    <>
      <PageHeader
        title="Results"
        meta={own ? "Your own results. Leaders see the whole team." : "What the team's signals turned into, from what people recorded."}
        actions={
          <>
            <div role="group" aria-label="Period" className="inline-flex flex-wrap rounded-control bg-sunken p-0.5">
              {PERIODS.map((p) => (
                <Link key={p.key} href={`/results?period=${p.key}`} aria-current={period === p.key ? "true" : undefined} className={cx("rounded-[6px] px-3 py-1 text-table", period === p.key ? "bg-surface font-medium text-text shadow-card" : "text-muted hover:text-text")}>
                  {p.label}
                </Link>
              ))}
            </div>
            <a href={`/api/reports/results?period=${period}`} download className="inline-flex h-8 items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium shadow-card hover:bg-hover">
              Export CSV
            </a>
          </>
        }
      />

      <section aria-labelledby="answer" className="mb-10 max-w-3xl">
        <h2 id="answer" className="text-display font-medium text-balance">
          {f.raised
            ? `In ${r.label}, customer success spotted ${f.raised} ${f.raised === 1 ? "customer" : "customers"} ready for more. Sellers won ${f.won} of them${f.won ? `, worth ${money(f.wonMinor)} a year` : ""}${f.pipelineMinor ? `, and ${money(f.pipelineMinor)} is still in play` : ""}.`
            : `Nothing was spotted in ${r.label}. Signals appear here once detection raises them.`}
        </h2>
      </section>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="journey">
          <h2 id="journey" className="text-section font-semibold">
            From a signal to a win
          </h2>
          <ol className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s.label} className="relative">
                {i > 0 ? <span aria-hidden className="absolute top-5 right-[calc(100%-4px)] hidden h-px w-[calc(100%-44px)] bg-rule-strong sm:block" /> : null}
                <span className={cx("font-display relative inline-flex size-10 items-center justify-center rounded-full text-section font-semibold", i === steps.length - 1 ? "bg-brand text-white" : "bg-brand-tint text-brand")}>{s.n}</span>
                <span className="mt-2 block text-table">{s.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-meta text-muted">{f.dismissed} dismissed with a reason, which tunes the rules. Each step only counts what someone recorded.</p>
        </section>

        <section aria-labelledby="wins">
          <h2 id="wins" className="text-section font-semibold">
            Wins
          </h2>
          {wins.length ? (
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {wins.map(({ csql: w, account, ownerName, sourcedByName }) => (
                <li key={w.id}>
                  <Link href={`/csqls/${w.id}`} className="block h-full rounded-panel border border-rule bg-surface p-5 shadow-card hover:border-rule-strong hover:shadow-lift">
                    <span className="flex items-center gap-3">
                      <CompanyLogo name={account.name} size={32} />
                      <span className="min-w-0 flex-1 font-medium">{account.name}</span>
                      <span className="text-meta text-muted">{w.outcomeAmountMinor ? `${money(w.outcomeAmountMinor)} a year` : null}</span>
                    </span>
                    <span className="mt-3 block line-clamp-3 text-body">“{w.handoffNote}”</span>
                    <span className="mt-3 flex items-center gap-2 text-meta text-muted">
                      <span className="flex -space-x-1">
                        <Avatar name={sourcedByName} size={20} />
                        <Avatar name={ownerName} size={20} />
                      </span>
                      {sourcedByName?.split(" ")[0]} spotted it, {ownerName?.split(" ")[0]} won it {w.closedAt ? ago(w.closedAt, now) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-table text-muted">No wins recorded in {r.label} yet.</p>
          )}
        </section>

        <section aria-labelledby="types">
          <h2 id="types" className="text-section font-semibold">
            Which signals lead somewhere
          </h2>
          <p className="mt-1 text-meta text-muted">A {t.csql} with two kinds of signal counts under both.</p>
          {r.byType.length ? (
            <ul className="mt-3 divide-y divide-rule rounded-panel border border-rule">
              {r.byType.map((x) => (
                <li key={x.type} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <TypeBadge type={x.type} size={30} />
                  <span className="min-w-40 flex-1 font-medium">{RULE_META[x.type].plain}</span>
                  <span className="text-table text-muted">
                    {x.raised} spotted, {x.accepted} accepted, {x.dismissed} dismissed, {x.opportunities} {x.opportunities === 1 ? "opportunity" : "opportunities"}
                  </span>
                  <span className="w-full text-table sm:w-48 sm:text-right">{x.won ? `${x.won} won, ${money(x.wonMinor)} a year` : <span className="text-muted">No wins yet</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-table text-muted">No signals in this period.</p>
          )}
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-2">
          {[
            { key: "csm", title: "Who spotted them", rows: r.byCsm, verb: "handed over" },
            { key: "seller", title: "Who worked them", rows: r.bySeller, verb: "worked" },
          ].map((g) => (
            <section key={g.key} aria-labelledby={`by-${g.key}`}>
              <h2 id={`by-${g.key}`} className="text-section font-semibold">
                {g.title}
              </h2>
              {g.rows.length ? (
                <ul className="mt-3 flex flex-col gap-1">
                  {g.rows.map((p) => (
                    <li key={p.name} className="flex items-center gap-3 rounded-control px-2 py-2">
                      <Avatar name={p.name} size={32} className="ring-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{p.name}</span>
                        <span className="block text-meta text-muted">
                          {p.routed} {t.csqlPlural} {g.verb}
                          {p.pipelineMinor ? `, ${money(p.pipelineMinor)} in play` : ""}
                        </span>
                      </span>
                      <span className="text-table">{p.wonMinor ? `${money(p.wonMinor)} won` : <span className="text-muted">No wins yet</span>}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-table text-muted">Nothing handed over in this period.</p>
              )}
            </section>
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Panel title="Why signals were dismissed" id="dismissed" description="RevOps uses this to tune rules.">
            {r.dismissReasons.length ? (
              <ul className="divide-y divide-rule">
                {r.dismissReasons.map((d) => (
                  <li key={d.reason} className="flex justify-between gap-3 px-5 py-2.5 text-table">
                    <span>{d.reason}</span>
                    <span className="text-muted">{d.n === 1 ? "once" : `${d.n} times`}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No dismissals in this period" />
            )}
          </Panel>
          <Panel title="How quickly the team moves" id="speed">
            <ul className="space-y-2 px-5 py-4 text-table">
              <li>Customer success usually reviews a signal within {hours(r.responsiveness.medianTriageHours)}.</li>
              <li>{r.responsiveness.triageOnTimePct === null ? "No signals reviewed yet." : `${r.responsiveness.triageOnTimePct}% of signals were reviewed before their deadline.`}</li>
              <li>Sellers usually pick up a handoff within {hours(r.responsiveness.medianSellerHours)}.</li>
            </ul>
          </Panel>
        </div>
        <p className="text-meta text-muted">Only recorded outcomes count: in play is what sellers recorded as an opportunity, won is what they recorded as closed. Estimates are never added to won revenue.</p>
      </div>
    </>
  );
}
