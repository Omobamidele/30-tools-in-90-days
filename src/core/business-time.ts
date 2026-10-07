import { TZDate } from "@date-fns/tz";

// Deadlines are counted in the organisation's business days and time zone (spec FR-15/18).
// "2 business days" from Friday 16:00 is Tuesday 16:00; holidays are skipped.

export type BusinessCalendar = { timezone: string; businessDays: number[]; holidays: string[] };

const isoWeekday = (d: TZDate) => (d.getDay() === 0 ? 7 : d.getDay());
const localIso = (d: TZDate) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function isBusinessDay(d: TZDate, cal: BusinessCalendar): boolean {
  return cal.businessDays.includes(isoWeekday(d)) && !cal.holidays.includes(localIso(d));
}

export function addBusinessDays(from: Date, days: number, cal: BusinessCalendar): Date {
  let added = 0;
  const cursor = new TZDate(from.getTime(), cal.timezone);
  while (added < days) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, cal)) added++;
  }
  return new Date(cursor.getTime());
}

/** Business days from `from` until `to` (negative when overdue). Whole days, local calendar. */
export function businessDaysUntil(from: Date, to: Date, cal: BusinessCalendar): number {
  const a = new TZDate(from.getTime(), cal.timezone);
  const b = new TZDate(to.getTime(), cal.timezone);
  const sign = b.getTime() >= a.getTime() ? 1 : -1;
  const [start, end] = sign === 1 ? [a, b] : [b, a];
  const cursor = new TZDate(start.getTime(), cal.timezone);
  let n = 0;
  while (localIso(cursor) < localIso(end)) {
    cursor.setDate(cursor.getDate() + 1);
    if (isBusinessDay(cursor, cal)) n++;
  }
  return sign * n;
}

export type DeadlineState = "ON_TRACK" | "DUE_SOON" | "OVERDUE" | "ESCALATE";

/**
 * Three escalation points (spec §6.2): due soon at half the window left, overdue at the
 * deadline, escalate two business days after it.
 */
export function deadlineState(startedAt: Date, dueAt: Date, now: Date, cal: BusinessCalendar): DeadlineState {
  if (now.getTime() >= dueAt.getTime()) {
    return businessDaysUntil(dueAt, now, cal) >= 2 ? "ESCALATE" : "OVERDUE";
  }
  const half = startedAt.getTime() + (dueAt.getTime() - startedAt.getTime()) / 2;
  return now.getTime() >= half ? "DUE_SOON" : "ON_TRACK";
}

export function localDate(d: Date, timezone: string): string {
  return localIso(new TZDate(d.getTime(), timezone));
}
