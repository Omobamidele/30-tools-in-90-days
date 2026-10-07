import { businessDaysUntil, deadlineState, type BusinessCalendar } from "@/core/business-time";
import type { Tone } from "./bits";

// Dates and deadlines in the organisation's time zone, written the way people say them.

export function formatDateTime(d: Date, tz: string) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function formatDate(d: Date, tz: string) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });
}

export function ago(d: Date, now: Date): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/** "Due tomorrow" / "Overdue by 2 business days", with the tone the deadline deserves. */
export function deadlineText(startedAt: Date, dueAt: Date, now: Date, cal: BusinessCalendar): { text: string; tone: Tone } {
  const state = deadlineState(startedAt, dueAt, now, cal);
  const days = businessDaysUntil(now, dueAt, cal);
  if (state === "OVERDUE" || state === "ESCALATE") {
    const late = Math.max(1, -days);
    return { text: state === "ESCALATE" ? `Overdue ${late} business days` : late <= 1 ? "Overdue" : `Overdue ${late} business days`, tone: "risk" };
  }
  const text = days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} business days`;
  return { text, tone: state === "DUE_SOON" ? "watch" : "neutral" };
}
