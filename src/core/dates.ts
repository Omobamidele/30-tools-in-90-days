// Calendar dates are "YYYY-MM-DD" strings (usage is reported per day, in the vendor's reporting
// day). Arithmetic is done in UTC so it never shifts across DST.

export type IsoDate = string;

const toUtc = (d: IsoDate) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function addDays(d: IsoDate, n: number): IsoDate {
  return new Date(toUtc(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function formatDay(d: IsoDate): string {
  return new Date(toUtc(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDayLong(d: IsoDate): string {
  return new Date(toUtc(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
