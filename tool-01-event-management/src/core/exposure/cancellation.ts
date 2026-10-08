import type { CancellationTerms } from "../clauses/schemas";
import { percentOf, type Minor } from "../money";
import { complete, incomplete, type Calc } from "./types";

export type CancellationBasisValues = {
  contractValueMinor: Minor | null;
  roomRevenueMinor: Minor | null;
  fbMinimumMinor: Minor | null;
};

export type TierView = { startsOn: string; penaltyPct: number | null; penaltyFixedMinor: Minor | null };

export type CancellationWorking = {
  asOf: string;
  basis: CancellationTerms["basis"];
  basisAmountMinor: Minor | null;
  tier: TierView | null; // null = before the first tier: no penalty yet
  grossMinor: Minor;
  depositTreatment: CancellationTerms["depositTreatment"];
  depositsPaidMinor: Minor;
  netOwedMinor: Minor;
  nextStep: { startsOn: string; penaltyPct: number | null; amountMinor: Minor } | null;
};

export function activeTier(terms: CancellationTerms, asOf: string): TierView | null {
  let current: TierView | null = null;
  for (const t of terms.tiers) {
    if (t.startsOn <= asOf) current = t;
    else break;
  }
  return current;
}

function basisAmount(terms: CancellationTerms, values: CancellationBasisValues): Minor | null {
  switch (terms.basis) {
    case "CONTRACT_VALUE":
      return values.contractValueMinor;
    case "ROOM_REVENUE":
      return values.roomRevenueMinor;
    case "FB_MINIMUM":
      return values.fbMinimumMinor;
    case "FIXED":
      return null;
  }
}

function tierAmount(terms: CancellationTerms, tier: TierView, basis: Minor | null): Minor {
  if (terms.basis === "FIXED") return tier.penaltyFixedMinor ?? 0;
  return percentOf(basis ?? 0, tier.penaltyPct ?? 0);
}

const basisLabels: Record<CancellationTerms["basis"], string> = {
  CONTRACT_VALUE: "Contracted value",
  ROOM_REVENUE: "Contracted room revenue",
  FB_MINIMUM: "F&B minimum",
  FIXED: "Fixed amounts",
};

/**
 * Cancellation charge if the contract were cancelled on `asOf` (a local date at the supplier).
 * Gross is the tier penalty. Net owed subtracts deposits already paid when the contract
 * credits them against the penalty; with ADDITIONAL treatment deposits are forfeited on top.
 */
export function computeCancellation(
  terms: CancellationTerms,
  asOf: string,
  values: CancellationBasisValues,
  depositsPaidMinor: Minor,
): Calc<CancellationWorking> {
  const basis = basisAmount(terms, values);
  if (terms.basis !== "FIXED" && basis === null) {
    return incomplete([{ field: `basis.${terms.basis}`, label: `${basisLabels[terms.basis]} for the cancellation basis` }]);
  }

  const tier = activeTier(terms, asOf);
  const grossMinor = tier ? tierAmount(terms, tier, basis) : 0;
  const netOwedMinor =
    terms.depositTreatment === "CREDITED" ? Math.max(0, grossMinor - depositsPaidMinor) : grossMinor;

  const next = terms.tiers.find((t) => t.startsOn > asOf) ?? null;

  return complete(grossMinor, {
    asOf,
    basis: terms.basis,
    basisAmountMinor: basis,
    tier,
    grossMinor,
    depositTreatment: terms.depositTreatment,
    depositsPaidMinor,
    netOwedMinor,
    nextStep: next
      ? { startsOn: next.startsOn, penaltyPct: next.penaltyPct, amountMinor: tierAmount(terms, next, basis) }
      : null,
  });
}

/** The full staircase for the commitment timeline: each step with its amount. */
export function cancellationStaircase(terms: CancellationTerms, values: CancellationBasisValues) {
  const basis = basisAmount(terms, values);
  if (terms.basis !== "FIXED" && basis === null) return null;
  return terms.tiers.map((t) => ({
    startsOn: t.startsOn,
    penaltyPct: t.penaltyPct,
    amountMinor: tierAmount(terms, t, basis),
  }));
}
