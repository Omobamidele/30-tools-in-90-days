import type { OrgConfig, RuleType } from "@/config/schema";

/** A rule's condition as a sentence, so nobody has to read JSON to know what it does. */
export function describeRule(type: RuleType, p: Record<string, unknown>, t: OrgConfig["terminology"]): string {
  switch (type) {
    case "SEAT_PRESSURE":
      return `Active ${t.seats.toLowerCase()} at least ${p.utilisationPct}% of purchased for ${p.sustainDays} days`;
    case "USAGE_PACE":
      return `On pace to use at least ${p.projectedPct}% of committed ${t.usageUnit}, once ${p.minElapsedPct}% of the term has passed`;
    case "NEW_TEAM":
      return `A workspace created in the last ${p.withinDays} days reaches ${p.minActiveUsers} active users`;
    case "FEATURE_INTENT":
      return `At least ${p.minAttempts} attempts to open an add-on they don't own in ${p.windowDays} days`;
    case "NEW_EXECUTIVE":
      return `A ${(p.seniorities as string[]).map((s) => s.toLowerCase()).join(" or ")}-level contact first active in the last ${p.withinDays} days`;
  }
}
