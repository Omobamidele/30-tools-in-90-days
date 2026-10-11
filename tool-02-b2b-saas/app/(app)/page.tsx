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
import { EmptyState } from "@/ui/page";
import { Avatar, CompanyLogo, Status } from "@/ui/bits";
import { NoteCard, StoryCard } from "@/ui/story-card";
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
    <div className="flex flex-col gap-8">
      <header className="max-w-3xl">
        <p className="text-body text-muted">
          {greeting(now, ctx.actor.timezone)}, {first}
        </p>
        <h1 className="mt-1 text-hero font-semibold text-balance">{headline}</h1>
        {context.length ? <p className="mt-2 text-section text-muted">{context.join(" ")}</p> : null}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="stories">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="stories" className="text-section font-semibold">
              {isSeller ? "Handed to you by customer success" : "Ready for you to review"}
            </h2>
            <Link href={isSeller ? "/csqls" : "/signals"} className="text-table font-medium text-brand hover:underline">
              {isSeller ? `All ${t.csqlPlural}` : "Open the inbox"}
            </Link>
          </div>
          {isSeller ? (
            mine.length ? (
              <div className="flex flex-col gap-3">
                {mine.map(({ csql: c, account, sourcedByName }) => (
                  <NoteCard
                    key={c.id}
                    href={`/csqls/${c.id}`}
                    account={account.name}
                    label={csqlLabel(t.csql, c.number)}
                    note={c.handoffNote}
                    from={sourcedByName}
                    due={c.status === "ROUTED" && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null}
                    status={c.status === "OPPORTUNITY" ? "In the CRM" : c.status === "ACCEPTED" ? "You're on it" : undefined}
                    worth={worthText(short((c.opportunity as Opportunity | null)?.amountMinor ?? c.adjustedValueMinor ?? c.estValueMinor))}
                  />
                ))}
              </div>
            ) : (
              <div className="panel">
                <EmptyState title="No open deals for you">When a CSM accepts a signal on one of your accounts, it arrives here with their note and the evidence.</EmptyState>
              </div>
            )
          ) : open.length ? (
            <div className="flex flex-col gap-3">
              {open.slice(0, 6).map(({ signal: s, account, triagerName, ownerName }) => (
                <StoryCard
                  key={s.id}
                  href={`/signals?open=${s.id}`}
                  account={account.name}
                  type={s.type}
                  headline={storyHeadline(s.type, s.evidence, t)}
                  evidence={s.evidence}
                  terms={t}
                  due={deadlineText(triageStart(s.triageDueAt), s.triageDueAt, now, cal)}
                  worth={worthText(short(s.estValueMinor))}
                  from={triagerName}
                  to={ownerName}
                  high={s.priority >= high}
                />
              ))}
              {open.length > 6 ? (
                <Link href="/signals" className="rounded-panel border border-dashed border-rule-strong px-5 py-3 text-center text-table font-medium text-brand hover:bg-hover/50">
                  {open.length - 6} more in the inbox
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="panel">
              <EmptyState title="Nothing waiting for review">New signals appear when a customer&apos;s usage crosses one of your rules. Detection runs every morning and after each usage upload.</EmptyState>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-8" aria-label="Around the team">
          {leader && stuck.length ? (
            <Rail title="Needs a new owner" note="More than two business days late.">
              {stuck.map((e) => (
                <RailItem key={e.href} href={e.href} account={e.account} line={`${e.what}, with ${e.who}`} right={<Status tone="risk">Late</Status>} />
              ))}
            </Rail>
          ) : null}

          {returned.length ? (
            <Rail title="Sent back to you">
              {returned.map(({ csql: c, account, ownerName }) => (
                <RailItem key={c.id} href={`/csqls/${c.id}`} account={account.name} line={`${ownerName?.split(" ")[0] ?? "The seller"}: ${c.returnReason ?? "sent back"}`} />
              ))}
            </Rail>
          ) : null}

          {!isSeller && waitingSellers.length ? (
            <Rail title="Waiting for a seller">
              {waitingSellers.slice(0, 5).map(({ csql: c, account, ownerName }) => {
                const due = c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
                return <RailItem key={c.id} href={`/csqls/${c.id}`} account={account.name} line={`With ${ownerName ?? "the seller queue"}`} right={due ? <Status tone={due.tone}>{due.text}</Status> : null} />;
              })}
            </Rail>
          ) : null}

          <Rail title="Recent wins" more={{ href: "/results", label: "Results" }}>
            {wins.length ? (
              wins.map(({ csql: c, account, ownerName, sourcedByName }) => (
                <li key={c.id}>
                  <Link href={`/csqls/${c.id}`} className="block rounded-control px-2 py-2.5 hover:bg-hover/60">
                    <span className="flex items-center gap-2.5">
                      <CompanyLogo name={account.name} size={28} />
                      <span className="min-w-0 flex-1 font-medium">{account.name}</span>
                    </span>
                    <span className="mt-1.5 block line-clamp-2 text-table text-muted">“{c.handoffNote}”</span>
                    <span className="mt-2 flex items-center gap-1.5 text-meta text-muted">
                      <span className="flex -space-x-1">
                        <Avatar name={sourcedByName} size={18} />
                        <Avatar name={ownerName} size={18} />
                      </span>
                      Spotted by {sourcedByName?.split(" ")[0]}, won by {ownerName?.split(" ")[0]} {c.closedAt ? ago(c.closedAt, now) : ""}
                    </span>
                  </Link>
                </li>
              ))
            ) : (
              <li className="px-2 py-2 text-table text-muted">Won deals appear here when sellers record them.</li>
            )}
          </Rail>
        </aside>
      </div>

      {freshness[0]?.simulated ? (
        <p className="text-meta text-faint">Demo workspace: Fernway and its customers are fictional, and usage is simulated. Usage last received for {freshness[0].latest}.</p>
      ) : null}
    </div>
  );
}

function Rail({ title, note, more, children }: { title: string; note?: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-baseline justify-between gap-3 px-2">
        <h2 className="text-section font-semibold">{title}</h2>
        {more ? (
          <Link href={more.href} className="text-table font-medium text-brand hover:underline">
            {more.label}
          </Link>
        ) : null}
      </div>
      {note ? <p className="mb-1 px-2 text-meta text-muted">{note}</p> : null}
      <ul>{children}</ul>
    </section>
  );
}

function RailItem({ href, account, line, right }: { href: string; account: string; line: string; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2.5 rounded-control px-2 py-2 hover:bg-hover/60">
        <CompanyLogo name={account} size={28} />
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
