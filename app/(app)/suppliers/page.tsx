import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSuppliers, SUPPLIER_TYPES, supplierTypeLabels } from "@/services/suppliers";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { Table, Td, Th, Tr } from "@/ui/table";
import { NewSupplier } from "./new-supplier";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await appCtx();
  const rows = await listSuppliers(ctx);
  const cfg = ctx.actor.config;
  const canEdit = can(ctx.actor, "supplier.edit");
  const types = SUPPLIER_TYPES.map((t) => ({ value: t, label: supplierTypeLabels[t] }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={term(cfg, "supplier", { plural: true })} actions={canEdit ? <NewSupplier types={types} /> : null} />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState title="No suppliers yet">
            Suppliers are added here or while adding a contract to an event.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Location</Th>
                <Th align="right">Contracts</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td className="text-muted">{supplierTypeLabels[s.type]}</Td>
                  <Td className="text-muted">{[s.city, s.country].filter(Boolean).join(", ")}</Td>
                  <Td align="right">{s.contractCount}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
