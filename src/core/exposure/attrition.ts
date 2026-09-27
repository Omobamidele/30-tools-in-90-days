import type { RoomBlockTerms, RoomBlockInputs } from "../clauses/schemas";
import { ceilPercentOfCount, divideRound, percentOf, sum, times, type Minor } from "../money";
import { complete, incomplete, type Calc, type Missing, type PickupInput } from "./types";

export type AttritionRow = {
  date: string;
  rooms: number;
  committed: number;
  projected: number;
  short: number;
  rateMinor: Minor;
  amountMinor: Minor;
};

export type AttritionWorking = {
  basis: RoomBlockTerms["basis"];
  commitmentPct: number;
  damagesPct: number;
  projection: RoomBlockInputs["projection"];
  pickupCapturedAt: string;
  attendanceFactorPct: number | null;
  rows: AttritionRow[];
  // Cumulative basis only
  totals?: { rooms: number; committed: number; projected: number; short: number; averageRateMinor: Minor };
};

/**
 * Projected attrition charge for one room block.
 *
 * Committed rooms per night = ceil(rooms × commitment%). Shortfall is committed minus
 * projected pickup, floored at zero (pickup above the block never creates a credit).
 * Charge = shortfall × rate × damages%, rounded per line.
 *
 * `attendanceFactorPct` scales projected pickup for scenarios (e.g. 80 for −20% attendance).
 */
export function computeAttrition(
  terms: RoomBlockTerms,
  inputs: RoomBlockInputs,
  pickup: PickupInput | null,
  attendanceFactorPct: number | null = null,
): Calc<AttritionWorking> {
  if (!pickup) {
    return incomplete([{ field: "pickup", label: `Room pickup for ${terms.blockName}` }]);
  }

  const missing: Missing[] = [];
  const projectedFor = (date: string): number | null => {
    const n = pickup.nights[date];
    if (!n) return null;
    const base = inputs.projection === "FORECAST" ? n.forecastFinal : n.pickedUp;
    if (base === null) return null;
    return attendanceFactorPct === null ? base : Math.max(0, Math.round((base * attendanceFactorPct) / 100));
  };

  const perNight = terms.nights
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((night) => {
      const projected = projectedFor(night.date);
      if (projected === null) {
        missing.push({
          field: `pickup.${night.date}`,
          label:
            inputs.projection === "FORECAST"
              ? `Forecast final pickup for ${night.date} (${terms.blockName})`
              : `Pickup for ${night.date} (${terms.blockName})`,
        });
      }
      return { night, projected: projected ?? 0 };
    });

  if (missing.length) return incomplete(missing);

  const common = {
    basis: terms.basis,
    commitmentPct: terms.commitmentPct,
    damagesPct: terms.damagesPct,
    projection: inputs.projection,
    pickupCapturedAt: pickup.capturedAt,
    attendanceFactorPct,
  };

  if (terms.basis === "PER_NIGHT") {
    const rows: AttritionRow[] = perNight.map(({ night, projected }) => {
      const committed = ceilPercentOfCount(night.rooms, terms.commitmentPct);
      const short = Math.max(0, committed - projected);
      return {
        date: night.date,
        rooms: night.rooms,
        committed,
        projected,
        short,
        rateMinor: night.rateMinor,
        amountMinor: percentOf(times(night.rateMinor, short), terms.damagesPct),
      };
    });
    return complete(sum(rows.map((r) => r.amountMinor)), { ...common, rows });
  }

  // CUMULATIVE: one commitment across all nights, charged at the room-weighted average rate.
  const totalRooms = sum(perNight.map((p) => p.night.rooms));
  const committed = ceilPercentOfCount(totalRooms, terms.commitmentPct);
  const projected = sum(perNight.map((p) => p.projected));
  const short = Math.max(0, committed - projected);
  const averageRateMinor =
    totalRooms === 0 ? 0 : divideRound(sum(perNight.map((p) => times(p.night.rateMinor, p.night.rooms))), totalRooms);
  const amountMinor = percentOf(times(averageRateMinor, short), terms.damagesPct);
  const rows: AttritionRow[] = perNight.map(({ night, projected: p }) => ({
    date: night.date,
    rooms: night.rooms,
    committed: ceilPercentOfCount(night.rooms, terms.commitmentPct),
    projected: p,
    short: 0,
    rateMinor: night.rateMinor,
    amountMinor: 0,
  }));
  return complete(amountMinor, {
    ...common,
    rows,
    totals: { rooms: totalRooms, committed, projected, short, averageRateMinor },
  });
}

/** Contracted room revenue for a block (basis for some cancellation schedules). */
export function roomRevenue(terms: RoomBlockTerms): Minor {
  return sum(terms.nights.map((n) => times(n.rateMinor, n.rooms)));
}
