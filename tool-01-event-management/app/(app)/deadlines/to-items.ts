import "server-only";
import { can } from "@/auth/policy";
import type { ServiceCtx } from "@/services/context";
import { eventScope } from "@/services/events";
import { obligationKindLabels, type ObligationRow } from "@/services/obligations";
import { formatDue, formatDateTime, relativeDue } from "@/ui/format";
import type { DeadlineItem } from "./deadline-list";

/** Serialises obligations for the client list, with per-row permissions resolved on the server. */
export async function toDeadlineItems(ctx: ServiceCtx, rows: ObligationRow[]): Promise<DeadlineItem[]> {
  const now = ctx.now();
  const scopes = new Map<string, Awaited<ReturnType<typeof eventScope>>>();
  for (const id of new Set(rows.map((r) => r.eventId))) scopes.set(id, await eventScope(ctx.db, ctx.actor.orgId, id));
  return rows.map((r) => {
    const rel = relativeDue(r.dueAt, r.dueTz, now);
    const scope = scopes.get(r.eventId)!;
    return {
      id: r.id,
      kind: r.kind,
      kindLabel: obligationKindLabels[r.kind],
      label: r.label,
      dueText: formatDue(r.dueAt, r.dueTz),
      dueOrgText: formatDateTime(r.dueAt, ctx.actor.orgTimezone),
      relative: rel.text,
      days: rel.days,
      overdue: r.dueAt.getTime() < now.getTime(),
      amountMinor: r.amountMinor,
      paidMinor: r.paidMinor,
      currency: r.currency,
      status: r.status,
      eventId: r.eventId,
      eventName: r.eventName,
      contractId: r.contractId,
      supplierName: r.supplierName,
      ownerName: r.ownerName,
      canEdit: can(ctx.actor, "event.edit", scope),
      canPay: can(ctx.actor, "payment.record", scope),
    };
  });
}
