import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/auth/policy";
import { listSuppliers, SUPPLIER_TYPES, supplierTypeLabels } from "@/services/suppliers";
import { Panel } from "@/ui/page";
import { loadEvent } from "../../load";
import { ContractForm } from "../../../../contracts/contract-form";

export const metadata: Metadata = { title: "Add contract" };

export default async function NewContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  if (!can(ctx.actor, "contract.edit", scope)) redirect(`/events/${id}/contracts`);
  const suppliers = await listSuppliers(ctx);

  return (
    <Panel title="Add contract" description="Record the contract first, then enter its terms." className="max-w-3xl">
      <ContractForm
        eventId={id}
        cancelHref={`/events/${id}/contracts`}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, city: s.city }))}
        supplierTypes={SUPPLIER_TYPES.map((t) => ({ value: t, label: supplierTypeLabels[t] }))}
        currencies={ctx.actor.config.finance.enabledCurrencies}
        canAddSupplier={can(ctx.actor, "supplier.edit")}
        initial={{ supplierId: "", title: "", reference: "", signedDate: "", currency: event.baseCurrency, contractedValue: "" }}
      />
    </Panel>
  );
}
