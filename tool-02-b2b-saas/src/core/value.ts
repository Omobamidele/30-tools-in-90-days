import type { PriceBook } from "@/config/schema";
import { formatInt, formatMoney } from "./money";
import type { ValueInputs } from "./rules/types";

// Estimated annual value of a signal, from the tenant's price book. Always returned with the
// working shown to the CSM. When the price book can't size it, the value is null with a reason
// (spec edge case 7): never $0, which would read as "worthless".

export type Estimate = { valueMinor: number | null; working: string; kind: "SEATS" | "USAGE" | `ADDON:${string}` | "NONE" };

export function estimateValue(inputs: ValueInputs, pb: PriceBook, terms: { seats: string; seatSingular: string; usageUnit: string }): Estimate {
  const money = (m: number) => formatMoney(m, pb.currency);
  switch (inputs.kind) {
    case "SEATS": {
      const sized = Math.ceil(inputs.activeSeats * (1 + pb.seatHeadroomPct / 100)) - inputs.seatsPurchased;
      const seats = Math.max(pb.minSeatAddOn, sized);
      if (pb.seatPriceMinor <= 0) return { valueMinor: null, working: `No ${terms.seatSingular} price in the price book.`, kind: "SEATS" };
      const why =
        sized >= pb.minSeatAddOn
          ? `${inputs.activeSeats} active + ${pb.seatHeadroomPct}% headroom = ${inputs.seatsPurchased + sized} needed, ${inputs.seatsPurchased} owned`
          : `minimum add-on of ${pb.minSeatAddOn}`;
      return { valueMinor: seats * pb.seatPriceMinor, working: `${seats} ${seats === 1 ? terms.seatSingular : terms.seats.toLowerCase()} × ${money(pb.seatPriceMinor)} (${why})`, kind: "SEATS" };
    }
    case "NEW_TEAM": {
      if (pb.seatPriceMinor <= 0) return { valueMinor: null, working: `No ${terms.seatSingular} price in the price book.`, kind: "SEATS" };
      return { valueMinor: inputs.activeUsers * pb.seatPriceMinor, working: `${inputs.activeUsers} users × ${money(pb.seatPriceMinor)} per ${terms.seatSingular}`, kind: "SEATS" };
    }
    case "USAGE": {
      const tiers = [...pb.creditTiers].sort((a, b) => a.committed - b.committed);
      const current = tiers.find((t) => t.committed === inputs.committed);
      const next = tiers.find((t) => t.committed >= inputs.projected);
      if (current && next && next.committed > current.committed) {
        return {
          valueMinor: next.priceMinor - current.priceMinor,
          working: `Move from the ${formatInt(current.committed)} to the ${formatInt(next.committed)} ${terms.usageUnit} tier: ${money(next.priceMinor)} − ${money(current.priceMinor)}`,
          kind: "USAGE",
        };
      }
      const over = Math.max(0, inputs.projected - inputs.committed);
      if (pb.overagePer1000Minor > 0 && over > 0) {
        const v = Math.round((over / 1000) * pb.overagePer1000Minor);
        return { valueMinor: v, working: `${formatInt(over)} ${terms.usageUnit} over commitment × ${money(pb.overagePer1000Minor)} per 1,000`, kind: "USAGE" };
      }
      return { valueMinor: null, working: `No tier or overage rate in the price book covers ${formatInt(inputs.projected)} ${terms.usageUnit}.`, kind: "USAGE" };
    }
    case "ADDON": {
      const a = pb.addons.find((x) => x.key === inputs.addonKey);
      if (!a) return { valueMinor: null, working: `"${inputs.addonKey}" isn't in the price book.`, kind: `ADDON:${inputs.addonKey}` };
      return { valueMinor: a.priceMinor, working: `${a.name} list price`, kind: `ADDON:${inputs.addonKey}` };
    }
    case "NONE":
      return { valueMinor: null, working: inputs.reason, kind: "NONE" };
  }
}

/**
 * A CSQL can carry several signals. Seat-based signals (seat pressure, a new team) describe the
 * same purchase, so within a kind we take the largest; different kinds (seats, usage, an add-on)
 * add up. Returns null when nothing could be estimated.
 */
export function combineEstimates(items: Array<{ kind: Estimate["kind"]; valueMinor: number | null }>): number | null {
  const byKind = new Map<string, number>();
  for (const i of items) {
    if (i.valueMinor === null) continue;
    byKind.set(i.kind, Math.max(byKind.get(i.kind) ?? 0, i.valueMinor));
  }
  if (!byKind.size) return null;
  return [...byKind.values()].reduce((a, b) => a + b, 0);
}
