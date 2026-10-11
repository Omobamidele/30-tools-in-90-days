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
import { Attributes, Breadcrumbs, Panel } from "@/ui/page";
import { Avatar, CompanyLogo, MoneyShort, SimulatedTag, Status, TypeBadge } from "@/ui/bits";
import { CommitmentMeter, SeatMap } from "@/ui/evidence";
import { User } from "@/ui/icons";
import { storyHeadline } from "@/ui/story";
import { formatDateTime } from "@/ui/format";
import { TeamEditor } from "./team-editor";

export const metadata: Metadata = { title: "Account" };

// An account told as a customer (docs/09 rev. 3): who they are and who looks after them, how
// they use the product today (as pictures, not charts), what's been spotted, and what happened.

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
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

  return (
    <>
      <Breadcrumbs items={[{ href: "/accounts", label: "Accounts" }, { label: a.name }]} />
      <header className="mb-8 flex flex-wrap items-start gap-4">
        <CompanyLogo name={a.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-display font-semibold">{a.name}</h1>
          <p className="mt-1 max-w-2xl text-section text-muted">
            {segment} {a.industry ? `${a.industry.toLowerCase()} ` : ""}customer
            {sub ? `, on the ${sub.plan} plan until ${sub.termEnd} (renews in ${daysBetween(today, sub.termEnd)} days)` : ""}.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-table">
            <span className="flex items-center gap-2">
              <Avatar name={d.csmName} size={24} className="ring-0" />
              <span>
                {d.csmName ?? "No CSM"} <span className="text-muted">looks after them</span>
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Avatar name={d.ownerName} size={24} className="ring-0" />
              <span>
                {d.ownerName ?? "No account owner"} <span className="text-muted">sells to them</span>
              </span>
            </span>
            {stale ? <Status tone="watch">{d.dataAgeDays === null ? "No usage received yet" : `Usage is ${d.dataAgeDays} days old`}</Status> : null}
            {latest?.source === "SIMULATED" ? <SimulatedTag /> : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="usage">
            <h2 id="usage" className="text-section font-semibold">
              How they use it today
            </h2>
            {sub && latest ? (
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                <div className="rounded-panel border border-rule bg-sunken/60 p-5">
                  <p className="mb-3 text-table font-medium">{t.seats}</p>
                  <SeatMap active={latest.activeSeats} purchased={sub.seatsPurchased} streakDays={0} terms={t} size="compact" />
                </div>
                {sub.creditsCommitted > 0 && projected !== null ? (
                  <div className="rounded-panel border border-rule bg-sunken/60 p-5">
                    <p className="mb-3 text-table font-medium">{t.usageMetric} this term</p>
                    <CommitmentMeter used={latest.creditsUsedTerm} projected={projected} committed={sub.creditsCommitted} termEnd={sub.termEnd} unit={t.usageUnit} size="compact" />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-table text-muted">No usage received for this account yet.</p>
            )}
            {workspaces.length ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {workspaces.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 rounded-panel border border-rule px-4 py-3">
                    <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-t-team-bg text-t-team">
                      <User size={18} weight="duotone" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{w.name}</span>
                      <span className="block text-meta text-muted">
                        {w.activeUsers} people, since {w.createdOn}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section aria-labelledby="spotted">
            <h2 id="spotted" className="text-section font-semibold">
              What we&apos;ve spotted
            </h2>
            {d.signals.length ? (
              <ul className="mt-3 flex flex-col gap-2">
                {d.signals.map((s) => {
                  const c = d.csqls.find((x) => x.id === s.csqlId);
                  return (
                    <li key={s.id}>
                      <Link href={`/signals/${s.id}`} className="flex items-start gap-3 rounded-panel border border-rule px-4 py-3 hover:border-rule-strong hover:shadow-card">
                        <TypeBadge type={s.type} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{storyHeadline(s.type, s.evidence, t)}</span>
                          <span className="mt-0.5 block text-meta text-muted">
                            Spotted {formatDateTime(s.detectedAt, ctx.actor.timezone)}
                            {c ? `, now ${csqlLabel(t.csql, c.number)} (${c.status.toLowerCase().replace(/_/g, " ")})` : s.dismissReason ? `, dismissed: ${s.dismissReason}` : ""}
                          </span>
                        </span>
                        <Status tone={s.status === "NEW" ? "brand" : s.status === "ACCEPTED" ? "won" : "neutral"}>{s.status === "NEW" ? "To review" : s.status.charAt(0) + s.status.slice(1).toLowerCase()}</Status>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-table text-muted">Nothing spotted on this account yet.</p>
            )}
          </section>

          <section aria-labelledby="activity">
            <h2 id="activity" className="text-section font-semibold">
              What happened
            </h2>
            {d.history.length ? (
              <ol className="mt-3 border-l border-rule-strong pl-4">
                {d.history.slice(0, 20).map((h) => (
                  <li key={h.id} className="relative pb-3 text-table">
                    <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-rule-strong" />
                    <span className="font-medium">{h.actorLabel}</span> <span className="text-muted">{h.summary}</span>
                    <span className="block text-meta text-faint">{formatDateTime(h.at, ctx.actor.timezone)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-table text-muted">No activity yet.</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Subscription" id="sub">
            <Attributes
              items={
                sub
                  ? [
                      { label: "Plan", value: sub.plan },
                      { label: "Pays", value: <span><MoneyShort minor={sub.arrMinor} currency={currency} /> a year</span> },
                      { label: "Term", value: `${sub.termStart} to ${sub.termEnd}` },
                      { label: t.seats, value: <span className="num">{sub.seatsPurchased}</span> },
                      { label: `${t.usageMetric} committed`, value: <span className="num">{sub.creditsCommitted.toLocaleString("en-US")}</span> },
                      {
                        label: "Add-ons",
                        value: (
                          <span className="flex flex-col">
                            {cfg.priceBook.addons.map((x) => (
                              <span key={x.key} className={addonsOwned.includes(x.key) ? "" : "text-muted"}>
                                {x.name}: {addonsOwned.includes(x.key) ? "owned" : "not owned"}
                              </span>
                            ))}
                          </span>
                        ),
                      },
                      { label: "CRM ID", value: a.crmId },
                    ]
                  : [{ label: "Subscription", value: null }]
              }
            />
          </Panel>
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
          <Panel title="People at the customer" id="contacts">
            <ul className="divide-y divide-rule">
              {d.contacts.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-5 py-2.5 text-table">
                  <Avatar name={c.name} size={28} className="ring-0" />
                  <span className="min-w-0">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-meta text-muted">
                      {c.title ?? "No title"}
                      {c.firstSeenOn ? `, first active ${c.firstSeenOn}` : ""}
                    </span>
                  </span>
                </li>
              ))}
              {!d.contacts.length ? <li className="px-5 py-3 text-table text-muted">No contacts yet.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
