"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { FileText, Trash2 } from "@/ui/icons";
import { cx } from "@/ui/cx";
import { createImportBatchAction, importContractFileAction } from "./actions";

type SupplierOption = { id: string; name: string; city: string | null };
type SupplierType = "HOTEL" | "VENUE" | "CATERER" | "AV_PRODUCTION" | "TRANSPORT" | "DMC" | "OTHER";

const TYPES: Array<[SupplierType, string]> = [
  ["HOTEL", "Hotel"],
  ["VENUE", "Venue"],
  ["CATERER", "Caterer"],
  ["AV_PRODUCTION", "AV / production"],
  ["TRANSPORT", "Transport"],
  ["DMC", "DMC"],
  ["OTHER", "Other"],
];

type Row = {
  key: string;
  file: File;
  title: string;
  supplierId: string; // "" with newName set = new supplier
  newName: string;
  newType: SupplierType;
  newCity: string;
  currency: string;
  state: { kind: "ready" } | { kind: "sending" } | { kind: "done"; manual: boolean } | { kind: "error"; message: string };
};

const MAX = 25 * 1024 * 1024;
const DOC_WORDS = new Set(["group", "agreement", "contract", "venue", "hire", "catering", "production", "av", "scanned", "signed", "final", "terms", "accommodation"]);
const STOP = new Set(["hotel", "the", "de", "do", "da", "centro", "and", "&"]);

const words = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const baseName = (f: string) => f.replace(/\.pdf$/i, "");
const ACRONYMS: Record<string, string> = { av: "AV", fb: "F&B", dmc: "DMC", sow: "SOW", msa: "MSA" };
const NOISE = new Set(["scanned", "signed", "final", "copy", "v1", "v2"]);

/** Suggestions from the file name, all editable: title, existing supplier, or a new supplier's name and type. */
function guess(file: File, suppliers: SupplierOption[]) {
  const base = baseName(file.name);
  const tokens = words(base);
  const match = suppliers.find((s) => {
    const key = words(s.name).find((w) => w.length >= 3 && !STOP.has(w));
    return key ? tokens.includes(key) : false;
  });
  const nameWords: string[] = [];
  for (const t of tokens) {
    if (DOC_WORDS.has(t)) break;
    nameWords.push(t);
  }
  const has = (...w: string[]) => w.some((x) => tokens.includes(x));
  const type: SupplierType = has("hotel", "rooms", "accommodation")
    ? "HOTEL"
    : has("catering", "caterer")
      ? "CATERER"
      : has("av", "production", "stage", "sound")
        ? "AV_PRODUCTION"
        : has("coach", "coaches", "transfer", "transport")
          ? "TRANSPORT"
          : has("venue", "hire", "hall")
            ? "VENUE"
            : "OTHER";
  // Title: the document part of the file name ("Group Agreement", "AV Production"), since the
  // supplier is shown beside it. Falls back to "Contract" rather than repeating the supplier.
  const supplierWords = new Set(match ? words(match.name) : nameWords);
  const docWords = tokens.filter((t) => !supplierWords.has(t) && !NOISE.has(t));
  const title = docWords.map((t) => ACRONYMS[t] ?? titleCase(t)).join(" ");
  return {
    title: title || "Contract",
    supplierId: match?.id ?? "",
    newName: match ? "" : titleCase(nameWords.join(" ")),
    newType: type,
  };
}

