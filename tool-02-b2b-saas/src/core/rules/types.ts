import type { RuleParams, RuleType } from "@/config/schema";
import type { IsoDate } from "../dates";

/** One account-day of usage aggregates, as ingested (spec FR-2). */
export type Snapshot = {
  date: IsoDate;
  activeSeats: number;
  creditsUsedTerm: number;
  workspaces: Array<{ id: string; name: string; createdOn: IsoDate; activeUsers: number }>;
  /** Attempts to open a gated add-on that day, keyed by add-on key. */
  gatedAttempts: Record<string, number>;
  openEscalations: number;
};

export type Subscription = {
  plan: string;
  seatsPurchased: number;
  creditsCommitted: number;
  termStart: IsoDate;
  termEnd: IsoDate;
  arrMinor: number;
  addons: string[];
};

export type Contact = { id: string; name: string; title: string | null; seniority: "EXEC" | "VP" | "DIRECTOR" | "MANAGER" | "IC" | null; firstSeenOn: IsoDate | null };

export type Terms = { seats: string; seatSingular: string; usageMetric: string; usageUnit: string; addonName: (key: string) => string };

/** What a rule needs to size the opportunity; turned into money by value.ts. */
export type ValueInputs =
  | { kind: "SEATS"; activeSeats: number; seatsPurchased: number }
  | { kind: "NEW_TEAM"; activeUsers: number }
  | { kind: "USAGE"; projected: number; committed: number }
  | { kind: "ADDON"; addonKey: string }
  | { kind: "NONE"; reason: string };

/** The signal trace (docs/09): a metric over time against its threshold. */
export type Trace = { label: string; unit: string; points: Array<{ date: IsoDate; value: number }>; threshold: number };

export type Candidate = {
  type: RuleType;
  explanation: string;
  evidence: Record<string, unknown>;
  valueInputs: ValueInputs;
  trace: Trace | null;
};

export type RuleInput<T extends RuleType> = {
  /** Snapshots ascending by date; the last one is the latest. */
  window: Snapshot[];
  subscription: Subscription;
  contacts: Contact[];
  params: RuleParams[T];
  today: IsoDate;
  terms: Terms;
};
