"use client";

import { useState } from "react";
import Papa from "papaparse";
import { guessDateFormat, mapPickupCsv, type CsvRowError, type DateFormat } from "@/core/pickup-csv";
import { Button } from "@/ui/button";
import { Select } from "@/ui/field";

type Parsed = { fileName: string; columns: string[]; rows: Array<Record<string, string>> };

/** Reads a pickup report CSV, lets the user map columns, and fills the pickup grid. */
export function CsvImport({
  nights,
  onApply,
}: {
  nights: string[];
  onApply: (values: Record<string, { pickedUp: number; forecastFinal: number | null }>, fileName: string) => void;
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateColumn, setDateColumn] = useState("");
  const [pickedColumn, setPickedColumn] = useState("");
  const [forecastColumn, setForecastColumn] = useState("");
  const [format, setFormat] = useState<DateFormat>("ISO");

  function onFile(file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("The file is larger than 5 MB.");
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (res) => {
        const columns = res.meta.fields ?? [];
        if (columns.length < 2) {
          setError("Couldn't find columns in this file. Export the report as CSV with a header row.");
          return;
        }
        const guessDate = columns.find((c) => /date|night|arrival/i.test(c)) ?? columns[0];
        const guessPicked = columns.find((c) => /pick|actual|booked|occupied|sold/i.test(c)) ?? columns[1];
        setParsed({ fileName: file.name, columns, rows: res.data });
        setDateColumn(guessDate);
        setPickedColumn(guessPicked);
        setForecastColumn(columns.find((c) => /forecast|projected/i.test(c)) ?? "");
        setFormat(guessDateFormat(res.data.slice(0, 20).map((r) => r[guessDate] ?? "")));
      },
      error: () => setError("This file couldn't be read as CSV."),
    });
  }

  const result = parsed
    ? mapPickupCsv(parsed.rows, { dateColumn, pickedUpColumn: pickedColumn, forecastColumn: forecastColumn || null, dateFormat: format }, nights)
    : null;
  const matched = result ? Object.keys(result.nights).length : 0;

  return (
    <div className="rounded-control border border-rule p-3">
      <p className="text-table font-medium">Import from a pickup report (CSV)</p>
      {error ? <p className="mt-1 text-meta text-risk">{error}</p> : null}
      {!parsed ? (
        <label className="mt-2 inline-flex h-8 cursor-pointer items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken">
          Choose CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-meta text-muted">
            {parsed.fileName}: {parsed.rows.length} rows
          </p>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="text-meta text-muted">
              Night column
              <Select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)}>
                {parsed.columns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className="text-meta text-muted">
              Date format
              <Select value={format} onChange={(e) => setFormat(e.target.value as DateFormat)}>
                <option value="ISO">2027-11-14</option>
                <option value="US">11/14/2027</option>
                <option value="EU">14/11/2027</option>
              </Select>
            </label>
            <label className="text-meta text-muted">
              Picked-up column
              <Select value={pickedColumn} onChange={(e) => setPickedColumn(e.target.value)}>
                {parsed.columns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
            <label className="text-meta text-muted">
              Forecast column (optional)
              <Select value={forecastColumn} onChange={(e) => setForecastColumn(e.target.value)}>
                <option value="">None</option>
                {parsed.columns.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </label>
          </div>
          {result ? (
            <p className="text-table">
              <span className="num font-medium">
                {matched} of {nights.length}
              </span>{" "}
              block nights found{result.ignored ? `; ${result.ignored} rows outside the block ignored` : ""}.
            </p>
          ) : null}
          {result?.errors.length ? <ErrorTable errors={result.errors} /> : null}
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!matched} onClick={() => result && onApply(result.nights, parsed.fileName)}>
              Use these values
            </Button>
            <Button size="sm" onClick={() => setParsed(null)}>
              Choose another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorTable({ errors }: { errors: CsvRowError[] }) {
  return (
    <table className="w-full text-meta">
      <caption className="text-left text-watch">Rows that couldn&apos;t be used ({errors.length})</caption>
      <thead className="text-muted">
        <tr>
          <th scope="col" className="text-left font-medium">Row</th>
          <th scope="col" className="text-left font-medium">Column</th>
          <th scope="col" className="text-left font-medium">Problem</th>
          <th scope="col" className="text-left font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {errors.slice(0, 20).map((e, i) => (
          <tr key={i} className="border-t border-rule">
            <td className="num">{e.row}</td>
            <td>{e.column}</td>
            <td>{e.problem}</td>
            <td className="max-w-32 truncate">{e.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
