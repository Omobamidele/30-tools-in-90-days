import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

// Supplier deadlines are defined in local time ("5:00 pm Lisbon"). We store UTC instants
// and keep the timezone alongside, so both can be shown.

/** Local date + time in an IANA timezone → UTC Date. */
export function localToUtc(localDate: string, localTime: string, timeZone: string): Date {
  const [y, m, d] = localDate.split("-").map(Number);
  const [hh, mm] = localTime.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, timeZone).getTime());
}

/** The local calendar date ("YYYY-MM-DD") of an instant in a timezone. */
export function localDateOf(instant: Date, timeZone: string): string {
  return format(new TZDate(instant.getTime(), timeZone), "yyyy-MM-dd");
}

export function formatLocal(instant: Date, timeZone: string, pattern = "MMM d, yyyy HH:mm"): string {
  return format(new TZDate(instant.getTime(), timeZone), pattern);
}

/** Whole days from `from` to `to` (local dates), negative when `to` is earlier. */
export function daysBetween(fromLocalDate: string, toLocalDate: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toLocalDate) - utc(fromLocalDate)) / 86_400_000);
}

/** Adds whole days to a local date. */
export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
