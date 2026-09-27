import {
  cancellationTerms,
  fbMinimumInputs,
  fbMinimumTerms,
  roomBlockInputs,
  roomBlockTerms,
  type ClauseType,
} from "../clauses/schemas";
import { convertMinor, sum, type Minor } from "../money";
import { allocate } from "./allocate";
import { computeAttrition, roomRevenue, type AttritionWorking } from "./attrition";
import { computeCancellation, type CancellationWorking } from "./cancellation";
import { computeFbShortfall, type FbWorking } from "./fb";
import type { Allocation, Calc, LiabilityCategory, LiabilityRules, Missing, PickupInput } from "./types";

export type ClauseInput = {
  id: string;
  type: ClauseType;
  label: string;
  terms: unknown; // validated here with the clause schema
  inputs: unknown;
  pickup?: PickupInput | null;
};

export type ContractInput = {
  contractId: string;
  title: string;
  supplierName: string;
  currency: string;
  contractedValueMinor: Minor;
  depositsPaidMinor: Minor;
  clauses: ClauseInput[]; // CONFIRMED clauses only
  unconfirmedClauseCount: number;
};

export type Scenario = {
  /** −100…+50: scales projected pickup and F&B forecast. */
  attendanceDeltaPct?: number;
  /** Local date to evaluate cancellation at (defaults to asOf). */
  cancelOn?: string;
};

export type EventInput = {
  asOf: string; // today's local date at the event
  forecastAttendance: number;
  baseCurrency: string;
  contracts: ContractInput[];
  liabilityRules: LiabilityRules | null;
  /** Returns the rate for 1 unit of `from` in `to` (string decimal), or null when unknown. */
  fxRate: (from: string, to: string) => string | null;
  scenario?: Scenario;
};

export type LineKind = "ATTRITION" | "FB_SHORTFALL" | "CANCELLATION";

type Working = AttritionWorking | FbWorking | CancellationWorking;

export type ExposureLine = {
  contractId: string;
  contractTitle: string;
  supplierName: string;
  clauseId: string;
  clauseLabel: string;
  kind: LineKind;
  currency: string;
  calc: Calc<Working>;
  allocation: Allocation | null; // in contract currency; null when incomplete
  base: { amountMinor: Minor; agencyMinor: Minor; clientMinor: Minor; unassignedMinor: Minor; rate: string } | null;
};

export type BearerTotals = { totalMinor: Minor; agencyMinor: Minor; clientMinor: Minor; unassignedMinor: Minor };

export type EventExposure = {
  asOf: string;
  baseCurrency: string;
  scenario: Scenario | null;
  lines: ExposureLine[];
  current: BearerTotals; // attrition + F&B shortfall: what is expected if nothing changes
  cancellation: BearerTotals & { netOwedMinor: Minor }; // if cancelled on asOf / scenario date
  complete: boolean;
  missing: Missing[];
  unconfirmedClauseCount: number;
};

const categoryOf: Record<LineKind, LiabilityCategory> = {
  ATTRITION: "ATTRITION",
  FB_SHORTFALL: "FB_SHORTFALL",
  CANCELLATION: "CANCELLATION",
};

const emptyTotals = (): BearerTotals => ({ totalMinor: 0, agencyMinor: 0, clientMinor: 0, unassignedMinor: 0 });

