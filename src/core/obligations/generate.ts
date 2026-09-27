import {
  cancellationTerms,
  finalGuaranteeTerms,
  otherDeadlineTerms,
  paymentTerms,
  roomBlockTerms,
  type ClauseType,
} from "../clauses/schemas";
import { percentOf, type Minor } from "../money";

export type ObligationKind = "PAYMENT" | "CUTOFF" | "REVIEW" | "GUARANTEE" | "TIER_CHANGE" | "OTHER";

// Dated obligations derived from confirmed clauses. Times are local to the supplier;
// the service converts them to UTC with the event's timezone.
export type GeneratedObligation = {
  clauseId: string;
  kind: ObligationKind;
  label: string;
  localDate: string;
  localTime: string;
  amountMinor: Minor | null;
};

export function generateObligations(
  clause: { id: string; type: ClauseType; terms: unknown },
  contract: { contractedValueMinor: Minor },
): GeneratedObligation[] {
  const base = { clauseId: clause.id };
  switch (clause.type) {
    case "PAYMENT": {
      const t = paymentTerms.parse(clause.terms);
      const amount =
        t.amountMinor ?? (t.percentOfContract !== null ? percentOf(contract.contractedValueMinor, t.percentOfContract) : null);
      return [{ ...base, kind: "PAYMENT", label: t.label, localDate: t.dueDate, localTime: t.dueTime, amountMinor: amount }];
    }
    case "ROOM_BLOCK": {
      const t = roomBlockTerms.parse(clause.terms);
      return [
        {
          ...base,
          kind: "CUTOFF",
          label: `Room block cutoff (${t.blockName})`,
          localDate: t.cutoffDate,
          localTime: t.cutoffTime,
          amountMinor: null,
        },
        ...t.reviewPoints.map((r) => ({
          ...base,
          kind: "REVIEW" as const,
          label: `Block review: reduce up to ${r.maxReductionPct}% (${t.blockName})`,
          localDate: r.date,
          localTime: t.cutoffTime,
          amountMinor: null,
        })),
      ];
    }
    case "CANCELLATION": {
      const t = cancellationTerms.parse(clause.terms);
      // Each tier step is the last moment to cancel at the lower penalty: due at 00:00 on the step date.
      return t.tiers.map((tier) => ({
        ...base,
        kind: "TIER_CHANGE" as const,
        label:
          tier.penaltyPct !== null
            ? `Cancellation penalty rises to ${tier.penaltyPct}%`
            : "Cancellation penalty rises",
        localDate: tier.startsOn,
        localTime: "00:00",
        amountMinor: null,
      }));
    }
    case "FINAL_GUARANTEE": {
      const t = finalGuaranteeTerms.parse(clause.terms);
      return [
        {
          ...base,
          kind: "GUARANTEE",
          label: t.subject === "FB_COVERS" ? "Final F&B guarantee" : "Final attendance guarantee",
          localDate: t.dueDate,
          localTime: t.dueTime,
          amountMinor: null,
        },
      ];
    }
    case "OTHER_DEADLINE": {
      const t = otherDeadlineTerms.parse(clause.terms);
      return [{ ...base, kind: "OTHER", label: t.label, localDate: t.dueDate, localTime: t.dueTime, amountMinor: null }];
    }
    case "FB_MINIMUM":
      return [];
  }
}

/**
 * Markers are dates on which something happens by itself (a penalty step, rooms released at
 * cutoff, a review window closing). Once passed they are history, never "overdue".
 */
export const MARKER_KINDS: ObligationKind[] = ["TIER_CHANGE", "REVIEW", "CUTOFF"];
export const isMarker = (kind: string) => (MARKER_KINDS as string[]).includes(kind);
