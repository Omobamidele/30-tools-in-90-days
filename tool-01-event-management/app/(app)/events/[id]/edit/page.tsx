import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { Panel } from "@/ui/page";
import { loadEvent } from "../load";
import { EventForm } from "../../event-form";
import { eventFormOptions } from "../../form-data";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  if (!can(ctx.actor, "event.edit", scope)) redirect(`/events/${id}`);
  const cfg = ctx.actor.config;
  const opts = await eventFormOptions(ctx);

  return (
    <Panel title="Edit details" className="max-w-3xl">
      <EventForm
        {...opts}
        eventId={id}
        lockVersion={event.lockVersion}
        labels={{ client: term(cfg, "client"), event: term(cfg, "event") }}
        ownerLocked={ctx.actor.role === "EVENT_MANAGER"}
        initial={{
          clientId: event.clientId,
          name: event.name,
          type: event.type,
          startDate: event.startDate,
          endDate: event.endDate,
          destination: event.destination ?? "",
          timezone: event.timezone,
          ownerId: event.ownerId,
          forecastAttendance: String(event.forecastAttendance),
          baseCurrency: event.baseCurrency,
          exposureThreshold: event.exposureThresholdMinor !== null ? (event.exposureThresholdMinor / 100).toFixed(2) : "",
          memberIds: scope.memberIds,
          coverImage: event.coverImage ?? "",
        }}
      />
    </Panel>
  );
}
