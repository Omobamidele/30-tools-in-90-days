import type { Minor } from "../money";

export type Missing = { field: string; label: string };

// Every calculation returns either a complete amount with its working (what the UI's
// "working" drawer renders) or an explicit list of missing inputs. Never a silent zero.
export type Calc<W> =
  | { status: "COMPLETE"; amountMinor: Minor; working: W }
  | { status: "INCOMPLETE"; missing: Missing[] };

export const complete = <W>(amountMinor: Minor, working: W): Calc<W> => ({ status: "COMPLETE", amountMinor, working });
export const incomplete = <W>(missing: Missing[]): Calc<W> => ({ status: "INCOMPLETE", missing });

export type PickupNight = { pickedUp: number; forecastFinal: number | null };
export type PickupInput = {
  capturedAt: string; // ISO timestamp of the snapshot
  nights: Record<string, PickupNight>; // keyed by local date
};

export type LiabilityCategory = "DEPOSIT" | "ATTRITION" | "FB_SHORTFALL" | "CANCELLATION" | "OTHER";
export type LiabilityRule = { bearer: "CLIENT" | "AGENCY" | "SPLIT"; agencyPct: number };
export type LiabilityRules = Partial<Record<LiabilityCategory, LiabilityRule>>;

export type Allocation = { agencyMinor: Minor; clientMinor: Minor; unassignedMinor: Minor; rule: LiabilityRule | null };
