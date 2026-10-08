import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { getClient, LIABILITY_CATEGORIES, liabilityCategoryLabels } from "@/services/clients";
import { listEvents, eventStatusLabels } from "@/services/events";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { localDateOf } from "@/core/time";
import { Attributes, ButtonLink, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Status, eventStatusTone } from "@/ui/status";
import { formatDateRange } from "@/ui/format";
import { AgreementsPanel } from "./agreements-panel";
import { SharePanel } from "./share-panel";
import { listShareLinks } from "@/services/client-share";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  const data = await getClient(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const events = (await listEvents(ctx)).filter((e) => e.clientId === id);
  const cfg = ctx.actor.config;
  const canEdit = can(ctx.actor, "client.edit");
  const { client } = data;
  const canShare = can(ctx.actor, "client.share");
  const links = canShare ? await listShareLinks(ctx, id) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={client.name}
        meta={client.industry}
        crumbs={[{ href: "/clients", label: term(cfg, "client", { plural: true }) }, { label: client.name }]}
        actions={canEdit ? <ButtonLink href={`/clients/${id}/edit`}>Edit details</ButtonLink> : null}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <AgreementsPanel
            clientId={id}
            agreements={data.agreements}
            categories={LIABILITY_CATEGORIES}
            categoryLabels={liabilityCategoryLabels}
            canEdit={canEdit}
            today={localDateOf(new Date(), ctx.actor.orgTimezone)}
          />
          <Panel title={term(cfg, "event", { plural: true })}>
            {events.length === 0 ? (
              <EmptyState title={`No ${term(cfg, "event", { plural: true, lower: true })} for this client yet`} />
            ) : (
              <ul className="divide-y divide-rule">
                {events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <Link href={`/events/${e.id}`} className="text-body font-medium hover:underline">
                        {e.name}
                      </Link>
                      <p className="text-meta text-muted">
                        {formatDateRange(e.startDate, e.endDate)}
                        {e.destination ? ` · ${e.destination}` : ""}
                      </p>
                    </div>
                    <Status tone={eventStatusTone[e.status]}>{eventStatusLabels[e.status]}</Status>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-4 self-start">
        <Panel title="Details">
          <Attributes
            items={[
              { label: "Industry", value: client.industry },
              { label: "Billing contact", value: client.billingContactName },
              {
                label: "Billing email",
                value: client.billingContactEmail ? (
                  <a className="text-brand hover:underline" href={`mailto:${client.billingContactEmail}`}>
                    {client.billingContactEmail}
                  </a>
                ) : null,
              },
              { label: "Notes", value: client.notes ? <span className="whitespace-pre-line">{client.notes}</span> : null },
            ]}
          />
        </Panel>
        {canShare ? (
          <SharePanel
            clientId={id}
            clientName={client.name}
            links={links.map((l) => ({ id: l.id, createdAt: l.createdAt.toISOString(), expiresAt: l.expiresAt.toISOString(), lastViewedAt: l.lastViewedAt?.toISOString() ?? null, viewCount: l.viewCount }))}
          />
        ) : null}
        </div>
      </div>
    </div>
  );
}
