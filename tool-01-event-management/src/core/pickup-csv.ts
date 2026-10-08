// Maps rows from a hotel pickup / housing report CSV onto a room block's nights.
// Pure and tested; the UI does the file reading and column selection.

export type DateFormat = "ISO" | "US" | "EU";
export type CsvRowError = { row: number; column: string; problem: string; value: string };
export type CsvMapping = { dateColumn: string; pickedUpColumn: string; forecastColumn?: string | null; dateFormat: DateFormat };

const pad = (n: number) => String(n).padStart(2, "0");

export function parseCsvDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return valid(+iso[1], +iso[2], +iso[3]);
  const parts = s.split(/[/.-]/).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, yy] = parts.map(Number);
  const c = yy < 100 ? yy + 2000 : yy;
  return format === "US" ? valid(c, a, b) : valid(c, b, a);
}

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function guessDateFormat(values: string[]): DateFormat {
  if (values.some((v) => /^\d{4}-/.test(v.trim()))) return "ISO";
  const firstParts = values.map((v) => Number(v.split(/[/.-]/)[0])).filter((n) => !Number.isNaN(n));
  return firstParts.some((n) => n > 12) ? "EU" : "US";
}

export function mapPickupCsv(
  rows: Array<Record<string, string>>,
  mapping: CsvMapping,
  blockNights: string[],
): { nights: Record<string, { pickedUp: number; forecastFinal: number | null }>; errors: CsvRowError[]; ignored: number } {
  const nights: Record<string, { pickedUp: number; forecastFinal: number | null }> = {};
  const errors: CsvRowError[] = [];
  const inBlock = new Set(blockNights);
  let ignored = 0;
  rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const rawDate = r[mapping.dateColumn] ?? "";
    const date = parseCsvDate(rawDate, mapping.dateFormat);
    if (!date) {
      if (rawDate.trim() || Object.values(r).some((v) => v?.trim())) {
        errors.push({ row: rowNo, column: mapping.dateColumn, problem: "Not a date", value: rawDate });
      }
      return;
    }
    if (!inBlock.has(date)) {
      ignored++;
      return;
    }
    const rawPicked = (r[mapping.pickedUpColumn] ?? "").replace(/[,\s]/g, "");
    if (!/^\d+$/.test(rawPicked)) {
      errors.push({ row: rowNo, column: mapping.pickedUpColumn, problem: "Not a whole number of rooms", value: r[mapping.pickedUpColumn] ?? "" });
      return;
    }
    let forecast: number | null = null;
    if (mapping.forecastColumn) {
      const rawF = (r[mapping.forecastColumn] ?? "").replace(/[,\s]/g, "");
      if (rawF && !/^\d+$/.test(rawF)) {
        errors.push({ row: rowNo, column: mapping.forecastColumn, problem: "Not a whole number of rooms", value: r[mapping.forecastColumn] ?? "" });
        return;
      }
      forecast = rawF ? Number(rawF) : null;
    }
    if (nights[date]) {
      errors.push({ row: rowNo, column: mapping.dateColumn, problem: "Night appears more than once; the first row was kept", value: rawDate });
      return;
    }
    nights[date] = { pickedUp: Number(rawPicked), forecastFinal: forecast };
  });
  return { nights, errors, ignored };
}
