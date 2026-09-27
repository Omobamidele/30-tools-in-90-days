import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { getContract } from "@/services/contracts";
import { eventScope } from "@/services/events";
import { SUPPLIER_TYPES, supplierTypeLabels } from "@/services/suppliers";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { PageHeader, Panel } from "@/ui/page";
import { ContractForm } from "../../contract-form";

export const metadata: Metadata = { title: "Edit contract" };

export default async function EditContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  const { contract, event, supplier } = await getContract(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  if (!can(ctx.actor, "contract.edit", await eventScope(ctx.db, ctx.actor.orgId, event.id))) redirect(`/contracts/${id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Edit contract details"
        crumbs={[
          { href: `/events/${event.id}`, label: event.name },
          { href: `/contracts/${id}`, label: supplier.name },
          { label: "Edit" },
        ]}
      />
      <Panel>
        <ContractForm
          contractId={id}
          cancelHref={`/contracts/${id}`}
          suppliers={[{ id: supplier.id, name: supplier.name, city: supplier.city }]}
          supplierTypes={SUPPLIER_TYPES.map((t) => ({ value: t, label: supplierTypeLabels[t] }))}
          currencies={ctx.actor.config.finance.enabledCurrencies}
          canAddSupplier={false}
          initial={{
            supplierId: supplier.id,
            title: contract.title,
            reference: contract.reference ?? "",
            signedDate: contract.signedDate ?? "",
            currency: contract.currency,
            contractedValue: (contract.contractedValueMinor / 100).toFixed(2),
          }}
        />
      </Panel>
    </div>
  );
}
