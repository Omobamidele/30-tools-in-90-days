import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getAccount } from "@/services/accounts";
import { isNotFound } from "@/services/errors";
import { csqlLabel } from "@/services/csqls";
import { termElapsed } from "@/core/rules/evaluate";
import type { Trace } from "@/core/rules/types";
import { Attributes, PageHeader, Panel } from "@/ui/page";
import { MoneyShort, RuleTag, SimulatedTag, Status } from "@/ui/bits";
import { SignalTrace } from "@/ui/trace";
import { formatDateTime } from "@/ui/format";
import { TeamEditor } from "./team-editor";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: PageProps<"/accounts/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
  const d = await getAccount(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { account: a, subscription: sub, usage, latest } = d;
  const cfg = ctx.actor.config;
  const t = cfg.terminology;
  const currency = ctx.actor.currency;
  const stale = d.dataAgeDays === null || d.dataAgeDays > cfg.detection.staleAfterDays;

  const seatTrace: Trace | null = sub && usage.length > 1 ? { label: `Active ${t.seats.toLowerCase()}`, unit: "seat", points: usage.map((u) => ({ date: u.date, value: u.activeSeats })), threshold: (d.thresholds.seatPct / 100) * sub.seatsPurchased } : null;
  const paceTrace: Trace | null =
    sub && sub.creditsCommitted > 0 && usage.length > 1
      ? {
          label: "Projected use, % of commitment",
          unit: "%",
          points: usage.filter((u) => u.date >= sub.termStart).map((u) => ({ date: u.date, value: Math.round((u.creditsUsedTerm / Math.max(termElapsed(sub.termStart, sub.termEnd, u.date), 0.0001) / sub.creditsCommitted) * 100) })),
          threshold: d.thresholds.pacePct,
        }
      : null;
  const workspaces = (latest?.workspaces as Array<{ id: string; name: string; createdOn: string; activeUsers: number }> | undefined) ?? [];
  const addonsOwned = sub?.addons ?? [];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/accounts", label: "Accounts" }, { label: a.name }]}
        title={a.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{cfg.segments.find((s) => s.key === a.segment)?.name ?? "No segment"}</span>
            <span>{a.industry}</span>
            <span className="font-mono">{a.crmId}</span>
            {stale ? <Status tone="watch">{d.dataAgeDays === null ? "No usage received yet" : `Usage is ${d.dataAgeDays} days old; no new signals until it updates`}</Status> : <span>Usage updated {latest?.date}</span>}
            {latest?.source === "SIMULATED" ? <SimulatedTag /> : null}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Usage, last 90 days" id="usage">
            <div className="grid gap-6 p-4 xl:grid-cols-2">
              {seatTrace ? (
                <figure>
                  <figcaption className="mb-1 text-table">
                    <span className="font-medium">{t.seats}:</span> <span className="num font-mono">{latest?.activeSeats}</span> active of <span className="num font-mono">{sub!.seatsPurchased}</span>
                  </figcaption>
                  <SignalTrace trace={seatTrace} width={480} height={150} axes fluid />
                </figure>
              ) : null}
              {paceTrace && paceTrace.points.length > 1 ? (
                <figure>
                  <figcaption className="mb-1 text-table">
                    <span className="font-medium">{t.usageMetric}:</span> <span className="num font-mono">{latest?.creditsUsedTerm.toLocaleString("en-US")}</span> of{" "}
                    <span className="num font-mono">{sub!.creditsCommitted.toLocaleString("en-US")}</span> used this term
                  </figcaption>
                  <SignalTrace trace={paceTrace} width={480} height={150} axes fluid />
                </figure>
              ) : null}
              {!seatTrace && !paceTrace ? <p className="text-table text-muted">No usage received for this account yet.</p> : null}
            </div>
            {workspaces.length ? (
              <div className="border-t border-rule px-4 py-3">
                <p className="mb-2 text-table font-medium">Workspaces</p>
                <ul className="flex flex-wrap gap-2">
                  {workspaces.map((w) => (
                    <li key={w.id} className="rounded-control border border-rule px-2.5 py-1.5 text-table">
                      {w.name} · <span className="num font-mono">{w.activeUsers}</span> active <span className="text-meta text-muted">since {w.createdOn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title="Signals and CSQLs" id="history">
            {d.signals.length ? (
              <ul className="divide-y divide-rule">
                {d.signals.map((s) => {
                  const c = d.csqls.find((x) => x.id === s.csqlId);
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                      <span className="min-w-0">
                        <RuleTag type={s.type} />
                        <Link href={`/signals/${s.id}`} className="mt-1 block text-table hover:underline">
                          {s.explanation}
                        </Link>
                        <span className="text-meta text-muted">{formatDateTime(s.detectedAt, ctx.actor.timezone)}</span>
                      </span>
                      <span className="text-right text-table">
                        <span className="block capitalize">{s.status.toLowerCase()}</span>
                        {c ? (
                          <Link href={`/csqls/${c.id}`} className="link font-mono text-meta">
                            {csqlLabel(t.csql, c.number)} · {c.status.toLowerCase().replace(/_/g, " ")}
                          </Link>
                        ) : s.dismissReason ? (
                          <span className="text-meta text-muted">{s.dismissReason}</span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-table text-muted">No signals on this account yet.</p>
            )}
          </Panel>

          <Panel title="Activity" id="activity">
            <ol className="divide-y divide-rule">
              {d.history.slice(0, 20).map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-table">
                  <span>
                    <span className="font-medium">{h.actorLabel}</span> · {h.summary}
                  </span>
                  <span className="text-meta text-muted">{formatDateTime(h.at, ctx.actor.timezone)}</span>
                </li>
              ))}
              {!d.history.length ? <li className="px-4 py-3 text-table text-muted">No activity yet.</li> : null}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Subscription" id="sub">
            <Attributes
              items={
                sub
                  ? [
                      { label: "Plan", value: sub.plan },
                      { label: "ARR", value: <MoneyShort minor={sub.arrMinor} currency={currency} /> },
                      { label: "Term", value: `${sub.termStart} to ${sub.termEnd}` },
                      { label: t.seats, value: <span className="num font-mono">{sub.seatsPurchased}</span> },
                      { label: `${t.usageMetric} committed`, value: <span className="num font-mono">{sub.creditsCommitted.toLocaleString("en-US")}</span> },
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
          <Panel title="Contacts" id="contacts">
            <ul className="divide-y divide-rule">
              {d.contacts.map((c) => (
                <li key={c.id} className="px-4 py-2 text-table">
                  <span className="font-medium">{c.name}</span>
                  <span className="block text-meta text-muted">
                    {c.title ?? "No title"}
                    {c.seniority ? ` · ${c.seniority.toLowerCase()}` : ""} · first active {c.firstSeenOn ?? "unknown"}
                  </span>
                </li>
              ))}
              {!d.contacts.length ? <li className="px-4 py-3 text-table text-muted">No contacts yet.</li> : null}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
