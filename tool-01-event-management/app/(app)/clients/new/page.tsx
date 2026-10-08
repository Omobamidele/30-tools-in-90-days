import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { PageHeader, Panel } from "@/ui/page";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await appCtx();
  if (!can(ctx.actor, "client.edit")) redirect("/clients");
  const cfg = ctx.actor.config;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`New ${term(cfg, "client", { lower: true })}`}
        crumbs={[{ href: "/clients", label: term(cfg, "client", { plural: true }) }, { label: "New" }]}
      />
      <Panel>
        <ClientForm cancelHref="/clients" />
      </Panel>
    </div>
  );
}
