import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getAccount } from "@/services/accounts";
import { isNotFound } from "@/services/errors";
import { csqlLabel } from "@/services/csqls";
import { termElapsed } from "@/core/rules/evaluate";
import { daysBetween } from "@/core/dates";
import { localDate } from "@/core/business-time";
import { Attributes, RecordLayout, RecordSection, RecordTabs } from "@/ui/page";
import { MoneyShort, SimulatedTag, Status } from "@/ui/bits";
import { CommitmentMeter, SeatMap } from "@/ui/evidence";
import { ArrowLeft } from "@/ui/icons";
import { storyHeadline } from "@/ui/story";
import { formatDateTime } from "@/ui/format";
import { TeamEditor } from "./team-editor";

export const metadata: Metadata = { title: "Account" };

// An account's record page (docs/09 rev. 5), HubSpot-style: key details and the team on the
// left, usage and signals in the middle (with an Activity tab), contacts and CSQLs on the right.

export default async function AccountPage({ params, searchParams }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const { view } = (await searchParams) as { view?: string };
  const ctx = await appCtx();
  const d = await getAccount(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { account: a, subscription: sub, latest } = d;
  const cfg = ctx.actor.config;
  const t = cfg.terminology;
  const currency = ctx.actor.currency;
  const stale = d.dataAgeDays === null || d.dataAgeDays > cfg.detection.staleAfterDays;
  const today = localDate(ctx.now(), ctx.actor.timezone);
  const segment = cfg.segments.find((s) => s.key === a.segment)?.name ?? "No segment";
  const workspaces = (latest?.workspaces as Array<{ id: string; name: string; createdOn: string; activeUsers: number }> | undefined) ?? [];
  const addonsOwned = sub?.addons ?? [];
  const elapsed = sub && latest ? termElapsed(sub.termStart, sub.termEnd, latest.date) : 0;
  const projected = sub && latest && elapsed > 0 ? latest.creditsUsedTerm / elapsed : null;

  const activity = view === "activity";

  const left = (
    <>
      <Link href="/accounts" className="inline-flex items-center gap-1.5 text-meta font-medium text-brand hover:underline">
        <ArrowLeft size={14} aria-hidden /> Accounts
      </Link>
      <h1 className="mt-4 text-title font-semibold">{a.name}</h1>
      <p className="mt-1 text-body text-muted">
        {segment}
        {a.industry ? `, ${a.industry.toLowerCase()}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {stale ? <Status tone="watch">{d.dataAgeDays === null ? "No usage received yet" : `Usage is ${d.dataAgeDays} days old`}</Status> : null}
        {latest?.source === "SIMULATED" ? <SimulatedTag /> : null}
      </div>
      <RecordSection title="About this account">
        <Attributes
          items={
            sub
              ? [
                  { label: "Plan", value: sub.plan },
                  { label: "Pays", value: <span><MoneyShort minor={sub.arrMinor} currency={currency} /> a year</span> },
                  { label: "Term", value: `${sub.termStart} to ${sub.termEnd}` },
                  { label: "Renews", value: `In ${daysBetween(today, sub.termEnd)} days` },
                  { label: t.seats, value: `${sub.seatsPurchased}` },
                  { label: `${t.usageMetric} committed`, value: sub.creditsCommitted.toLocaleString("en-US") },
                  { label: "Add-ons", value: cfg.priceBook.addons.map((x) => `${x.name}: ${addonsOwned.includes(x.key) ? "owned" : "not owned"}`).join(". ") },
                  { label: "CRM ID", value: a.crmId },
                ]
              : [{ label: "Subscription", value: null }]
          }
        />
      </RecordSection>
      <div className="mt-6 border-t border-rule pt-5">
        <TeamEditor
          accountId={a.id}
          canEdit={d.canEdit}
          canChangeCsm={ctx.actor.role !== "CSM"}
          csmId={a.csmId}
          ownerId={a.ownerId}
          segment={a.segment}
          csmName={d.csmName}
          ownerName={d.ownerName}
          segments={cfg.segments}
          csms={d.people.filter((p) => p.role === "CSM" || p.role === "CS_LEAD")}
          sellers={d.people.filter((p) => p.role === "SELLER" || p.role === "SALES_LEAD")}
        />
      </div>
    </>
  );

  const middle = (
    <>
      <RecordTabs
        items={[
          { href: `/accounts/${a.id}`, label: "Overview", active: !activity },
          { href: `/accounts/${a.id}?view=activity`, label: "Activity", active: activity, count: d.history.length },
        ]}
      />
      {activity ? (
        <ol className="mt-6 border-l border-rule-strong pl-5">
          {d.history.slice(0, 40).map((h) => (
            <li key={h.id} className="relative pb-5">
              <span aria-hidden className="absolute top-2 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-brand" />
              <p className="text-body">
                <span className="font-medium">{h.actorLabel}</span> <span className="text-muted">{h.summary}</span>
              </p>
              <p className="text-meta text-faint">{formatDateTime(h.at, ctx.actor.timezone)}</p>
            </li>
          ))}
          {!d.history.length ? <li className="text-body text-muted">No activity yet.</li> : null}
        </ol>
      ) : (
        <div className="flex flex-col gap-10 pt-6">
          <section aria-labelledby="usage">
            <h2 id="usage" className="text-section font-semibold">
              How they use it today
            </h2>
            {sub && latest ? (
              <div className="mt-5 grid gap-10 xl:grid-cols-2">
                <div>
                  <p className="mb-3 text-meta font-medium text-muted">{t.seats}</p>
                  <SeatMap active={latest.activeSeats} purchased={sub.seatsPurchased} streakDays={0} terms={t} size="compact" />
                </div>
                {sub.creditsCommitted > 0 && projected !== null ? (
                  <div>
                    <p className="mb-3 text-meta font-medium text-muted">{t.usageMetric} this term</p>
                    <CommitmentMeter used={latest.creditsUsedTerm} projected={projected} committed={sub.creditsCommitted} termEnd={sub.termEnd} unit={t.usageUnit} size="compact" />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-body text-muted">No usage received for this account yet.</p>
            )}
            {workspaces.length ? (
              <p className="mt-6 text-body">
                <span className="text-muted">Teams using it: </span>
                {workspaces.map((w) => `${w.name} (${w.activeUsers} people since ${w.createdOn})`).join(", ")}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="spotted">
            <h2 id="spotted" className="text-section font-semibold">
              What we&apos;ve spotted
            </h2>
            {d.signals.length ? (
              <ul className="mt-2 divide-y divide-rule">
                {d.signals.map((s) => {
                  const c = d.csqls.find((x) => x.id === s.csqlId);
                  return (
                    <li key={s.id} className="flex items-start justify-between gap-6 py-4">
                      <div className="min-w-0">
                        <Link href={`/signals/${s.id}`} className="font-semibold text-brand hover:underline">
                          {storyHeadline(s.type, s.evidence, t)}
                        </Link>
                        <p className="text-meta text-muted">
                          Spotted {formatDateTime(s.detectedAt, ctx.actor.timezone)}
                          {c ? `, now ${csqlLabel(t.csql, c.number)} (${c.status.toLowerCase().replace(/_/g, " ")})` : s.dismissReason ? `, dismissed: ${s.dismissReason}` : ""}
                        </p>
                      </div>
                      <Status tone={s.status === "NEW" ? "brand" : s.status === "ACCEPTED" ? "won" : "neutral"}>{s.status === "NEW" ? "To review" : s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Status>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-body text-muted">Nothing spotted on this account yet.</p>
            )}
          </section>
        </div>
      )}
    </>
  );

  const right = (
    <>
      <RecordSection title="People at the customer" first>
        {d.contacts.length ? (
          <ul className="divide-y divide-rule">
            {d.contacts.map((c) => (
              <li key={c.id} className="py-3">
                <p className="font-medium">{c.name}</p>
                <p className="text-meta text-muted">
                  {c.title ?? "No title"}
                  {c.firstSeenOn ? `, first active ${c.firstSeenOn}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-body text-muted">No contacts yet.</p>
        )}
      </RecordSection>
      <RecordSection title={t.csqlPlural}>
        {d.csqls.length ? (
          <ul className="divide-y divide-rule">
            {d.csqls.map((c) => (
              <li key={c.id} className="py-3">
                <Link href={`/csqls/${c.id}`} className="font-semibold text-brand hover:underline">
                  {csqlLabel(t.csql, c.number)}
                </Link>
                <p className="text-meta text-muted capitalize">{c.status.toLowerCase().replace(/_/g, " ")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-4 text-body text-muted">None yet.</p>
        )}
      </RecordSection>
    </>
  );

  return <RecordLayout left={left} middle={middle} right={right} />;
}
