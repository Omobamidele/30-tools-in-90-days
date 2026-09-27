import "server-only";
import type { ServiceCtx } from "@/services/context";
import { listContractsForEvent } from "@/services/contracts";
import { CHANGE_TYPES, changeTypeLabels } from "@/services/changes";

export async function changeEditorOptions(ctx: ServiceCtx, eventId: string) {
  const cfg = ctx.actor.config;
  const contracts = await listContractsForEvent(ctx, eventId);
  const categories = [...new Set([...Object.keys(cfg.pricing.markupByCategoryPct), "Other"])];
  return {
    types: CHANGE_TYPES.map((t) => ({ value: t, label: changeTypeLabels[t] })),
    categories,
    contracts: contracts.map((c) => ({ id: c.id, label: `${c.supplierName}: ${c.title}` })),
    pricing: cfg.pricing,
  };
}
