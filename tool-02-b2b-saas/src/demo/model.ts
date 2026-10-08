// Demo usage model (simulated data, spec §10 / NFR-7). A deterministic description of how each
// fictional customer used the product over the last 90 days. It is the ONLY source of demo usage:
// the seed feeds it through the real ingest service, and `npm run usage:simulate` posts further
// days through the real ingest API. Every row it produces is stored with source = SIMULATED.

import { addDays, daysBetween } from "@/core/dates";

export type Story =
  | { kind: "pending" }
  | { kind: "won"; factor: number; buy: "seats" | "credits" | "addon" }
  | { kind: "lost"; reason: string }
  | { kind: "dismissed"; reason: string; note?: string }
  | { kind: "noopp"; reason: string }
  | { kind: "opportunity"; factor: number }
  | { kind: "accepted" }
  | { kind: "routed" }
  | { kind: "returned"; reason: string; note: string }
  | { kind: "snoozed"; days: number };

export type AccountSpec = {
  name: string;
  domain: string;
  crmId: string;
  segment: "mid" | "upper";
  industry: string;
  csm: string;
  owner: string | null;
  plan: "Growth" | "Scale";
  seats: number;
  credits: number;
  /** Term start, in days relative to the anchor date (always before the 90-day window). */
  termStart: number;
  addons: string[];
  /** Base share of seats in use, and base usage pace against commitment. */
  baseSeatRatio: number;
  basePace: number;
  seat?: { crossAt: number; to: number; until?: number };
  usage?: { hotAt: number; hotPace: number };
  team?: { name: string; createdAt: number; users: number };
  feature?: { addon: string; startAt: number; perDay: number; until?: number };
  exec?: { name: string; title: string; email: string; firstSeenAt: number };
  escalationFrom?: number;
  staleFrom?: number;
  contacts: Array<{ name: string; title: string; email: string }>;
  story: Story;
};

/** Small deterministic noise in [0, 1) from a string + day, so reruns produce identical data. */
function noise(key: string, t: number): number {
  let h = 2166136261;
  for (const ch of `${key}:${t}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.min(1, Math.max(0, x));

export function seatRatio(s: AccountSpec, t: number): number {
  if (!s.seat) return s.baseSeatRatio + noise(s.crmId + "s", t) * 0.04;
  const { crossAt, to, until } = s.seat;
  if (until !== undefined && t >= until) return s.baseSeatRatio + noise(s.crmId + "s", t) * 0.03;
  if (t < crossAt - 15) return s.baseSeatRatio + noise(s.crmId + "s", t) * 0.03;
  if (t < crossAt) return lerp(s.baseSeatRatio, 0.9, (t - (crossAt - 15)) / 15);
  // From the crossing on, at or above 90%, never dipping below the line.
  return Math.max(0.905, lerp(0.905, to, (t - crossAt) / 10) - noise(s.crmId + "s", t) * 0.01);
}

export function pace(s: AccountSpec, t: number): number {
  if (!s.usage || t < s.usage.hotAt) return s.basePace;
  return lerp(s.basePace, s.usage.hotPace, (t - s.usage.hotAt) / 10);
}

export type DemoRow = {
  account: { crmId: string };
  date: string;
  activeSeats: number;
  creditsUsedTerm: number;
  workspaces: Array<{ id: string; name: string; createdOn: string; activeUsers: number }>;
  gatedAttempts: Record<string, number>;
  openEscalations: number;
  contacts: Array<{ name: string; title: string; email: string; firstSeenOn: string }>;
};

/** The usage row for account `s` on day `t` (days relative to `anchor`), or null when not reported. */
export function rowFor(s: AccountSpec, anchor: string, t: number): DemoRow | null {
  if (s.staleFrom !== undefined && t >= s.staleFrom) return null;
  const date = addDays(anchor, t);
  const termStart = addDays(anchor, s.termStart);
  const termEnd = addDays(termStart, 364);
  const elapsed = (daysBetween(termStart, date) + 1) / (daysBetween(termStart, termEnd) + 1);
  const activeSeats = Math.min(Math.round(s.seats * 1.25), Math.round(s.seats * seatRatio(s, t)));
  const main = Math.max(3, Math.round(activeSeats * (s.team ? 0.85 : 1)));
  const workspaces: DemoRow["workspaces"] = [{ id: `${s.crmId}-ws-main`, name: "Finance", createdOn: addDays(termStart, -200), activeUsers: main }];
  if (s.team && t >= s.team.createdAt) {
    workspaces.push({ id: `${s.crmId}-ws-team`, name: s.team.name, createdOn: addDays(anchor, s.team.createdAt), activeUsers: Math.max(1, Math.round(lerp(1, s.team.users, (t - s.team.createdAt) / 10))) });
  }
  const gatedAttempts: Record<string, number> = {};
  if (s.feature && t >= s.feature.startAt && (s.feature.until === undefined || t < s.feature.until)) {
    gatedAttempts[s.feature.addon] = s.feature.perDay + (noise(s.crmId + "f", t) > 0.6 ? 1 : 0);
  }
  const contacts = s.contacts.map((c) => ({ ...c, firstSeenOn: addDays(termStart, -150) }));
  if (s.exec && t >= s.exec.firstSeenAt) contacts.push({ name: s.exec.name, title: s.exec.title, email: s.exec.email, firstSeenOn: addDays(anchor, s.exec.firstSeenAt) });
  return {
    account: { crmId: s.crmId },
    date,
    activeSeats,
    creditsUsedTerm: s.credits > 0 ? Math.round(s.credits * Math.min(1, elapsed) * pace(s, t)) : 0,
    workspaces,
    gatedAttempts,
    openEscalations: s.escalationFrom !== undefined && t >= s.escalationFrom ? 1 : 0,
    contacts,
  };
}

export function termOf(s: AccountSpec, anchor: string) {
  const termStart = addDays(anchor, s.termStart);
  return { termStart, termEnd: addDays(termStart, 364) };
}
