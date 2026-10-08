import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getResults, type Period } from "@/services/results";
import { formatMoneyShort } from "@/core/money";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { MoneyShort, RULE_META } from "@/ui/bits";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Results" };

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "90d", label: "Last 90 days" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export default async function ResultsPage({ searchParams }: PageProps<"/results">) {
  const sp = (await searchParams) as { period?: string };
  const period = (PERIODS.find((p) => p.key === sp.period)?.key ?? "90d") as Period;
  const ctx = await appCtx();
  const r = await getResults(ctx, period);
  const f = r.funnel;
  const c = r.currency;
  const t = ctx.actor.config.terminology;
  const own = ctx.actor.role === "CSM" || ctx.actor.role === "SELLER";
  const hours = (h: number | null) => (h === null ? "—" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

  const steps = [
    { label: "Signals raised", n: f.raised, sub: `${formatMoneyShort(f.estimatedMinor, c)} estimated` },
    { label: "Accepted by CS", n: f.accepted, sub: `${f.dismissed} dismissed` },
    { label: `${t.csqlPlural} routed`, n: f.routed, sub: "to sellers" },
    { label: "Opportunities", n: f.opportunities, sub: `${formatMoneyShort(f.pipelineMinor, c)} pipeline` },
    { label: "Won", n: f.won, sub: `${formatMoneyShort(f.wonMinor, c)} ARR` },
  ];
  const max = Math.max(1, ...steps.map((s) => s.n));

  return (
    <>
      <PageHeader
        title="Results"
        meta={own ? "Your own results. Leaders see the whole team." : "What signals turned into, from what people recorded."}
        actions={
          <>
            <div role="group" aria-label="Period" className="inline-flex flex-wrap rounded-control border border-field bg-surface p-0.5">
              {PERIODS.map((p) => (
                <Link key={p.key} href={`/results?period=${p.key}`} aria-current={period === p.key ? "true" : undefined} className={cx("rounded-[4px] px-3 py-1 text-table", period === p.key ? "bg-ink text-on-ink" : "text-muted hover:text-text")}>
                  {p.label}
                </Link>
              ))}
            </div>
            <a href={`/api/reports/results?period=${period}`} download className="inline-flex h-8 items-center rounded-control border border-field bg-surface px-3 text-body font-medium hover:bg-sunken">
              Export CSV
            </a>
          </>
        }
      />

      <section aria-labelledby="answer" className="mb-6">
        <h2 id="answer" className="max-w-4xl text-[24px] leading-8 font-medium tracking-[-0.01em]">
          {f.pipelineMinor || f.wonMinor ? (
            <>
              In {r.label}, signals created <span className="num font-semibold">{formatMoneyShort(f.pipelineMinor, c)}</span> of pipeline and{" "}
              <span className="num font-semibold">{formatMoneyShort(f.wonMinor, c)}</span> of won expansion revenue.
            </>
          ) : (
            <>Nothing recorded in {r.label} yet. Opportunities and wins appear here when sellers record them.</>
          )}
        </h2>
      </section>

      <div className="flex flex-col gap-4">
        <Panel title="From signal to revenue" id="funnel" description="Counts for the period. Each step only counts what someone recorded.">
          <ol className="grid gap-px bg-rule sm:grid-cols-5">
            {steps.map((s, i) => (
              <li key={s.label} className="bg-surface p-4">
                <p className="text-meta text-muted">
                  {i + 1}. {s.label}
                </p>
                <p className="num mt-1 text-figure font-medium">{s.n}</p>
                <div aria-hidden className="mt-2 h-1.5 rounded-full bg-sunken">
                  <div className={cx("h-full rounded-full", i === steps.length - 1 ? "bg-won" : "bg-brand")} style={{ width: `${(s.n / max) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-meta text-muted">{s.sub}</p>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="By signal type" id="types" description="A CSQL with two signal types counts under both.">
          {r.byType.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-table">
                <thead className="border-b border-rule text-left text-meta text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Signal type</th>
                    <th className="px-2 py-2 text-right font-medium">Raised</th>
                    <th className="px-2 py-2 text-right font-medium">Accepted</th>
                    <th className="px-2 py-2 text-right font-medium">Dismissed</th>
                    <th className="px-2 py-2 text-right font-medium">Opportunities</th>
                    <th className="px-2 py-2 text-right font-medium">Pipeline</th>
                    <th className="px-4 py-2 text-right font-medium">Won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {r.byType.map((x) => (
                    <tr key={x.type}>
                      <td className="px-4 py-2 font-medium">{RULE_META[x.type].label}</td>
                      <td className="num px-2 py-2 text-right">{x.raised}</td>
                      <td className="num px-2 py-2 text-right">{x.accepted}</td>
                      <td className="num px-2 py-2 text-right">{x.dismissed}</td>
                      <td className="num px-2 py-2 text-right">{x.opportunities}</td>
                      <td className="px-2 py-2 text-right">
                        <MoneyShort minor={x.pipelineMinor} currency={c} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <MoneyShort minor={x.wonMinor} currency={c} className="font-semibold" /> <span className="text-meta text-muted">({x.won})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No signals in this period" />
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { key: "csm", title: "Sourced by customer success", rows: r.byCsm, color: "text-by-cs" },
            { key: "seller", title: "Worked by sellers", rows: r.bySeller, color: "text-by-sales" },
          ].map((g) => (
            <Panel key={g.key} title={g.title} id={`by-${g.key}`}>
              {g.rows.length ? (
                <table className="w-full text-table">
                  <thead className="border-b border-rule text-left text-meta text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Person</th>
                      <th className="px-2 py-2 text-right font-medium">{t.csqlPlural}</th>
                      <th className="px-2 py-2 text-right font-medium">Pipeline</th>
                      <th className="px-4 py-2 text-right font-medium">Won</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {g.rows.map((p) => (
                      <tr key={p.name}>
                        <td className={cx("px-4 py-2 font-medium", g.color)}>{p.name}</td>
                        <td className="num px-2 py-2 text-right">{p.routed}</td>
                        <td className="px-2 py-2 text-right">
                          <MoneyShort minor={p.pipelineMinor} currency={c} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <MoneyShort minor={p.wonMinor} currency={c} className="font-semibold" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="Nothing routed in this period" />
              )}
            </Panel>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Why signals were dismissed" id="dismissed" description="RevOps uses this to tune rules.">
            {r.dismissReasons.length ? (
              <ul className="divide-y divide-rule">
                {r.dismissReasons.map((d) => (
                  <li key={d.reason} className="flex justify-between gap-3 px-4 py-2 text-table">
                    <span>{d.reason}</span>
                    <span className="num">{d.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No dismissals in this period" />
            )}
          </Panel>
          <Panel title="Response times" id="speed">
            <dl className="divide-y divide-rule">
              <div className="flex justify-between gap-3 px-4 py-2.5 text-table">
                <dt>Median time from signal to triage</dt>
                <dd className="num">{hours(r.responsiveness.medianTriageHours)}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5 text-table">
                <dt>Signals triaged before their deadline</dt>
                <dd className="num">{r.responsiveness.triageOnTimePct === null ? "—" : `${r.responsiveness.triageOnTimePct}%`}</dd>
              </div>
              <div className="flex justify-between gap-3 px-4 py-2.5 text-table">
                <dt>Median time for a seller to accept</dt>
                <dd className="num">{hours(r.responsiveness.medianSellerHours)}</dd>
              </div>
            </dl>
          </Panel>
        </div>
        <p className="text-meta text-muted">Only recorded outcomes count: pipeline is what sellers recorded as an opportunity, won is what they recorded as closed. Estimated values are shown separately and never added to won revenue.</p>
      </div>
    </>
  );
}
