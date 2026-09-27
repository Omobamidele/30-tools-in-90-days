import { format, parseISO } from "date-fns";
import { daysBetween, formatLocal, localDateOf } from "@/core/time";

export function formatDate(localDate: string | null | undefined): string {
  if (!localDate) return "";
  return format(parseISO(localDate), "MMM d, yyyy");
}

export function formatDateRange(start: string, end: string): string {
  const s = parseISO(start);
  const e = parseISO(end);
  if (start === end) return format(s, "MMM d, yyyy");
  if (s.getFullYear() === e.getFullYear()) {
    return s.getMonth() === e.getMonth()
      ? `${format(s, "MMM d")}–${format(e, "d, yyyy")}`
      : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
  }
  return `${format(s, "MMM d, yyyy")} – ${format(e, "MMM d, yyyy")}`;
}

/** "in 11 days", "today", "3 days overdue", measured in the deadline's own timezone. */
export function relativeDue(dueAt: Date, tz: string, now: Date): { text: string; days: number } {
  const days = daysBetween(localDateOf(now, tz), localDateOf(dueAt, tz));
  if (dueAt.getTime() < now.getTime()) {
    const late = Math.max(0, -days);
    return { text: late === 0 ? "Overdue today" : `${late} day${late === 1 ? "" : "s"} overdue`, days };
  }
  if (days === 0) return { text: "Due today", days };
  if (days === 1) return { text: "Due tomorrow", days };
  return { text: `In ${days} days`, days };
}

export function formatDue(dueAt: Date, tz: string): string {
  return `${formatLocal(dueAt, tz, "MMM d, yyyy HH:mm")} ${shortTz(tz, dueAt)}`;
}

export function shortTz(tz: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

export function formatDateTime(d: Date, tz: string): string {
  return formatLocal(d, tz, "MMM d, yyyy HH:mm");
}
