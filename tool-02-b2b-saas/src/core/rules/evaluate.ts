import type { RuleType } from "@/config/schema";
import { addDays, daysBetween, formatDay } from "../dates";
import { formatInt } from "../money";
import type { Candidate, RuleInput, Snapshot } from "./types";

// Each rule type is a pure function of the account's recent usage, subscription and contacts.
// It returns a candidate signal (with the evidence and a plain-English explanation that the CSM
// sees) or null. No I/O, no clock: `today` is passed in, so every signal is reproducible.

const TRACE_DAYS = 30;
const tail = (w: Snapshot[], days: number, today: string) => w.filter((s) => daysBetween(s.date, today) < days);
const latestOf = (w: Snapshot[]) => w[w.length - 1];

export function seatPressure(input: RuleInput<"SEAT_PRESSURE">): Candidate | null {
  const { window: w, subscription: sub, params, today, terms } = input;
  const latest = latestOf(w);
  if (!latest || sub.seatsPurchased <= 0) return null;
  const line = (params.utilisationPct / 100) * sub.seatsPurchased;
  // Trailing streak of days at or above the line; a reporting gap of more than 2 days breaks it.
  let start = latest.date;
  for (let i = w.length - 1; i >= 0; i--) {
    if (w[i].activeSeats < line) break;
    if (i < w.length - 1 && daysBetween(w[i].date, w[i + 1].date) > 2) break;
    start = w[i].date;
  }
  if (latest.activeSeats < line) return null;
  const streakDays = daysBetween(start, latest.date) + 1;
  if (streakDays < params.sustainDays) return null;
  const pct = Math.round((latest.activeSeats / sub.seatsPurchased) * 100);
  return {
    type: "SEAT_PRESSURE",
    explanation: `${latest.activeSeats} of ${sub.seatsPurchased} ${terms.seats.toLowerCase()} active (${pct}%) for ${streakDays} days`,
    evidence: { activeSeats: latest.activeSeats, seatsPurchased: sub.seatsPurchased, utilisationPct: pct, streakDays, since: start, asOf: latest.date, thresholdPct: params.utilisationPct },
    valueInputs: { kind: "SEATS", activeSeats: latest.activeSeats, seatsPurchased: sub.seatsPurchased },
    trace: {
      label: `Active ${terms.seats.toLowerCase()}`,
      unit: terms.seatSingular,
      points: tail(w, TRACE_DAYS, today).map((s) => ({ date: s.date, value: s.activeSeats })),
      threshold: Math.round(line * 10) / 10,
    },
  };
}

/** Share of the term elapsed at the end of `date` (0–1). */
export function termElapsed(termStart: string, termEnd: string, date: string): number {
  const total = daysBetween(termStart, termEnd) + 1;
  const done = Math.min(total, Math.max(0, daysBetween(termStart, date) + 1));
  return total > 0 ? done / total : 0;
}

export function usagePace(input: RuleInput<"USAGE_PACE">): Candidate | null {
  const { window: w, subscription: sub, params, today, terms } = input;
  const latest = latestOf(w);
  if (!latest || sub.creditsCommitted <= 0) return null;
  if (latest.date < sub.termStart || latest.date > sub.termEnd) return null;
  const elapsed = termElapsed(sub.termStart, sub.termEnd, latest.date);
  if (elapsed * 100 < params.minElapsedPct || elapsed <= 0) return null;
  const projected = Math.round(latest.creditsUsedTerm / elapsed);
  const projectedPct = Math.round((projected / sub.creditsCommitted) * 100);
  if (projectedPct < params.projectedPct) return null;
  const inTerm = tail(w, TRACE_DAYS, today).filter((s) => s.date >= sub.termStart);
  return {
    type: "USAGE_PACE",
    explanation: `On pace to use ${formatInt(projected)} of ${formatInt(sub.creditsCommitted)} committed ${terms.usageUnit} this term (${projectedPct}%)`,
    evidence: {
      usedToDate: latest.creditsUsedTerm,
      committed: sub.creditsCommitted,
      projected,
      projectedPct,
      termElapsedPct: Math.round(elapsed * 100),
      termEnd: sub.termEnd,
      asOf: latest.date,
      thresholdPct: params.projectedPct,
    },
    valueInputs: { kind: "USAGE", projected, committed: sub.creditsCommitted },
    trace: {
      label: "Projected use, % of commitment",
      unit: "%",
      points: inTerm.map((s) => {
        const e = termElapsed(sub.termStart, sub.termEnd, s.date);
        return { date: s.date, value: e > 0 ? Math.round((s.creditsUsedTerm / e / sub.creditsCommitted) * 100) : 0 };
      }),
      threshold: params.projectedPct,
    },
  };
}

