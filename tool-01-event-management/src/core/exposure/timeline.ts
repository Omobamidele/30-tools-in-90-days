import { convertMinor, type Minor } from "../money";
import { computeEventExposure, type EventInput } from "./event";

export type Step = { date: string; totalMinor: Minor; contracts: Array<{ contractId: string; title: string; amountMinor: Minor }> };

/**
 * The event's combined cancellation liability as a staircase over time, in the event's
 * reporting currency: one step per date on which any contract's cancellation tier changes,
 * plus today's level. Uses the same engine as the exposure figures, so they always agree.
 */
export function cancellationStaircase(input: EventInput, until: string): Step[] {
  const dates = new Set<string>([input.asOf]);
  for (const c of input.contracts) {
    for (const cl of c.clauses) {
      if (cl.type !== "CANCELLATION") continue;
      const tiers = ((cl.terms as { tiers?: Array<{ startsOn: string }> }).tiers ?? []);
      for (const t of tiers) if (t.startsOn > input.asOf && t.startsOn <= until) dates.add(t.startsOn);
    }
  }
  return [...dates].sort().map((date) => {
    const e = computeEventExposure({ ...input, scenario: { cancelOn: date } });
    const byContract = new Map<string, { contractId: string; title: string; amountMinor: Minor }>();
    for (const l of e.lines) {
      if (l.kind !== "CANCELLATION" || !l.base) continue;
      const cur = byContract.get(l.contractId) ?? { contractId: l.contractId, title: `${l.supplierName}: ${l.contractTitle}`, amountMinor: 0 };
      cur.amountMinor += l.base.amountMinor;
      byContract.set(l.contractId, cur);
    }
    return { date, totalMinor: e.cancellation.totalMinor, contracts: [...byContract.values()] };
  });
}

export { convertMinor };