export function BulkImport({
  eventId,
  defaultCurrency,
  currencies,
  defaultCity,
  suppliers,
  canAddSuppliers,
}: {
  eventId: string;
  defaultCurrency: string;
  currencies: string[];
  defaultCity: string;
  suppliers: SupplierOption[];
  canAddSuppliers: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const [rows, setRows] = useState<Row[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const bad: string[] = [];
    const next: Row[] = [];
    for (const file of Array.from(list)) {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") bad.push(`${file.name}: only PDFs can be imported`);
      else if (file.size > MAX) bad.push(`${file.name}: larger than 25 MB`);
      else {
        const g = guess(file, suppliers);
        next.push({
          key: `${file.name}-${file.size}-${Math.random()}`,
          file,
          title: g.title,
          supplierId: g.supplierId,
          newName: g.newName,
          newType: g.newType,
          newCity: defaultCity,
          currency: defaultCurrency,
          state: { kind: "ready" },
        });
      }
    }
    setRejected(bad);
    setRows((r) => [...r, ...next]);
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const problems = (r: Row) => (!r.title.trim() ? "Add a title" : !r.supplierId && !r.newName.trim() ? "Choose or name the supplier" : null);
  const ready = rows.filter((r) => r.state.kind !== "done");
  const invalid = ready.some((r) => problems(r));

  async function importAll() {
    setBusy(true);
    setError(null);
    let id = batchId;
    if (!id) {
      const res = await createImportBatchAction(eventId);
      if (!res.ok) {
        setError(res.error.message);
        setBusy(false);
        return;
      }
      id = res.data.batchId;
      setBatchId(id);
    }
    let failures = 0;
    // One file per request, in order: each stays under the upload limit, and the table shows progress.
    for (const r of ready) {
      update(r.key, { state: { kind: "sending" } });
      const form = new FormData();
      form.set("file", r.file);
      form.set(
        "meta",
        JSON.stringify({
          title: r.title,
          currency: r.currency,
          supplierId: r.supplierId,
          newSupplier: r.supplierId ? null : { name: r.newName, type: r.newType, city: r.newCity },
        }),
      );
      const res = await importContractFileAction(id, form);
      if (res.ok) update(r.key, { state: { kind: "done", manual: res.data.runStatus === "NOT_APPLICABLE" } });
      else {
        failures++;
        const field = Object.values(res.error.fieldErrors)[0];
        update(r.key, { state: { kind: "error", message: field ?? res.error.message } });
      }
    }
    setBusy(false);
    if (!failures) router.push(`/events/${eventId}/contracts/import/${id}`);
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <label
        htmlFor={inputId}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(e.dataTransfer.files);
        }}
        className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-panel border-2 border-dashed border-rule-strong bg-sunken/50 px-4 py-8 text-center hover:border-brand focus-within:border-brand"
      >
        <FileText size={28} aria-hidden className="text-muted" />
        <span className="text-body font-medium">Drop signed contract PDFs here, or choose files</span>
        <span className="text-table text-muted">Hotels, venues, caterers, AV. Up to 25 MB each. Scanned paper contracts are fine: you&apos;ll enter their terms by hand.</span>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {rejected.length ? (
        <ul role="alert" className="text-table text-risk">
          {rejected.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-table">
            <thead>
              <tr className="text-left text-meta text-faint">
                <th scope="col" className="pb-2 font-medium">File</th>
                <th scope="col" className="pb-2 font-medium">Contract title</th>
                <th scope="col" className="pb-2 font-medium">Supplier</th>
                <th scope="col" className="pb-2 font-medium">Currency</th>
                <th scope="col" className="pb-2 font-medium">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const locked = r.state.kind === "done" || r.state.kind === "sending" || busy;
                const problem = problems(r);
                return (
                  <tr key={r.key} className="border-t border-rule align-top">
                    <td className="py-2.5 pr-3">
                      <span className="block max-w-48 truncate font-medium" title={r.file.name}>
                        {r.file.name}
                      </span>
                      <span className="text-meta text-faint">{(r.file.size / 1024).toFixed(0)} KB</span>
                    </td>
                    <td className="py-2 pr-3">
                      <Input aria-label={`Title for ${r.file.name}`} value={r.title} disabled={locked} onChange={(e) => update(r.key, { title: e.target.value })} />
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        aria-label={`Supplier for ${r.file.name}`}
                        value={r.supplierId || "__new"}
                        disabled={locked}
                        onChange={(e) => update(r.key, { supplierId: e.target.value === "__new" ? "" : e.target.value })}
                      >
                        {canAddSuppliers ? <option value="__new">New supplier…</option> : <option value="__new" disabled>Choose a supplier</option>}
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.city ? ` (${s.city})` : ""}
                          </option>
                        ))}
                      </Select>
                      {!r.supplierId && canAddSuppliers ? (
                        <div className="mt-1.5 grid grid-cols-[1fr_130px_110px] gap-1.5">
                          <Input aria-label={`New supplier name for ${r.file.name}`} placeholder="Supplier name" value={r.newName} disabled={locked} onChange={(e) => update(r.key, { newName: e.target.value })} />
                          <Select aria-label={`New supplier type for ${r.file.name}`} value={r.newType} disabled={locked} onChange={(e) => update(r.key, { newType: e.target.value as SupplierType })}>
                            {TYPES.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </Select>
                          <Input aria-label={`New supplier city for ${r.file.name}`} placeholder="City" value={r.newCity} disabled={locked} onChange={(e) => update(r.key, { newCity: e.target.value })} />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Select aria-label={`Currency for ${r.file.name}`} value={r.currency} disabled={locked} onChange={(e) => update(r.key, { currency: e.target.value })} className="w-24">
                        {currencies.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="w-48 py-2.5 text-right">
                      {r.state.kind === "ready" ? (
                        problem ? (
                          <span className="text-meta text-watch">{problem}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                            disabled={busy}
                            aria-label={`Remove ${r.file.name}`}
                            className="rounded-control p-1.5 text-faint hover:bg-sunken hover:text-risk"
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        )
                      ) : r.state.kind === "sending" ? (
                        <span className="text-meta text-muted">Uploading…</span>
                      ) : r.state.kind === "done" ? (
                        <span className={cx("text-meta font-medium", r.state.manual ? "text-watch" : "text-settled")}>
                          {r.state.manual ? "Added: scan, enter terms by hand" : "Added, reading terms"}
                        </span>
                      ) : (
                        <span role="alert" className="text-meta text-risk">
                          {r.state.message}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-table text-risk">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!ready.length || invalid || busy} onClick={importAll}>
          {busy ? "Importing…" : ready.length ? `Import ${ready.length} contract${ready.length === 1 ? "" : "s"}` : "Import contracts"}
        </Button>
        {batchId && !busy && rows.some((r) => r.state.kind === "done") ? (
          <Button onClick={() => router.push(`/events/${eventId}/contracts/import/${batchId}`)}>Continue with the ones that worked</Button>
        ) : null}
        <p className="text-table text-muted">Nothing counts toward deadlines or penalties until a person confirms each term.</p>
      </div>
    </div>
  );
}
