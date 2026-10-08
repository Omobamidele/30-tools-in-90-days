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

/** "Due Thu", "Due tomorrow", "2 days late": the way people say deadlines. */
export function deadlineText(startedAt: Date, dueAt: Date, now: Date, cal: BusinessCalendar): { text: string; tone: Tone } {
  const state = deadlineState(startedAt, dueAt, now, cal);
  const days = businessDaysUntil(now, dueAt, cal);
  if (state === "OVERDUE" || state === "ESCALATE") {
    const late = Math.max(1, -days);
    return { text: late <= 1 ? "Overdue" : `${late} days late`, tone: "risk" };
  }
  const weekday = dueAt.toLocaleDateString("en-US", { weekday: "short", timeZone: cal.timezone });
  const date = dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: cal.timezone });
  const text = days <= 0 ? "Due today" : days === 1 ? "Due tomorrow" : days <= 4 ? `Due ${weekday}` : `Due ${date}`;
  return { text, tone: state === "DUE_SOON" ? "watch" : "neutral" };
}

/** Priority as a word, not a score (a number like "55" reads like a trading screen). */
export function priorityWord(score: number, high: number): { text: string; tone: Tone } {
  if (score >= high) return { text: "High priority", tone: "brand" };
  if (score >= 45) return { text: "Medium priority", tone: "neutral" };
  return { text: "Low priority", tone: "neutral" };
}

/** Turns a stored priority line ("+35 estimated $6,000 a year") into a plain reason, or null. */
export function priorityReason(line: string): string | null {
  const text = line.replace(/^[+−-]\d+\s+/, "");
  if (text === "rule weight") return null;
  if (text === "value not estimated") return "There's no value estimate for this kind of signal.";
  const est = text.match(/^estimated (.+) a year$/);
  if (est) return `Worth about ${est[1]} a year.`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
