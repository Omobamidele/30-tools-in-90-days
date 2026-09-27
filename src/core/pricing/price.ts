import { percentOf, sum, type Minor } from "../money";

export type PricingRules = {
  defaultMarkupPct: number;
  markupByCategoryPct: Record<string, number>;
  managementFeePct: number;
};

export function markupFor(rules: PricingRules, category: string): number {
  return rules.markupByCategoryPct[category] ?? rules.defaultMarkupPct;
}

/**
 * Suggested client price for a cost change: cost + category markup, plus the management
 * fee on the marked-up amount. Works symmetrically for reductions (negative costs).
 */
export function suggestPrice(rules: PricingRules, category: string, costDeltaMinor: Minor): Minor {
  const marked = costDeltaMinor + percentOf(costDeltaMinor, markupFor(rules, category));
  return marked + percentOf(marked, rules.managementFeePct);
}

export type ChangeTotals = {
  costDeltaMinor: Minor;
  priceDeltaMinor: Minor;
  marginMinor: Minor;
  /** Margin on the change, as % of its price. Null when the price change is zero. */
  marginPct: number | null;
};

export function changeTotals(lines: Array<{ costDeltaMinor: Minor; priceDeltaMinor: Minor }>): ChangeTotals {
  const cost = sum(lines.map((l) => l.costDeltaMinor));
  const price = sum(lines.map((l) => l.priceDeltaMinor));
  const margin = price - cost;
  return {
    costDeltaMinor: cost,
    priceDeltaMinor: price,
    marginMinor: margin,
    marginPct: price === 0 ? null : Math.round((margin / price) * 10_000) / 100,
  };
}

export type ApprovalRules = { approvalLimitMinor: Minor; marginFloorPct: number };

/**
 * Internal approval is required when the change's value (largest of |cost|, |price|)
 * exceeds the limit, or its margin falls below the floor. A cost change with no price
 * change (absorbed cost) always needs approval.
 */
export function internalApprovalReason(totals: ChangeTotals, rules: ApprovalRules): string | null {
  const reasons: string[] = [];
  const value = Math.max(Math.abs(totals.costDeltaMinor), Math.abs(totals.priceDeltaMinor));
  if (value > rules.approvalLimitMinor) reasons.push("value above the approval limit");
  if (totals.marginPct === null) {
    if (totals.costDeltaMinor !== 0) reasons.push("cost change with no price change");
  } else if (totals.marginPct < rules.marginFloorPct) {
    reasons.push(`margin below the ${rules.marginFloorPct}% floor`);
  }
  return reasons.length ? reasons.join("; ") : null;
}
