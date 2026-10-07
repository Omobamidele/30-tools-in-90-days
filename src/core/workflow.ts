// State machines for signals and CSQLs (spec §6.1, FR-17). The services ask these before any
// write, and the UI shows only the actions they allow.

export const SIGNAL_STATUSES = ["NEW", "SNOOZED", "ACCEPTED", "DISMISSED", "EXPIRED"] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export type SignalAction = "ACCEPT" | "DISMISS" | "SNOOZE" | "WAKE" | "EXPIRE";

const SIGNAL_MOVES: Record<SignalStatus, Partial<Record<SignalAction, SignalStatus>>> = {
  NEW: { ACCEPT: "ACCEPTED", DISMISS: "DISMISSED", SNOOZE: "SNOOZED", EXPIRE: "EXPIRED" },
  SNOOZED: { WAKE: "NEW", ACCEPT: "ACCEPTED", DISMISS: "DISMISSED", EXPIRE: "EXPIRED" },
  ACCEPTED: {},
  DISMISSED: {},
  EXPIRED: {},
};

export function nextSignalStatus(from: SignalStatus, action: SignalAction): SignalStatus | null {
  return SIGNAL_MOVES[from][action] ?? null;
}

export const OPEN_SIGNAL: SignalStatus[] = ["NEW", "SNOOZED"];

export const CSQL_STATUSES = ["ROUTED", "ACCEPTED", "RETURNED", "OPPORTUNITY", "WON", "LOST", "CLOSED_NO_OPP"] as const;
export type CsqlStatus = (typeof CSQL_STATUSES)[number];

export type CsqlAction = "ACCEPT" | "RETURN" | "REROUTE" | "REASSIGN" | "RECORD_OPPORTUNITY" | "WIN" | "LOSE" | "CLOSE_NO_OPP";

const CSQL_MOVES: Record<CsqlStatus, Partial<Record<CsqlAction, CsqlStatus>>> = {
  ROUTED: { ACCEPT: "ACCEPTED", RETURN: "RETURNED", REASSIGN: "ROUTED" },
  ACCEPTED: { RECORD_OPPORTUNITY: "OPPORTUNITY", CLOSE_NO_OPP: "CLOSED_NO_OPP", REASSIGN: "ACCEPTED" },
  RETURNED: { REROUTE: "ROUTED", CLOSE_NO_OPP: "CLOSED_NO_OPP" },
  OPPORTUNITY: { WIN: "WON", LOSE: "LOST", RECORD_OPPORTUNITY: "OPPORTUNITY", REASSIGN: "OPPORTUNITY" },
  WON: {},
  LOST: {},
  CLOSED_NO_OPP: {},
};

export function nextCsqlStatus(from: CsqlStatus, action: CsqlAction): CsqlStatus | null {
  return CSQL_MOVES[from][action] ?? null;
}

export function allowedCsqlActions(from: CsqlStatus): CsqlAction[] {
  return Object.keys(CSQL_MOVES[from]) as CsqlAction[];
}

export const OPEN_CSQL: CsqlStatus[] = ["ROUTED", "ACCEPTED", "RETURNED", "OPPORTUNITY"];
export const CLOSED_CSQL: CsqlStatus[] = ["WON", "LOST", "CLOSED_NO_OPP"];

/** Which deadline (if any) runs in a CSQL status, and who owns it. */
export function csqlClock(status: CsqlStatus): "SELLER" | "CSM" | null {
  if (status === "ROUTED") return "SELLER";
  if (status === "RETURNED") return "CSM";
  return null;
}