export function newTeam(input: RuleInput<"NEW_TEAM">): Candidate | null {
  const { window: w, params, today } = input;
  const latest = latestOf(w);
  if (!latest) return null;
  const fresh = latest.workspaces
    .filter((ws) => daysBetween(ws.createdOn, today) <= params.withinDays && ws.activeUsers >= params.minActiveUsers)
    .sort((a, b) => b.activeUsers - a.activeUsers);
  const ws = fresh[0];
  if (!ws) return null;
  return {
    type: "NEW_TEAM",
    explanation: `New workspace "${ws.name}" (created ${formatDay(ws.createdOn)}) has ${ws.activeUsers} active users`,
    evidence: { workspaceId: ws.id, workspace: ws.name, createdOn: ws.createdOn, activeUsers: ws.activeUsers, otherNewWorkspaces: fresh.slice(1).map((x) => x.name), asOf: latest.date, minActiveUsers: params.minActiveUsers },
    valueInputs: { kind: "NEW_TEAM", activeUsers: ws.activeUsers },
    trace: {
      label: `Active users in "${ws.name}"`,
      unit: "user",
      points: tail(w, TRACE_DAYS, today).map((s) => ({ date: s.date, value: s.workspaces.find((x) => x.id === ws.id)?.activeUsers ?? 0 })),
      threshold: params.minActiveUsers,
    },
  };
}

export function featureIntent(input: RuleInput<"FEATURE_INTENT">): Candidate | null {
  const { window: w, subscription: sub, params, today, terms } = input;
  const recent = w.filter((s) => daysBetween(s.date, today) < params.windowDays && daysBetween(s.date, today) >= 0);
  const totals = new Map<string, number>();
  for (const s of recent) for (const [k, n] of Object.entries(s.gatedAttempts)) if (!sub.addons.includes(k)) totals.set(k, (totals.get(k) ?? 0) + n);
  const ranked = [...totals.entries()].filter(([, n]) => n >= params.minAttempts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const [addonKey, attempts] = ranked[0];
  // Trace: rolling attempts over the window, ending each day.
  const points = tail(w, TRACE_DAYS, today).map((s) => ({
    date: s.date,
    value: w.filter((x) => x.date <= s.date && daysBetween(x.date, s.date) < params.windowDays).reduce((n, x) => n + (x.gatedAttempts[addonKey] ?? 0), 0),
  }));
  return {
    type: "FEATURE_INTENT",
    explanation: `${attempts} attempts to open ${terms.addonName(addonKey)} in ${params.windowDays} days (not licensed)`,
    evidence: { addonKey, addon: terms.addonName(addonKey), attempts, windowDays: params.windowDays, others: ranked.slice(1).map(([k, n]) => ({ addonKey: k, attempts: n })), asOf: latestOf(w)?.date ?? today, minAttempts: params.minAttempts },
    valueInputs: { kind: "ADDON", addonKey },
    trace: { label: `Attempts to open ${terms.addonName(addonKey)}, last ${params.windowDays} days`, unit: "attempt", points, threshold: params.minAttempts },
  };
}

export function newExecutive(input: RuleInput<"NEW_EXECUTIVE">): Candidate | null {
  const { contacts, params, today } = input;
  const found = contacts
    .filter((c) => c.seniority && params.seniorities.includes(c.seniority as never) && c.firstSeenOn && daysBetween(c.firstSeenOn, today) <= params.withinDays && daysBetween(c.firstSeenOn, today) >= 0)
    .sort((a, b) => (b.firstSeenOn ?? "").localeCompare(a.firstSeenOn ?? ""));
  const c = found[0];
  if (!c) return null;
  const ago = daysBetween(c.firstSeenOn!, today);
  return {
    type: "NEW_EXECUTIVE",
    explanation: `${c.name}${c.title ? ` (${c.title})` : ""} first active ${ago === 0 ? "today" : ago === 1 ? "yesterday" : `${ago} days ago`}`,
    evidence: { contactId: c.id, contact: c.name, title: c.title, seniority: c.seniority, firstSeenOn: c.firstSeenOn, others: found.slice(1).map((x) => x.name) },
    valueInputs: { kind: "NONE", reason: "No direct value; this is a relationship signal." },
    trace: null,
  };
}

export const RULES: { [T in RuleType]: (input: RuleInput<T>) => Candidate | null } = {
  SEAT_PRESSURE: seatPressure,
  USAGE_PACE: usagePace,
  NEW_TEAM: newTeam,
  FEATURE_INTENT: featureIntent,
  NEW_EXECUTIVE: newExecutive,
};

export function evaluateRule<T extends RuleType>(type: T, input: RuleInput<T>): Candidate | null {
  return (RULES[type] as (i: RuleInput<T>) => Candidate | null)(input);
}

/** True if no usage arrived within `staleAfterDays` of today (spec FR-4: no signals from stale data). */
export function isStale(latestDate: string | null, today: string, staleAfterDays: number): boolean {
  return !latestDate || daysBetween(latestDate, today) > staleAfterDays;
}

export { addDays };
