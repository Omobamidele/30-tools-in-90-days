import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { getClient } from "@/services/clients";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { PageHeader, Panel } from "@/ui/page";
import { ClientForm } from "../../client-form";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  if (!can(ctx.actor, "client.edit")) redirect(`/clients/${id}`);
  const { client } = await getClient(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const cfg = ctx.actor.config;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Edit details"
        crumbs={[
          { href: "/clients", label: term(cfg, "client", { plural: true }) },
          { href: `/clients/${id}`, label: client.name },
          { label: "Edit" },
        ]}
      />
      <Panel>
        <ClientForm
          clientId={id}
          cancelHref={`/clients/${id}`}
          initial={{
            name: client.name,
            industry: client.industry ?? "",
            billingContactName: client.billingContactName ?? "",
            billingContactEmail: client.billingContactEmail ?? "",
            notes: client.notes ?? "",
          }}
        />
      </Panel>
    </div>
  );
}
