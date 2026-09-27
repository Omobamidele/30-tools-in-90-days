import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/ui/page";
import { EventForm } from "../event-form";
import { eventFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const ctx = await appCtx();
  if (!can(ctx.actor, "event.create")) redirect("/events");
  const cfg = ctx.actor.config;
  const opts = await eventFormOptions(ctx);
  const labels = { client: term(cfg, "client"), event: term(cfg, "event") };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`New ${labels.event.toLowerCase()}`}
        crumbs={[{ href: "/events", label: term(cfg, "event", { plural: true }) }, { label: "New" }]}
      />
      <Panel>
        {opts.clients.length === 0 ? (
          <EmptyState
            title={`Add a ${labels.client.toLowerCase()} first`}
            actions={can(ctx.actor, "client.edit") ? <ButtonLink href="/clients/new" variant="primary">New {labels.client.toLowerCase()}</ButtonLink> : null}
          >
            Every {labels.event.toLowerCase()} belongs to a {labels.client.toLowerCase()}, whose agreement decides who carries penalties.
          </EmptyState>
        ) : (
          <EventForm
            {...opts}
            labels={labels}
            ownerLocked={ctx.actor.role === "EVENT_MANAGER"}
            initial={{
              clientId: "",
              name: "",
              type: "",
              startDate: "",
              endDate: "",
              destination: "",
              timezone: ctx.actor.orgTimezone,
              ownerId: ctx.actor.userId,
              forecastAttendance: "",
              baseCurrency: ctx.actor.baseCurrency,
              exposureThreshold: "",
              memberIds: [],
              coverImage: "",
            }}
          />
        )}
      </Panel>
    </div>
  );
}
