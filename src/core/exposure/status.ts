// One plain word per event for summary screens (docs/09 § Money), so a non-specialist can scan
// a list without reading figures. Derived only from facts the system already holds.

export type EventHealth = "DECIDE" | "WATCH" | "ON_TRACK";

export const eventHealthLabels: Record<EventHealth, string> = {
  DECIDE: "Needs a decision",
  WATCH: "Keep an eye",
  ON_TRACK: "On track",
};

export function eventHealth(f: {
  /** Severities of the event's open alerts. */
  alertSeverities: Array<"HIGH" | "WATCH">;
  overThreshold: boolean;
  /** Figures could not all be calculated (missing pickup, FX, forecast). */
  incomplete: boolean;
  /** A task is overdue, or money changes hands or rises within 7 days. */
  urgentDeadline: boolean;
}): EventHealth {
  if (f.alertSeverities.includes("HIGH") || f.overThreshold || f.urgentDeadline) return "DECIDE";
  if (f.alertSeverities.length > 0 || f.incomplete) return "WATCH";
  return "ON_TRACK";
}
