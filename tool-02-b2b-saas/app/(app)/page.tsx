import Link from "next/link";
import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { csqlLabel, listCsqls, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { requireActor } from "@/auth/session";
import { formatMoneyShort } from "@/core/money";
import { deadlineState } from "@/core/business-time";
import { getDb } from "@/db/client";
import { usageSnapshots } from "@/db/schema";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Avatar, CompanyLogo, RuleTag, Status } from "@/ui/bits";
import { Kanban, Target } from "@/ui/icons";
import { storyHeadline, worthText } from "@/ui/story";
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

  const [open, allCsqls, freshness] = await Promise.all([
    listSignals(ctx, { status: ["NEW"], who: role === "CSM" ? "mine" : "all" }),
    listCsqls(ctx, {}),
    getDb()
      .select({ latest: sql<string | null>`max(${usageSnapshots.date})::text`, simulated: sql<number>`count(*) filter (where ${usageSnapshots.source} = 'SIMULATED')::int` })
      .from(usageSnapshots)
      .where(and(eq(usageSnapshots.orgId, ctx.actor.orgId))),
  ]);
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
  const short = (m: number | null | undefined) => (m === null || m === undefined ? null : formatMoneyShort(m, currency));
  const high = ctx.actor.config.detection.highPriorityScore;
  const lastWin = wins[0];

  const headline = isSeller
    ? mine.length
      ? `${count(mine.length, "customer")} ${mine.length === 1 ? "is" : "are"} ready to talk about growing.`
      : "Nothing new from customer success today."
    : open.length
      ? `${count(open.length, "customer")} ${open.length === 1 ? "looks" : "look"} ready for more.`
      : "You're all caught up.";
  const context = [
    isSeller
      ? open.length
        ? `Customer success is reviewing ${open.length} more.`
        : null
      : waitingSellers.length
        ? `${waitingSellers.length === 1 ? "One deal is" : `${count(waitingSellers.length, "deal")} are`} waiting for a seller to pick up.`
        : null,
    lastWin ? `${lastWin.ownerName?.split(" ")[0] ?? "A seller"} won ${lastWin.account.name} ${lastWin.csql.closedAt ? ago(lastWin.csql.closedAt, now) : "recently"}.` : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={`${greeting(now, ctx.actor.timezone)}, ${first}`}
        meta={[headline, ...context].join(" ")}
        actions={
          isSeller ? (
            <ButtonLink href="/csqls" variant="primary">
              Open your {t.csqlPlural}
            </ButtonLink>
          ) : (
            <ButtonLink href="/signals" variant="primary">
              Review signals
            </ButtonLink>
          )
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {isSeller ? (
          <Panel title="Handed to you by customer success" id="mine" description="Each one comes with the CSM's note and the usage behind it." actions={<ButtonLink href="/csqls" size="sm">View all</ButtonLink>}>
            {mine.length ? (
              <ul className="divide-y divide-rule">
                {mine.map(({ csql: c, account, sourcedByName }) => {
                  const due = c.status === "ROUTED" && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
                  return (
                    <li key={c.id}>
                      <Link href={`/csqls/${c.id}`} className="flex items-start gap-4 px-6 py-4 hover:bg-hover/60">
                        <CompanyLogo name={account.name} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2">
                            <span className="font-semibold">{account.name}</span>
                            <span className="text-meta text-muted">{csqlLabel(t.csql, c.number)}</span>
                          </span>
                          <span className="mt-1 line-clamp-2 block text-table text-text">“{c.handoffNote}”</span>
                          <span className="mt-1.5 flex items-center gap-1.5 text-meta text-muted">
                            <Avatar name={sourcedByName} size={18} className="ring-0" />
                            From {sourcedByName}, {worthText(short((c.opportunity as Opportunity | null)?.amountMinor ?? c.adjustedValueMinor ?? c.estValueMinor)).toLowerCase()}
                          </span>
                        </span>
                        {due ? <Status tone={due.tone}>{due.text}</Status> : <Status tone="neutral">{c.status === "OPPORTUNITY" ? "In the CRM" : "You're on it"}</Status>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={Kanban} title="No open deals for you" actions={<ButtonLink href="/csqls">See all {t.csqlPlural}</ButtonLink>}>
                When a CSM accepts a signal on one of your accounts, it arrives here with their note and the evidence.
              </EmptyState>
            )}
          </Panel>
        ) : (
          <Panel title="Ready for you to review" id="review" description="Customers whose usage crossed one of your rules. Accept to hand one to a seller, or dismiss it with a reason." actions={<ButtonLink href="/signals" size="sm">View all</ButtonLink>}>
            {open.length ? (
              <ul className="divide-y divide-rule">
                {open.slice(0, 8).map(({ signal: s, account, ownerName }) => {
                  const due = deadlineText(triageStart(s.triageDueAt), s.triageDueAt, now, cal);
                  return (
                    <li key={s.id}>
                      <Link href={`/signals?open=${s.id}`} className="flex items-start gap-4 px-6 py-4 hover:bg-hover/60">
                        <CompanyLogo name={account.name} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{account.name}</span>
                            <RuleTag type={s.type} />
                            {s.priority >= high ? <Status tone="brand">High priority</Status> : null}
                          </span>
                          <span className="mt-1 block text-table text-text">{storyHeadline(s.type, s.evidence, t)}</span>
                          <span className="mt-1 block text-meta text-muted">
                            {worthText(short(s.estValueMinor))}
                            {ownerName ? `, goes to ${ownerName}` : ", goes to the seller queue"}
                          </span>
                        </span>
                        <Status tone={due.tone}>{due.text}</Status>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={Target} title="Nothing waiting for review">
                New signals appear when a customer&apos;s usage crosses one of your rules. Detection runs every morning and after each usage upload.
              </EmptyState>
            )}
            {open.length > 8 ? (
              <div className="border-t border-rule px-6 py-3 text-table">
                <Link href="/signals" className="font-medium text-brand hover:underline">
                  {open.length - 8} more to review
                </Link>
              </div>
            ) : null}
          </Panel>
        )}

        <div className="flex flex-col gap-6">
          {leader && stuck.length ? (
            <Panel title="Needs a new owner" id="stuck" description="More than two business days late.">
              <ul className="divide-y divide-rule">
                {stuck.map((e) => (
                  <RailItem key={e.href} href={e.href} account={e.account} line={`${e.what}, with ${e.who}`} right={<Status tone="risk">Late</Status>} />
                ))}
              </ul>
            </Panel>
          ) : null}

          {returned.length ? (
            <Panel title="Sent back to you" id="returned">
              <ul className="divide-y divide-rule">
                {returned.map(({ csql: c, account, ownerName }) => (
                  <RailItem key={c.id} href={`/csqls/${c.id}`} account={account.name} line={`${ownerName?.split(" ")[0] ?? "The seller"}: ${c.returnReason ?? "sent back"}`} />
                ))}
              </ul>
            </Panel>
          ) : null}

          {!isSeller && waitingSellers.length ? (
            <Panel title="Waiting for a seller" id="waiting">
              <ul className="divide-y divide-rule">
                {waitingSellers.slice(0, 5).map(({ csql: c, account, ownerName }) => {
                  const due = c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
                  return <RailItem key={c.id} href={`/csqls/${c.id}`} account={account.name} line={`With ${ownerName ?? "the seller queue"}`} right={due ? <Status tone={due.tone}>{due.text}</Status> : null} />;
                })}
              </ul>
            </Panel>
          ) : null}

          <Panel title="Recent wins" id="wins" actions={<ButtonLink href="/results" size="sm">Results</ButtonLink>}>
            {wins.length ? (
              <ul className="divide-y divide-rule">
                {wins.map(({ csql: c, account, ownerName, sourcedByName }) => (
                  <li key={c.id}>
                    <Link href={`/csqls/${c.id}`} className="block px-6 py-4 hover:bg-hover/60">
                      <span className="flex items-center gap-3">
                        <CompanyLogo name={account.name} size={28} />
                        <span className="min-w-0 flex-1 font-semibold">{account.name}</span>
                      </span>
                      <span className="mt-1.5 line-clamp-2 block text-table text-muted">“{c.handoffNote}”</span>
                      <span className="mt-1.5 block text-meta text-muted">
                        Spotted by {sourcedByName?.split(" ")[0]}, won by {ownerName?.split(" ")[0]} {c.closedAt ? ago(c.closedAt, now) : ""}
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
        <p className="mt-6 text-meta text-muted">Demo workspace: Fernway and its customers are fictional, and usage is simulated. Usage last received for {freshness[0].latest}.</p>
      ) : null}
    </>
  );
}

function RailItem({ href, account, line, right }: { href: string; account: string; line: string; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-6 py-3 hover:bg-hover/60">
        <CompanyLogo name={account} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{account}</span>
          <span className="block truncate text-meta text-muted">{line}</span>
        </span>
        {right}
      </Link>
    </li>
  );
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function count(n: number, noun: string) {
  return `${WORDS[n] ?? n} ${noun}${n === 1 ? "" : "s"}`;
}

function greeting(now: Date, tz: string) {
  const h = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
