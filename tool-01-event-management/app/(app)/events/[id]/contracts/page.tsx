import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/auth/policy";
import { contractStatusLabels, listContractsForEvent } from "@/services/contracts";
import { supplierTypeLabels } from "@/services/suppliers";
import { ButtonLink, EmptyState, Panel } from "@/ui/page";
import { Table, Td, Th, Tr } from "@/ui/table";
import { Status, contractStatusTone } from "@/ui/status";
import { Money } from "@/ui/money";
import { formatDate } from "@/ui/format";
import { loadEvent } from "../load";

export const metadata: Metadata = { title: "Contracts" };

export default async function EventContractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  const rows = await listContractsForEvent(ctx, id);
  const canAdd = can(ctx.actor, "contract.edit", scope);

  return (
    <Panel
      title="Supplier contracts"
      description="Only confirmed terms count toward deadlines and exposure."
      actions={
        canAdd && rows.length ? (
          <>
            <ButtonLink href={`/events/${id}/contracts/import`} size="sm">
              Import PDFs
            </ButtonLink>
            <ButtonLink href={`/events/${id}/contracts/new`} size="sm">
              Add contract
            </ButtonLink>
          </>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          actions={
            canAdd ? (
              <>
                <ButtonLink href={`/events/${id}/contracts/import`} variant="primary">
                  Import signed PDFs
                </ButtonLink>
                <ButtonLink href={`/events/${id}/contracts/new`}>Add one manually</ButtonLink>
              </>
            ) : null
          }
        >
          Drop in the signed supplier contracts. Each one becomes a draft, and its terms are read for you to check.
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Supplier</Th>
              <Th>Contract</Th>
              <Th>Status</Th>
              <Th>Terms</Th>
              <Th>Signed</Th>
              <Th align="right">Contracted value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((k) => (
              <Tr key={k.id}>
                <Td className="font-medium">
                  <Link href={`/contracts/${k.id}`} className="hover:underline">
                    {k.supplierName}
                  </Link>
                  <span className="block text-meta font-normal text-muted">{supplierTypeLabels[k.supplierType]}</span>
                </Td>
                <Td>
                  {k.title}
                  {k.version > 1 ? <span className="ml-1.5 text-meta text-muted">v{k.version}</span> : null}
                </Td>
                <Td>
                  <Status tone={contractStatusTone[k.status]}>{contractStatusLabels[k.status]}</Status>
                </Td>
                <Td>
                  {k.proposedCount > 0 ? (
                    <Status tone="watch">{k.proposedCount} to review</Status>
                  ) : (
                    <span className="num">{k.confirmedCount} confirmed</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDate(k.signedDate)}</Td>
                <Td align="right">
                  <Money minor={k.contractedValueMinor} currency={k.currency} contextCurrency={event.baseCurrency} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
