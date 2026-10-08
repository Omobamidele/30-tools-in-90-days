import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/auth/policy";
import { listSuppliers } from "@/services/suppliers";
import { extractor } from "@/adapters/extraction";
import { Panel } from "@/ui/page";
import { loadEvent } from "../../load";
import { BulkImport } from "./bulk-import";

export const metadata: Metadata = { title: "Import contracts" };

export default async function ImportContractsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  if (!can(ctx.actor, "contract.edit", scope)) redirect(`/events/${id}/contracts`);
  const suppliers = await listSuppliers(ctx);
  const reader = extractor(ctx.actor.config.extraction.enabled);

  return (
    <Panel
      title="Import signed contracts"
      description="Drop in the PDFs. Each one becomes a draft contract, and its terms are read for you to check before anything counts."
    >
      {!reader.available ? (
        <p data-surface className="border-b border-rule bg-watch-bg px-5 py-2.5 text-table text-watch">
          {reader.unavailableReason} Contracts will still be created with their PDFs attached.
        </p>
      ) : null}
      <BulkImport
        eventId={id}
        defaultCurrency={event.baseCurrency}
        currencies={ctx.actor.config.finance.enabledCurrencies}
        defaultCity={(event.destination ?? "").split(",")[0].trim()}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, city: s.city }))}
        canAddSuppliers={can(ctx.actor, "supplier.edit")}
      />
    </Panel>
  );
}
