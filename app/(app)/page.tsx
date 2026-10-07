import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { csqlLabel, listCsqls } from "@/services/csqls";
import { getResults } from "@/services/results";
import { calendarOf } from "@/services/org";
import { requireActor } from "@/auth/session";
import { formatMoneyShort } from "@/core/money";
import { deadlineState } from "@/core/business-time";
import type { Trace } from "@/core/rules/types";
import type { Opportunity } from "@/services/csqls";
import { getDb } from "@/db/client";
import { usageSnapshots } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ButtonLink, EmptyState, Panel } from "@/ui/page";
import { MoneyShort, RuleTag, Status } from "@/ui/bits";
import { SignalTrace } from "@/ui/trace";
import { ago, deadlineText, formatDateTime } from "@/ui/format";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const ctx = await appCtx();
  const actor = await requireActor();
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;
  const t = ctx.actor.config.terminology;
  const role = ctx.actor.role;
  const isCs = role === "CSM" || role === "CS_LEAD";
  const isSeller = role === "SELLER" || role === "SALES_LEAD";

  const [results, open, allCsqls, freshness] = await Promise.all([
    getResults(ctx, "90d"),
    listSignals(ctx, { status: ["NEW"], who: role === "CSM" ? "mine" : "all" }),
    listCsqls(ctx, {}),
    getDb()
      .select({ latest: sql<string | null>`max(${usageSnapshots.date})::text`, simulated: sql<number>`count(*) filter (where ${usageSnapshots.source} = 'SIMULATED')::int`, accounts: sql<number>`count(distinct ${usageSnapshots.accountId})::int` })
      .from(usageSnapshots)
      .where(and(eq(usageSnapshots.orgId, ctx.actor.orgId))),
  ]);
  const f = results.funnel;
  const waitingSellers = allCsqls.filter((r) => r.csql.status === "ROUTED");
  const myCsqls = allCsqls.filter((r) => r.csql.ownerId === ctx.actor.userId && ["ROUTED", "ACCEPTED", "OPPORTUNITY"].includes(r.csql.status));
  const returned = allCsqls.filter((r) => r.csql.status === "RETURNED" && (r.csql.sourcedBy === ctx.actor.userId || role === "CS_LEAD" || role === "ADMIN"));
  const escalated = [
    ...open.filter((r) => deadlineState(new Date(r.signal.triageDueAt.getTime() - 2 * 86_400_000), r.signal.triageDueAt, now, cal) === "ESCALATE").map((r) => ({ href: `/signals/${r.signal.id}`, label: `${r.account.name}: signal waiting for triage`, who: r.triagerName ?? "No CSM" })),
    ...allCsqls
      .filter((r) => (r.csql.status === "ROUTED" || r.csql.status === "RETURNED") && r.csql.dueAt && r.csql.clockStartedAt && deadlineState(r.csql.clockStartedAt, r.csql.dueAt, now, cal) === "ESCALATE")
      .map((r) => ({ href: `/csqls/${r.csql.id}`, label: `${csqlLabel(t.csql, r.csql.number)} ${r.account.name}: ${r.csql.status === "ROUTED" ? "waiting for the seller" : "returned, waiting for the CSM"}`, who: r.csql.status === "ROUTED" ? r.ownerName ?? "Unassigned" : r.sourcedByName })),
  ];
  const leader = role === "CS_LEAD" || role === "SALES_LEAD" || role === "ADMIN";
  const recent = allCsqls.filter((r) => ["WON", "LOST"].includes(r.csql.status)).sort((a, b) => (b.csql.closedAt?.getTime() ?? 0) - (a.csql.closedAt?.getTime() ?? 0)).slice(0, 5);
  const fresh = freshness[0];

  const sentence =
    f.pipelineMinor > 0 || f.wonMinor > 0 ? (
      <>
        In the last 90 days, signals created <Strong>{formatMoneyShort(f.pipelineMinor, currency)}</Strong> of expansion pipeline;{" "}
        <Strong>{formatMoneyShort(f.wonMinor, currency)}</Strong> has been won.
      </>
    ) : (
      <>No signals have turned into pipeline in the last 90 days.</>
    );

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="answer" className="pt-2">
        <p className="text-table text-muted">
          {greeting(now, ctx.actor.timezone)}, {actor.name.split(" ")[0]}
        </p>
        <h1 id="answer" className="mt-1 max-w-4xl text-display font-medium">
          {sentence}
        </h1>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-body">
          <Figure label="Waiting for triage" value={`${open.length}`} extra={open.length ? `${formatMoneyShort(open.reduce((n, r) => n + (r.signal.estValueMinor ?? 0), 0), currency)} est.` : undefined} href="/signals" />
          <Figure label="Waiting for sellers" value={`${waitingSellers.length}`} href="/csqls" />
          <Figure label="Won, last 90 days" value={formatMoneyShort(f.wonMinor, currency)} extra={`${f.won} ${f.won === 1 ? t.csql : t.csqlPlural}`} href="/results" />
        </dl>
      </section>

      {leader && escalated.length ? (
        <Panel title="Needs reassigning" id="escalated" description="More than two business days past the deadline.">
          <ul className="divide-y divide-rule">
            {escalated.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-table hover:bg-sunken/60">
                  <span className="font-medium">{e.label}</span>
                  <Status tone="risk">With {e.who}</Status>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {isCs || role === "ADMIN" || role === "REVOPS" || role === "EXEC" ? (
          <Panel
            title={role === "CSM" ? "Your top signals" : "Top signals"}
            id="top"
            actions={
              <ButtonLink href="/signals" size="sm">
                Open queue
              </ButtonLink>
            }
          >
            {open.length ? (
              <ul className="divide-y divide-rule">
                {open.slice(0, 6).map(({ signal: s, account, triagerName }) => {
                  const due = deadlineText(new Date(s.triageDueAt.getTime() - 2 * 86_400_000), s.triageDueAt, now, cal);
                  return (
                    <li key={s.id}>
                      <Link href={`/signals/${s.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-sunken/60 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{account.name}</span>
                            <RuleTag type={s.type} />
                          </span>
                          <span className="mt-0.5 block truncate text-table text-muted">{s.explanation}</span>
                        </span>
                        <span className="hidden sm:block">
                          <SignalTrace trace={s.trace as Trace | null} width={120} height={30} />
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <MoneyShort minor={s.estValueMinor} currency={currency} className="font-medium" empty="—" />
                          <Status tone={due.tone} className="text-meta">
                            {due.text}
                          </Status>
                          {role !== "CSM" ? <span className="text-meta text-muted">{triagerName ?? "No CSM"}</span> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No new signals">Signals appear when usage crosses one of your rules. Detection runs every morning and after each usage upload.</EmptyState>
            )}
          </Panel>
        ) : null}

        {isSeller ? (
          <Panel title={`${t.csqlPlural} for you`} id="mine" actions={<ButtonLink href="/csqls" size="sm">All {t.csqlPlural}</ButtonLink>}>
            {myCsqls.length ? (
              <ul className="divide-y divide-rule">
                {myCsqls.map(({ csql: c, account, sourcedByName }) => {
                  const due = c.status === "ROUTED" && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
                  return (
                    <li key={c.id}>
                      <Link href={`/csqls/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-sunken/60">
                        <span>
                          <span className="font-mono text-meta text-muted">{csqlLabel(t.csql, c.number)}</span>
                          <span className="block font-semibold">{account.name}</span>
                          <span className="text-meta text-muted">From {sourcedByName}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <MoneyShort minor={(c.opportunity as Opportunity | null)?.amountMinor ?? c.adjustedValueMinor ?? c.estValueMinor} currency={currency} className="font-medium" empty="—" />
                          {due ? <Status tone={due.tone}>{due.text}</Status> : <span className="text-meta text-muted capitalize">{c.status.toLowerCase()}</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title={`No open ${t.csqlPlural} for you`}>Customer success routes accepted signals here, with a note and the evidence.</EmptyState>
            )}
          </Panel>
        ) : null}

        <div className="flex flex-col gap-4">
          {returned.length ? (
            <Panel title="Returned to customer success" id="returned">
              <ul className="divide-y divide-rule">
                {returned.map(({ csql: c, account }) => (
                  <li key={c.id}>
                    <Link href={`/csqls/${c.id}`} className="block px-4 py-2.5 text-table hover:bg-sunken/60">
                      <span className="font-medium">{account.name}</span>
                      <span className="block text-muted">{c.returnReason}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Recent outcomes" id="outcomes" actions={<ButtonLink href="/results" size="sm">Results</ButtonLink>}>
            {recent.length ? (
              <ul className="divide-y divide-rule">
                {recent.map(({ csql: c, account, ownerName }) => (
                  <li key={c.id} className="px-4 py-2.5 text-table">
                    <Link href={`/csqls/${c.id}`} className="hover:underline">
                      {c.status === "WON" ? (
                        <>
                          <span className="font-medium">{account.name}</span> bought <MoneyShort minor={c.outcomeAmountMinor} currency={currency} /> more a year
                        </>
                      ) : (
                        <>
                          <span className="font-medium">{account.name}</span> said no: {c.outcomeReason}
                        </>
                      )}
                    </Link>
                    <span className="block text-meta text-muted">
                      {ownerName} · {c.closedAt ? ago(c.closedAt, now) : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No outcomes yet">Won and lost {t.csqlPlural} appear here when sellers record them.</EmptyState>
            )}
          </Panel>
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-rule pt-3 text-meta text-muted">
        <span>
          Usage last received {fresh?.latest ? `for ${fresh.latest}` : "never"} · {fresh?.accounts ?? 0} accounts reporting
        </span>
        <span>Updated {formatDateTime(now, ctx.actor.timezone)}</span>
        {fresh && fresh.simulated > 0 ? <span className="font-medium text-text">Demo workspace: usage is simulated, and the company is fictional.</span> : null}
      </footer>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="num font-mono font-semibold text-brand">{children}</span>;
}

function Figure({ label, value, extra, href }: { label: string; value: string; extra?: string; href: string }) {
  return (
    <div>
      <dt className="text-meta text-muted">{label}</dt>
      <dd>
        <Link href={href} className="hover:underline">
          <span className="num font-mono text-figure font-medium">{value}</span>
          {extra ? <span className="ml-2 text-table text-muted">{extra}</span> : null}
        </Link>
      </dd>
    </div>
  );
}

function greeting(now: Date, tz: string) {
  const h = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
