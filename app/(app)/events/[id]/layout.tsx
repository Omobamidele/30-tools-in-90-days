import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { allowedTransitions, eventStatusLabels } from "@/services/events";
import { ButtonLink } from "@/ui/page";
import { EventCover, eventCountdown } from "@/ui/event-cover";
import { Status, eventStatusTone } from "@/ui/status";
import { RouteTabs } from "@/ui/tabs";
import { formatDateRange } from "@/ui/format";
import { loadEvent } from "./load";
import { StatusMenu } from "./status-menu";
import { getEventTimeline } from "@/services/exposure";
import { CommitmentTimeline } from "@/ui/commitment-timeline";
import { formatMoney } from "@/core/money";
import { localDateOf } from "@/core/time";
import { formatDue } from "@/ui/format";

export default async function EventLayout({ children, params }: LayoutProps<"/events/[id]">) {
  const { id } = await params;
  const { ctx, event, clientName, ownerName, scope } = await loadEvent(id);
  const cfg = ctx.actor.config;
  const canEdit = can(ctx.actor, "event.edit", scope);
  const canContract = can(ctx.actor, "contract.edit", scope);
  const base = `/events/${id}`;
  const timeline = await getEventTimeline(ctx, id);

  return (
    <div className="mx-auto max-w-7xl">
      <EventCover
        cover={event.coverImage}
        title={event.name}
        crumbs={[{ href: "/events", label: term(cfg, "event", { plural: true }) }, { label: event.name }]}
        status={<Status tone={eventStatusTone[event.status]}>{eventStatusLabels[event.status]}</Status>}
        facts={[
          clientName,
          formatDateRange(event.startDate, event.endDate),
          ...(event.destination ? [event.destination] : []),
          `Owner ${ownerName}`,
          <span key="forecast" className="num">{event.forecastAttendance.toLocaleString("en-US")} attendees forecast</span>,
        ]}
        countdown={eventCountdown(timeline.asOf, event.startDate, event.endDate)}
        actions={
          <>
            {canEdit ? (
              <StatusMenu eventId={id} eventName={event.name} options={allowedTransitions(event.status)} labels={eventStatusLabels} />
            ) : null}
            {canEdit ? <ButtonLink href={`${base}/edit`}>Edit</ButtonLink> : null}
            {canContract ? (
              <ButtonLink href={`${base}/contracts/new`} variant="primary">
                Add contract
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <div className="mb-6">
        <CommitmentTimeline
          today={timeline.asOf}
          start={event.startDate}
          end={event.endDate}
          currency={event.baseCurrency}
          steps={timeline.steps}
          marks={timeline.marks.map((m) => ({
            id: m.id,
            kind: m.kind,
            label: m.label,
            date: localDateOf(m.dueAt, event.timezone),
            dueText: formatDue(m.dueAt, event.timezone),
            amountText: m.amountMinor !== null && m.currency ? formatMoney(m.amountMinor, m.currency) : null,
          }))}
        />
      </div>
      <RouteTabs
        base={base}
        tabs={[
          { href: base, label: "Overview" },
          { href: `${base}/exposure`, label: "Exposure" },
          { href: `${base}/contracts`, label: "Contracts" },
          { href: `${base}/changes`, label: term(cfg, "changeRequest", { plural: true }) },
          { href: `${base}/deadlines`, label: "Deadlines" },
          { href: `${base}/discussion`, label: "Discussion" },
          ...(["DELIVERED", "RECONCILED", "CANCELLED"].includes(event.status) ? [{ href: `${base}/post-event`, label: "Post-event" }] : []),
          { href: `${base}/activity`, label: "Activity" },
        ]}
      />
      <div className="pt-6">{children}</div>
    </div>
  );
}
