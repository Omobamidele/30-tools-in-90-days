import { roomBlockInputs, roomBlockTerms, type RoomBlockInputs, type RoomBlockTerms } from "../clauses/schemas";
import { convertMinor, type Minor } from "../money";
import { computeAttrition } from "./attrition";
import type { EventInput } from "./event";
import type { PickupInput } from "./types";

// Savings finder (docs/06 milestone 13). Many room-block contracts let the group give rooms
// back at a review date ("reduce up to 10% by Oct 2"). Released rooms leave the commitment,
// so projected attrition falls. This finds the fewest rooms to release, within what the
// contract allows and never below the rooms people are projected to book, and what that saves.

export type ReleaseSaving = {
  reviewDate: string;
  maxReductionPct: number;
  /** Rooms to give back per night; only nights with a release are listed. */
  releases: Array<{ date: string; rooms: number }>;
  roomNights: number;
  beforeMinor: Minor;
  afterMinor: Minor;
  savingMinor: Minor;
};

function chargeWith(terms: RoomBlockTerms, inputs: RoomBlockInputs, pickup: PickupInput, release: number[]): Minor | null {
  const reduced: RoomBlockTerms = {
    ...terms,
    nights: terms.nights.map((n, i) => ({ ...n, rooms: n.rooms - release[i] })),
  };
  const calc = computeAttrition(reduced, inputs, pickup);
  return calc.status === "COMPLETE" ? calc.amountMinor : null;
}

/**
 * The saving from releasing rooms at one review point, or null when figures are incomplete or
 * there's nothing to save. Pure: the caller decides which review point is still open.
 */
export function computeReleaseSaving(
  terms: RoomBlockTerms,
  inputs: RoomBlockInputs,
  pickup: PickupInput | null,
  reviewPoint: { date: string; maxReductionPct: number },
): ReleaseSaving | null {
  if (!pickup) return null;
  const nights = terms.nights.slice().sort((a, b) => a.date.localeCompare(b.date));
  const sorted: RoomBlockTerms = { ...terms, nights };
  const projectedFor = (date: string) => {
    const n = pickup.nights[date];
    const v = n ? (inputs.projection === "FORECAST" ? n.forecastFinal : n.pickedUp) : null;
    return v ?? null;
  };

  const before = chargeWith(sorted, inputs, pickup, nights.map(() => 0));
  if (before === null || before === 0) return null;

  // Upper bound per night: what the contract allows (whole rooms, rounded down), and never
  // fewer rooms than people are projected to book.
  const release = nights.map((n) => {
    const projected = projectedFor(n.date) ?? n.rooms;
    const allowed = Math.floor((n.rooms * reviewPoint.maxReductionPct) / 100);
    return Math.max(0, Math.min(allowed, n.rooms - projected));
  });
  let best = chargeWith(sorted, inputs, pickup, release);
  if (best === null || best >= before) return null;

  // Give back only what's needed: trim one room at a time while the charge doesn't rise.
  for (let i = 0; i < release.length; i++) {
    while (release[i] > 0) {
      release[i] -= 1;
      const charge = chargeWith(sorted, inputs, pickup, release);
      if (charge === null || charge > best) {
        release[i] += 1;
        break;
      }
      best = charge;
    }
  }

  const releases = nights.map((n, i) => ({ date: n.date, rooms: release[i] })).filter((r) => r.rooms > 0);
  return {
    reviewDate: reviewPoint.date,
    maxReductionPct: reviewPoint.maxReductionPct,
    releases,
    roomNights: releases.reduce((s, r) => s + r.rooms, 0),
    beforeMinor: before,
    afterMinor: best,
    savingMinor: before - best,
  };
}

export type SavingOpportunity = ReleaseSaving & {
  contractId: string;
  supplierName: string;
  blockName: string;
  currency: string;
  /** Saving in the event's base currency; null when the exchange rate is missing. */
  savingBaseMinor: Minor | null;
};

/** Every open saving across an event's confirmed room blocks, at each block's next review point. */
export function computeEventSavings(input: EventInput): SavingOpportunity[] {
  const out: SavingOpportunity[] = [];
  for (const contract of input.contracts) {
    for (const clause of contract.clauses) {
      if (clause.type !== "ROOM_BLOCK") continue;
      const terms = roomBlockTerms.safeParse(clause.terms);
      const inputs = roomBlockInputs.safeParse(clause.inputs ?? {});
      if (!terms.success || !inputs.success) continue;
      const next = terms.data.reviewPoints
        .filter((r) => r.date >= input.asOf && r.maxReductionPct > 0)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!next) continue;
      const saving = computeReleaseSaving(terms.data, inputs.data, clause.pickup ?? null, next);
      if (!saving || saving.roomNights === 0) continue;
      const rate = input.fxRate(contract.currency, input.baseCurrency);
      out.push({
        ...saving,
        contractId: contract.contractId,
        supplierName: contract.supplierName,
        blockName: terms.data.blockName,
        currency: contract.currency,
        savingBaseMinor: rate === null ? null : convertMinor(saving.savingMinor, rate),
      });
    }
  }
  return out.sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
}
