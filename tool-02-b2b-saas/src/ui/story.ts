import type { RuleType } from "@/config/schema";

// The one-line story for a signal (docs/09 rev. 3): what the customer did, in words a CSM would
// say out loud. Built from the stored evidence, so it never claims more than the rule saw.

type Terms = { seats: string; seatSingular: string; usageMetric: string; usageUnit: string };
type Ev = Record<string, unknown>;

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const fmt = (v: number) => v.toLocaleString("en-US");

export function storyHeadline(type: RuleType, evidence: unknown, terms: Terms): string {
  const e = (evidence ?? {}) as Ev;
  const seats = terms.seats.toLowerCase();
  switch (type) {
    case "SEAT_PRESSURE": {
      const active = n(e.activeSeats);
      const bought = n(e.seatsPurchased);
      if (active > bought) return `More people than seats: ${fmt(active)} using ${fmt(bought)} ${seats}`;
      if (active === bought) return `Every one of their ${fmt(bought)} ${seats} is in use`;
      return `${fmt(active)} of ${fmt(bought)} ${seats} in use, and climbing`;
    }
    case "USAGE_PACE":
      return `On pace to use ${n(e.projectedPct)}% of the ${terms.usageUnit} they committed to`;
    case "NEW_TEAM":
      return `A new team, ${String(e.workspace ?? "unnamed")}, has ${fmt(n(e.activeUsers))} people working in it`;
    case "FEATURE_INTENT":
      return `Tried to open ${String(e.addon ?? "an add-on")} ${fmt(n(e.attempts))} times in ${fmt(n(e.windowDays))} days`;
    case "NEW_EXECUTIVE":
      return `${String(e.contact ?? "A new contact")}${e.title ? `, ${String(e.title)},` : ""} started using the product`;
  }
}

/** Value in words, never as the headline: "Worth about $14k a year". */
export function worthText(short: string | null): string {
  return short ? `Worth about ${short} a year` : "No value estimate";
}
