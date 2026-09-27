import "server-only";
import { can } from "@/auth/policy";
import type { ServiceCtx } from "@/services/context";
import { eventScope } from "@/services/events";
import { ALERT_RULES, type AlertRow } from "@/services/alerts";
import { formatDateTime } from "@/ui/format";
import type { AlertItem } from "./alert-list";

export async function toAlertItems(ctx: ServiceCtx, rows: AlertRow[]): Promise<AlertItem[]> {
  const scopes = new Map<string, Awaited<ReturnType<typeof eventScope>>>();
  for (const id of new Set(rows.map((r) => r.eventId))) scopes.set(id, await eventScope(ctx.db, ctx.actor.orgId, id));
  return rows.map((a) => {
    const d = (a.detail ?? {}) as Record<string, unknown>;
    // Pre-fill what the system worked out; the person confirms or corrects it when deciding.
    const amount = a.rule === "CUTOFF" ? d.attritionMinor : a.rule === "SAVING" ? d.savingMinor : null;
    const suggested = typeof amount === "number" ? (amount / 100).toFixed(2) : null;
    return {
      id: a.id,
      severity: a.severity,
      title: a.title,
      ruleLabel: ALERT_RULES[a.rule as keyof typeof ALERT_RULES] ?? a.rule,
      eventId: a.eventId,
      eventName: a.eventName,
      openedText: formatDateTime(a.openedAt, ctx.actor.orgTimezone),
      currency: typeof d.currency === "string" ? d.currency : a.baseCurrency,
      suggestedReduction: suggested,
      roomNightsAbout: a.rule === "SAVING" || a.rule === "CUTOFF",
      suggestedRoomNights: a.rule === "SAVING" && typeof d.roomNights === "number" ? d.roomNights : null,
      canDecide: can(ctx.actor, "decision.record", scopes.get(a.eventId)!),
    };
  });
}
