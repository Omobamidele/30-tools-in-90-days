import type { Metadata } from "next";
import Link from "next/link";
import { appCtx } from "@/services/app-ctx";
import { listClients } from "@/services/clients";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Table, Td, Th, Tr } from "@/ui/table";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const ctx = await appCtx();
  const rows = await listClients(ctx);
  const cfg = ctx.actor.config;
  const canEdit = can(ctx.actor, "client.edit");
  const newButton = canEdit ? (
    <ButtonLink href="/clients/new" variant="primary">
      New {term(cfg, "client", { lower: true })}
    </ButtonLink>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={term(cfg, "client", { plural: true })} actions={newButton} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title={`No ${term(cfg, "client", { plural: true, lower: true })} yet`}
            actions={newButton}
          >
            Add a client, then record their agreement so exposure is assigned to the right party.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Industry</Th>
                <Th>Billing contact</Th>
                <Th align="right">{term(cfg, "event", { plural: true })}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">
                    <Link href={`/clients/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{c.industry}</Td>
                  <Td className="text-muted">{c.billingContactName}</Td>
                  <Td align="right">{c.eventCount}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
