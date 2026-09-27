import type { Metadata } from "next";
import Link from "next/link";
import { listContractsForEvent, contractStatusLabels } from "@/services/contracts";
import { listObligations, obligationKindLabels } from "@/services/obligations";
import { listEventActivity } from "@/services/activity";
import { rulesForEvent } from "@/services/clients";
import { term } from "@/config/terms";
import { Attributes, Panel } from "@/ui/page";
import { Status, contractStatusTone } from "@/ui/status";
import { Money, MoneyShort } from "@/ui/money";
import { ActivityList } from "@/ui/activity-list";
import { formatDate, formatDue, relativeDue } from "@/ui/format";
import { loadEvent } from "./load";
import { listOpenAlerts } from "@/services/alerts";
import { AlertList } from "../../alerts/alert-list";
import { toAlertItems } from "../../alerts/to-items";
import { listOpenTasks } from "@/services/changes";
import { TaskList } from "../../changes/[id]/task-list";
import { can } from "@/auth/policy";
import { getEventExposure, getEventSavings, getEventTrend } from "@/services/exposure";
import { formatMoneyShort } from "@/core/money";
import { Kpi } from "@/ui/kpi";
import { money as words } from "@/ui/copy";

export const metadata: Metadata = { title: "Event" };

export default async function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, clientName, ownerName, members, scope } = await loadEvent(id);
  const [contractRows, deadlines, activity, agreement, openAlerts, openTasks] = await Promise.all([
    listContractsForEvent(ctx, id),
    listObligations(ctx, { eventId: id }),
    listEventActivity(ctx, id, 8),
    rulesForEvent(ctx.db, ctx.actor.orgId, event.clientId, event.startDate),
    listOpenAlerts(ctx, { eventId: id }),
    listOpenTasks(ctx, id),
  ]);
  const cfg = ctx.actor.config;
  const toReview = contractRows.reduce((n, k) => n + k.proposedCount, 0);
  const threshold = event.exposureThresholdMinor ?? cfg.rules.exposureThresholdMinor;
  const [exposure, trend, { savings }] = await Promise.all([getEventExposure(ctx, id), getEventTrend(ctx, id, 30), getEventSavings(ctx, id)]);
  const cur = exposure.current;
  const ccy = event.baseCurrency;

  // Pickup across every confirmed room block: rooms picked up / rooms in the block.
  let blockRooms = 0;
  let picked = 0;
  for (const k of exposure.context.input.contracts) {
    for (const c of k.clauses) {
      if (c.type !== "ROOM_BLOCK") continue;
      const nights = (c.terms as { nights: Array<{ date: string; rooms: number }> }).nights;
      for (const n of nights) {
        blockRooms += n.rooms;
        picked += c.pickup?.nights[n.date]?.pickedUp ?? 0;
      }
    }
  }
  const pickupPct = blockRooms ? Math.round((picked / blockRooms) * 100) : null;

  // What changed since last week, in words (no percentages or arrows on summary screens).
  const pts = trend.points;
  const weekAgo = pts.length > 7 ? pts[pts.length - 8].currentMinor : null;
  const change = weekAgo !== null && weekAgo > 0 ? cur.current.totalMinor - weekAgo : null;
  const short = (m: number) => formatMoneyShort(m, ccy);
  // A savings alert repeats the savings row above it (which explains the release night by night).
  const alertItems = await toAlertItems(ctx, savings.length ? openAlerts.filter((a) => a.rule !== "SAVING") : openAlerts);
  const todo = savings.length + alertItems.length;

  return (
    <div className="flex flex-col gap-5">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Kpi
        label={words.current.plain}
        term={words.current.term}
        accent={cur.overThreshold ? "risk" : undefined}
        value={<MoneyShort minor={cur.current.totalMinor} currency={ccy} />}
        caption={
          <>
            {cur.overThreshold ? (
              <span className="font-medium text-risk">{words.overLimit} of {short(threshold)}. </span>
            ) : (
              <>Your limit is {short(threshold)}. </>
            )}
            {change !== null && Math.abs(change) >= 100 ? `${change < 0 ? "Down" : "Up"} ${short(Math.abs(change))} on last week.` : null}
          </>
        }
      >
        <p className="text-table text-muted">
          {words.yours} <MoneyShort minor={cur.current.agencyMinor} currency={ccy} className="font-medium text-ink" /> · {words.clients}{" "}
          <MoneyShort minor={cur.current.clientMinor} currency={ccy} className="font-medium text-ink" />
          {cur.current.unassignedMinor > 0 ? (
            <>
              {" "}
              · {words.unassigned} <MoneyShort minor={cur.current.unassignedMinor} currency={ccy} className="font-medium text-ink" />
            </>
          ) : null}
        </p>
      </Kpi>
      <Kpi
        label={words.cancel.plain}
        term={words.cancel.term}
        value={<MoneyShort minor={cur.cancellation.totalMinor} currency={ccy} />}
        caption="What suppliers could charge if the event were cancelled today, less deposits already paid."
      />
      <Kpi
        label="Rooms booked"
        term="pickup"
        value={pickupPct === null ? "–" : `${picked.toLocaleString("en-US")} of ${blockRooms.toLocaleString("en-US")}`}
        caption={pickupPct === null ? "No room blocks on this event" : `room nights booked so far (${pickupPct}%)`}
      >
        {pickupPct !== null ? (
          <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-sunken">
            <span style={{ width: `${Math.min(100, pickupPct)}%` }} className="block h-full rounded-full bg-brand" />
          </span>
        ) : null}
      </Kpi>
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel
          title="What to do for this event"
          description={todo ? `${todo} thing${todo === 1 ? "" : "s"}. Alerts close when you record a decision, or on their own when the problem clears.` : "Nothing needs you right now."}
        >
          {savings.length ? (
            <ul className="divide-y divide-rule">
              {savings.map((s) => (
                <li key={`${s.contractId}-${s.blockName}`} className="flex items-start justify-between gap-4 px-5 py-3 text-table">
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      <span className="font-medium">
                        Give back {s.roomNights} room night{s.roomNights === 1 ? "" : "s"}
                      </span>{" "}
                      at {s.supplierName} ({s.blockName}) by <span className="font-medium">{formatDate(s.reviewDate)}</span>
                    </span>
                    <span className="block text-meta text-muted">
                      The contract lets you reduce the block by up to {s.maxReductionPct}% on that date. Only rooms nobody is expected to book are counted:{" "}
                      {s.releases.map((r) => `${r.rooms} on ${formatDate(r.date).replace(/, \d{4}$/, "")}`).join(", ")}.
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <MoneyShort minor={s.savingMinor} currency={s.currency} className="font-display text-section font-medium text-settled" />
                    <span className="block text-meta text-faint">saved</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {alertItems.length ? (
            <div className={savings.length ? "border-t border-rule" : undefined}>
              <AlertList alerts={alertItems} showEvent={false} />
            </div>
          ) : null}
        </Panel>
        {openTasks.length ? (
          <Panel title="Supplier updates to make" description="From approved changes. Tick each one off once the supplier has confirmed.">
            <TaskList tasks={openTasks.map((t) => ({ id: t.id, title: t.title, done: false }))} canEdit={can(ctx.actor, "event.edit", scope)} />
          </Panel>
        ) : null}
        <Panel
          title="Contracts"
          actions={
            <Link href={`/events/${id}/contracts`} className="text-table text-brand hover:underline">
              View all
            </Link>
          }
        >
          {contractRows.length === 0 ? (
            <p className="px-4 py-6 text-center text-table text-muted">No contracts yet.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {contractRows.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-table">
                  <Link href={`/contracts/${k.id}`} className="font-medium hover:underline">
                    {k.supplierName}: {k.title}
                  </Link>
                  <span className="flex items-center gap-3">
                    <Money minor={k.contractedValueMinor} currency={k.currency} contextCurrency={event.baseCurrency} />
                    {k.proposedCount ? (
                      <Status tone="watch">{k.proposedCount} to review</Status>
                    ) : (
                      <Status tone={contractStatusTone[k.status]}>{contractStatusLabels[k.status]}</Status>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {toReview ? (
            <p className="border-t border-rule bg-watch-bg px-4 py-2 text-table text-watch">
              {toReview} proposed term{toReview === 1 ? "" : "s"} waiting for review. Unconfirmed terms don&apos;t count toward exposure.
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Upcoming deadlines"
          actions={
            <Link href={`/events/${id}/deadlines`} className="text-table text-brand hover:underline">
              All deadlines
            </Link>
          }
        >
          {deadlines.length === 0 ? (
            <p className="px-4 py-6 text-center text-table text-muted">No open deadlines.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {deadlines.slice(0, 6).map((o) => {
                const rel = relativeDue(o.dueAt, o.dueTz, ctx.now());
                return (
                  <li key={o.id} className="flex flex-col gap-1 px-4 py-2 text-table md:flex-row md:items-center md:justify-between md:gap-4">
                    <span className="min-w-0">
                      <span className="font-medium">{o.label}</span>{" "}
                      <span className="text-muted">
                        {obligationKindLabels[o.kind]} · {o.supplierName}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      {o.amountMinor !== null && o.currency ? <Money minor={o.amountMinor} currency={o.currency} /> : null}
                      <span className="num text-muted">{formatDue(o.dueAt, o.dueTz)}</span>
                      <Status tone={o.dueAt < ctx.now() ? "risk" : rel.days <= 7 ? "watch" : "muted"}>{rel.text}</Status>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Details">
          <Attributes
            items={[
              { label: term(cfg, "client"), value: <Link href={`/clients/${event.clientId}`} className="text-brand hover:underline">{clientName}</Link> },
              {
                label: "Client agreement",
                value: agreement ? (
                  agreement.agreementName
                ) : (
                  <span className="text-watch">None in force. Exposure will be unassigned.</span>
                ),
              },
              { label: "Type", value: event.type },
              { label: "Owner", value: ownerName },
              { label: "Team", value: members.length ? members.map((m) => m.name).join(", ") : null },
              { label: "Timezone", value: event.timezone },
              { label: "Reporting currency", value: event.baseCurrency },
              {
                label: "Alert threshold",
                value: (
                  <>
                    <Money minor={threshold} currency={event.baseCurrency} />
                    {event.exposureThresholdMinor === null ? <span className="text-muted"> (default)</span> : null}
                  </>
                ),
              },
            ]}
          />
        </Panel>
        <Panel
          title="Recent activity"
          actions={
            <Link href={`/events/${id}/activity`} className="text-table text-brand hover:underline">
              All
            </Link>
          }
        >
          <ActivityList entries={activity} timezone={ctx.actor.orgTimezone} compact />
        </Panel>
      </div>
    </div>
    </div>
  );
}
