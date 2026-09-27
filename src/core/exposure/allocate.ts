import { percentOf, type Minor } from "../money";
import type { Allocation, LiabilityCategory, LiabilityRules } from "./types";

/**
 * Splits an exposure amount between agency and client using the client agreement's
 * liability rule for that category. With no rule, the whole amount is "unassigned".
 * It is never silently given to either party (spec FR-1.3).
 * SPLIT rounds the agency share half away from zero; the client gets the remainder,
 * so the parts always sum to the whole.
 */
export function allocate(amountMinor: Minor, category: LiabilityCategory, rules: LiabilityRules | null): Allocation {
  const rule = rules?.[category] ?? null;
  if (!rule) return { agencyMinor: 0, clientMinor: 0, unassignedMinor: amountMinor, rule: null };
  switch (rule.bearer) {
    case "AGENCY":
      return { agencyMinor: amountMinor, clientMinor: 0, unassignedMinor: 0, rule };
    case "CLIENT":
      return { agencyMinor: 0, clientMinor: amountMinor, unassignedMinor: 0, rule };
    case "SPLIT": {
      const agencyMinor = percentOf(amountMinor, rule.agencyPct);
      return { agencyMinor, clientMinor: amountMinor - agencyMinor, unassignedMinor: 0, rule };
    }
  }
}