export function computeEventExposure(input: EventInput): EventExposure {
  const scenario = input.scenario ?? null;
  const factor =
    scenario?.attendanceDeltaPct !== undefined && scenario.attendanceDeltaPct !== 0
      ? 100 + scenario.attendanceDeltaPct
      : null;
  const cancelOn = scenario?.cancelOn ?? input.asOf;

  const lines: ExposureLine[] = [];
  const missing: Missing[] = [];
  let unconfirmed = 0;
  let netOwedBase = 0;

  for (const contract of input.contracts) {
    unconfirmed += contract.unconfirmedClauseCount;
    const blocks = contract.clauses.filter((c) => c.type === "ROOM_BLOCK");
    const fbs = contract.clauses.filter((c) => c.type === "FB_MINIMUM");

    const push = (clause: ClauseInput, kind: LineKind, calc: Calc<Working>) => {
      let allocation: Allocation | null = null;
      let base: ExposureLine["base"] = null;
      if (calc.status === "COMPLETE") {
        allocation = allocate(calc.amountMinor, categoryOf[kind], input.liabilityRules);
        const rate = contract.currency === input.baseCurrency ? "1" : input.fxRate(contract.currency, input.baseCurrency);
        if (rate === null) {
          missing.push({
            field: `fx.${contract.currency}`,
            label: `Exchange rate ${contract.currency} → ${input.baseCurrency}`,
          });
        } else {
          base = {
            amountMinor: convertMinor(calc.amountMinor, rate),
            agencyMinor: convertMinor(allocation.agencyMinor, rate),
            clientMinor: convertMinor(allocation.clientMinor, rate),
            unassignedMinor: 0,
            rate,
          };
          // Keep parts summing to the whole after conversion rounding.
          base.unassignedMinor = base.amountMinor - base.agencyMinor - base.clientMinor;
          if (allocation.unassignedMinor === 0 && base.unassignedMinor !== 0) {
            base.clientMinor += base.unassignedMinor;
            base.unassignedMinor = 0;
          }
        }
      } else {
        missing.push(...calc.missing.map((m) => ({ ...m, label: `${m.label}: ${contract.title}` })));
      }
      lines.push({
        contractId: contract.contractId,
        contractTitle: contract.title,
        supplierName: contract.supplierName,
        clauseId: clause.id,
        clauseLabel: clause.label,
        kind,
        currency: contract.currency,
        calc,
        allocation,
        base,
      });
    };

    for (const clause of blocks) {
      const terms = roomBlockTerms.parse(clause.terms);
      const inputs = roomBlockInputs.parse(clause.inputs ?? {});
      push(clause, "ATTRITION", computeAttrition(terms, inputs, clause.pickup ?? null, factor));
    }

    for (const clause of fbs) {
      const terms = fbMinimumTerms.parse(clause.terms);
      const inputs = fbMinimumInputs.parse(clause.inputs ?? {});
      push(clause, "FB_SHORTFALL", computeFbShortfall(terms, inputs, input.forecastAttendance, factor));
    }

    // Deposits paid (contract.depositsPaidMinor) are credited against cancellation where the contract says so.
    for (const clause of contract.clauses.filter((c) => c.type === "CANCELLATION")) {
      const terms = cancellationTerms.parse(clause.terms);
      const calc = computeCancellation(
        terms,
        cancelOn,
        {
          contractValueMinor: contract.contractedValueMinor > 0 ? contract.contractedValueMinor : null,
          roomRevenueMinor: blocks.length ? sum(blocks.map((b) => roomRevenue(roomBlockTerms.parse(b.terms)))) : null,
          fbMinimumMinor: fbs.length ? sum(fbs.map((f) => fbMinimumTerms.parse(f.terms).minimumMinor)) : null,
        },
        contract.depositsPaidMinor,
      );
      push(clause, "CANCELLATION", calc);
      if (calc.status === "COMPLETE") {
        const rate = contract.currency === input.baseCurrency ? "1" : input.fxRate(contract.currency, input.baseCurrency);
        if (rate !== null) netOwedBase += convertMinor(calc.working.netOwedMinor, rate);
      }
    }
  }

  const current = emptyTotals();
  const cancellation = emptyTotals();
  for (const line of lines) {
    if (!line.base) continue;
    const target = line.kind === "CANCELLATION" ? cancellation : current;
    target.totalMinor += line.base.amountMinor;
    target.agencyMinor += line.base.agencyMinor;
    target.clientMinor += line.base.clientMinor;
    target.unassignedMinor += line.base.unassignedMinor;
  }

  return {
    asOf: input.asOf,
    baseCurrency: input.baseCurrency,
    scenario,
    lines,
    current,
    cancellation: { ...cancellation, netOwedMinor: netOwedBase },
    complete: missing.length === 0 && unconfirmed === 0,
    missing,
    unconfirmedClauseCount: unconfirmed,
  };
}

/** Attendance delta as a percentage of forecast, for scenarios raised from change requests. */
export function attendanceDeltaPct(forecast: number, delta: number): number {
  if (forecast <= 0) return 0;
  return Math.max(-100, Math.round(((delta * 10_000) / forecast)) / 100);
}

/** Difference between two exposures per line, for the change request impact panel. */
export function diffExposure(before: EventExposure, after: EventExposure) {
  const key = (l: ExposureLine) => `${l.clauseId}:${l.kind}`;
  const afterByKey = new Map(after.lines.map((l) => [key(l), l]));
  return before.lines.map((b) => {
    const a = afterByKey.get(key(b));
    const beforeAmount = b.calc.status === "COMPLETE" ? b.calc.amountMinor : null;
    const afterAmount = a && a.calc.status === "COMPLETE" ? a.calc.amountMinor : null;
    return {
      clauseId: b.clauseId,
      kind: b.kind,
      contractTitle: b.contractTitle,
      clauseLabel: b.clauseLabel,
      currency: b.currency,
      beforeMinor: beforeAmount,
      afterMinor: afterAmount,
      deltaMinor: beforeAmount !== null && afterAmount !== null ? afterAmount - beforeAmount : null,
      bearer: b.allocation?.rule?.bearer ?? null,
      agencyPct: b.allocation?.rule?.agencyPct ?? null,
    };
  });
}
