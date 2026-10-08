import Link from "next/link";
import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { csqlLabel, listCsqls, type Opportunity } from "@/services/csqls";
import { getResults } from "@/services/results";
import { calendarOf } from "@/services/org";
import { requireActor } from "@/auth/session";
import { formatMoneyShort } from "@/core/money";
import { deadlineState } from "@/core/business-time";
import { getDb } from "@/db/client";
import { usageSnapshots } from "@/db/schema";
import { ButtonLink, EmptyState, Panel } from "@/ui/page";
import { CompanyLogo, Handoff, MoneyShort, RuleTag, Status } from "@/ui/bits";
import { ArrowRight } from "@/ui/icons";
import { ago, deadlineText } from "@/ui/format";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const ctx = await appCtx();
  const actor = await requireActor();
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;
  const t = ctx.actor.config.terminology;
  const role = ctx.actor.role;
  const isSeller = role === "SELLER" || role === "SALES_LEAD";
  const leader = role === "CS_LEAD" || role === "SALES_LEAD" || role === "ADMIN";

  const [results, open, allCsqls, freshness] = await Promise.all([
    getResults(ctx, "90d"),
    listSignals(ctx, { status: ["NEW"], who: role === "CSM" ? "mine" : "all" }),
    listCsqls(ctx, {}),
    getDb()
      .select({ latest: sql<string | null>`max(${usageSnapshots.date})::text`, simulated: sql<number>`count(*) filter (where ${usageSnapshots.source} = 'SIMULATED')::int` })
      .from(usageSnapshots)
      .where(and(eq(usageSnapshots.orgId, ctx.actor.orgId))),
  ]);
  const f = results.funnel;
  const triageStart = (d: Date) => new Date(d.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000);
  const waitingSellers = allCsqls.filter((r) => r.csql.status === "ROUTED");
  const mine = allCsqls.filter((r) => r.csql.ownerId === ctx.actor.userId && ["ROUTED", "ACCEPTED", "OPPORTUNITY"].includes(r.csql.status));
  const returned = allCsqls.filter((r) => r.csql.status === "RETURNED" && (r.csql.sourcedBy === ctx.actor.userId || role === "CS_LEAD" || role === "ADMIN"));
  const stuck = [
    ...open
      .filter((r) => deadlineState(triageStart(r.signal.triageDueAt), r.signal.triageDueAt, now, cal) === "ESCALATE")
      .map((r) => ({ href: `/signals/${r.signal.id}`, account: r.account.name, what: "Signal waiting for review", who: r.triagerName ?? "No CSM" })),
    ...allCsqls
      .filter((r) => (r.csql.status === "ROUTED" || r.csql.status === "RETURNED") && r.csql.dueAt && r.csql.clockStartedAt && deadlineState(r.csql.clockStartedAt, r.csql.dueAt, now, cal) === "ESCALATE")
      .map((r) => ({ href: `/csqls/${r.csql.id}`, account: r.account.name, what: r.csql.status === "ROUTED" ? "Waiting for the seller" : "Sent back, waiting for CS", who: (r.csql.status === "ROUTED" ? r.ownerName : r.sourcedByName) ?? "Unassigned" })),
  ];
  const wins = allCsqls
    .filter((r) => r.csql.status === "WON")
    .sort((a, b) => (b.csql.closedAt?.getTime() ?? 0) - (a.csql.closedAt?.getTime() ?? 0))
    .slice(0, 4);
  const first = actor.name.split(" ")[0];
  const openValue = open.reduce((n, r) => n + (r.signal.estValueMinor ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-table text-muted">
          {greeting(now, ctx.actor.timezone)}, {first}
        </p>
        <h1 className="mt-1 max-w-3xl text-display font-semibold">
          {isSeller
            ? mine.length
              ? `You have ${mine.length} expansion ${mine.length === 1 ? "deal" : "deals"} from customer success to work.`
              : "Nothing new from customer success right now."
            : open.length
              ? `${open.length} ${open.length === 1 ? "customer looks" : "customers look"} ready to grow.`
              : "No customers are waiting for review."}
        </h1>
        <p className="mt-1 text-body text-muted">
          {f.pipelineMinor || f.wonMinor
            ? `In the last 90 days, signals turned into ${formatMoneyShort(f.pipelineMinor, currency)} of pipeline and ${formatMoneyShort(f.wonMinor, currency)} of won revenue.`
            : "Pipeline and wins from signals will show here as sellers record them."}
        </p>
      </header>

      <section aria-label="At a glance" className="panel grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-rule">
        <Stat label="To review" value={String(open.length)} note={open.length ? `about ${formatMoneyShort(openValue, currency)} a year` : "all caught up"} href="/signals" />
        <Stat label="With sellers" value={String(waitingSellers.length)} note="waiting to be picked up" href="/csqls" />
        <Stat label="Pipeline, 90 days" value={formatMoneyShort(f.pipelineMinor, currency)} note={`${f.opportunities} opportunit${f.opportunities === 1 ? "y" : "ies"}`} href="/results" />
        <Stat label="Won, 90 days" value={formatMoneyShort(f.wonMinor, currency)} note={`${f.won} ${f.won === 1 ? "deal" : "deals"}`} href="/results" />
      </section>

      {leader && stuck.length ? (
        <Panel title="Needs a new owner" id="stuck" description="More than two business days past the deadline.">
          <ul className="divide-y divide-rule">
            {stuck.map((e) => (
              <li key={e.href}>
                <Link href={e.href} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/60">
                  <CompanyLogo name={e.account} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.account}</span>
                    <span className="block text-meta text-muted">
                      {e.what} · with {e.who}
                    </span>
                  </span>
                  <Status tone="risk">Overdue</Status>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {isSeller ? (
          <Panel title="Your deals from customer success" id="mine" actions={<ButtonLink href="/csqls" size="sm">View all</ButtonLink>}>
            {mine.length ? (
              <ul className="divide-y divide-rule">
                {mine.map(({ csql: c, account, sourcedByName }) => {
                  const due = c.status === "ROUTED" && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
                  return (
                    <li key={c.id}>
                      <Link href={`/csqls/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/60">
                        <CompanyLogo name={account.name} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{account.name}</span>
                          <span className="block text-meta text-muted">
                            {csqlLabel(t.csql, c.number)} · from {sourcedByName}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          <MoneyShort minor={(c.opportunity as Opportunity | null)?.amountMinor ?? c.adjustedValueMinor ?? c.estValueMinor} currency={currency} className="font-semibold" empty="—" />
                          {due ? <Status tone={due.tone}>{due.text}</Status> : <Status tone="neutral">{c.status === "OPPORTUNITY" ? "In the CRM" : "Working"}</Status>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="No open deals for you">Customer success routes accepted signals here, with a note and the evidence.</EmptyState>
            )}
          </Panel>
        ) : (
          <Panel title="Ready to review" id="review" actions={<ButtonLink href="/signals" size="sm">View all</ButtonLink>}>
            {open.length ? (
              <ul className="divide-y divide-rule">
                {open.slice(0, 6).map(({ signal: s, account, triagerName }) => {
                  const due = deadlineText(triageStart(s.triageDueAt), s.triageDueAt, now, cal);
                  return (
                    <li key={s.id}>
                      <Link href={`/signals/${s.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/60">
                        <CompanyLogo name={account.name} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{account.name}</span>
                            <RuleTag type={s.type} />
                          </span>
                          <span className="mt-0.5 block truncate text-meta text-muted">{s.explanation}</span>
                          {role !== "CSM" ? (
                            <span className="mt-1 block">
                              <Handoff from={triagerName} to={null} />
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <MoneyShort minor={s.estValueMinor} currency={currency} className="font-semibold" empty="—" />
                          <Status tone={due.tone}>{due.text}</Status>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState title="You're all caught up">New signals appear when a customer&apos;s usage crosses one of your rules. Detection runs every morning and after each usage upload.</EmptyState>
            )}
          </Panel>
        )}

        <div className="flex flex-col gap-6">
          {returned.length ? (
            <Panel title="Sent back to you" id="returned">
              <ul className="divide-y divide-rule">
                {returned.map(({ csql: c, account }) => (
                  <li key={c.id}>
                    <Link href={`/csqls/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/60">
                      <CompanyLogo name={account.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{account.name}</span>
                        <span className="block text-meta text-muted">{c.returnReason}</span>
                      </span>
                      <ArrowRight size={16} aria-hidden className="text-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          <Panel title="Recent wins" id="wins" actions={<ButtonLink href="/results" size="sm">Results</ButtonLink>}>
            {wins.length ? (
              <ul className="divide-y divide-rule">
                {wins.map(({ csql: c, account, ownerName }) => (
                  <li key={c.id}>
                    <Link href={`/csqls/${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-hover/60">
                      <CompanyLogo name={account.name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{account.name}</span>
                        <span className="block text-meta text-muted">
                          {ownerName} · {c.closedAt ? ago(c.closedAt, now) : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <MoneyShort minor={c.outcomeAmountMinor} currency={currency} className="font-semibold text-won" />
                        <span className="block text-meta text-faint">a year</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No wins yet">Won deals appear here when sellers record them.</EmptyState>
            )}
          </Panel>
        </div>
      </div>

      {freshness[0]?.simulated ? (
        <p className="text-meta text-faint">Demo workspace: Fernway and its customers are fictional, and usage is simulated. Usage last received for {freshness[0].latest}.</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note, href }: { label: string; value: string; note: string; href: string }) {
  return (
    <Link href={href} className="group px-5 py-4 hover:bg-hover/50">
      <span className="block text-meta font-medium text-muted">{label}</span>
      <span className="num mt-1 block text-figure font-semibold">{value}</span>
      <span className="block text-meta text-faint group-hover:text-muted">{note}</span>
    </Link>
  );
}

function greeting(now: Date, tz: string) {
  const h = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
