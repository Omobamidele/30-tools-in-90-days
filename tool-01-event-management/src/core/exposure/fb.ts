import type { FbMinimumTerms, FbMinimumInputs } from "../clauses/schemas";
import { percentOf, times, type Minor } from "../money";
import { complete, incomplete, type Calc } from "./types";

export type FbWorking = {
  minimumMinor: Minor;
  forecastMinor: Minor;
  forecastMethod: FbMinimumInputs["forecastMethod"];
  perHeadMinor: Minor | null;
  attendance: number | null;
  shortfallMinor: Minor;
  surchargePct: number;
  surchargeMinor: Minor;
  attendanceFactorPct: number | null;
};

/**
 * Projected F&B minimum shortfall: max(0, minimum − forecast spend) plus the supplier's
 * surcharge (service charge/tax) on the shortfall.
 *
 * Forecast is either a manual amount or per-head × forecast attendance.
 * Scenarios scale a manual forecast by `attendanceFactorPct`; per-head forecasts use the
 * scenario attendance directly.
 */
export function computeFbShortfall(
  terms: FbMinimumTerms,
  inputs: FbMinimumInputs,
  attendance: number,
  attendanceFactorPct: number | null = null,
): Calc<FbWorking> {
  let forecastMinor: Minor;
  let usedAttendance: number | null = null;

  if (inputs.forecastMethod === "PER_HEAD") {
    if (inputs.perHeadMinor === null) {
      return incomplete([{ field: "inputs.perHeadMinor", label: `F&B spend per attendee (${terms.label})` }]);
    }
    usedAttendance =
      attendanceFactorPct === null ? attendance : Math.max(0, Math.round((attendance * attendanceFactorPct) / 100));
    forecastMinor = times(inputs.perHeadMinor, usedAttendance);
  } else {
    if (inputs.forecastManualMinor === null) {
      return incomplete([{ field: "inputs.forecastManualMinor", label: `Forecast F&B spend (${terms.label})` }]);
    }
    forecastMinor =
      attendanceFactorPct === null ? inputs.forecastManualMinor : percentOf(inputs.forecastManualMinor, attendanceFactorPct);
  }

  const shortfallMinor = Math.max(0, terms.minimumMinor - forecastMinor);
  const surchargeMinor = percentOf(shortfallMinor, terms.surchargePct);

  return complete(shortfallMinor + surchargeMinor, {
    minimumMinor: terms.minimumMinor,
    forecastMinor,
    forecastMethod: inputs.forecastMethod,
    perHeadMinor: inputs.perHeadMinor,
    attendance: usedAttendance,
    shortfallMinor,
    surchargePct: terms.surchargePct,
    surchargeMinor,
    attendanceFactorPct,
  });
}
