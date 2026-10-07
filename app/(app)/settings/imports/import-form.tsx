"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/ui/button";
import { importAccountsAction } from "../actions";

type Result = { created: number; updated: number; errors: Array<{ row: number; reason: string }> };

export function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return setError("Choose a CSV file first.");
        setError(null);
        setResult(null);
        Papa.parse<Record<string, string>>(file, {
          header: true,
          skipEmptyLines: true,
          complete: (parsed) => {
            if (!parsed.data.length) return setError("That file has no rows under the header.");
            start(async () => {
              const r = await importAccountsAction(file.name, parsed.data);
              if (!r.ok) return setError(r.error.message);
              setResult(r.data);
              router.refresh();
            });
          },
          error: (err) => setError(`Couldn't read that file: ${err.message}`),
        });
      }}
    >
      <label className="flex flex-col gap-1 text-table font-medium">
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-table font-normal file:mr-3 file:rounded-control file:border file:border-field file:bg-surface file:px-3 file:py-1.5" />
      </label>
      {error ? (
        <p role="alert" className="text-table text-risk">
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status" className="rounded-panel border border-rule bg-sunken/60 p-3 text-table">
          <p>
            <span className="font-medium">{result.created} created</span>, {result.updated} updated, {result.errors.length} rejected.
          </p>
          {result.errors.length ? (
            <ul className="mt-1 text-meta text-risk">
              {result.errors.slice(0, 20).map((x) => (
                <li key={x.row}>
                  Line {x.row}: {x.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending || !file}>
          {pending ? "Importing…" : "Import"}
        </Button>
      </div>
    </form>
  );
}
