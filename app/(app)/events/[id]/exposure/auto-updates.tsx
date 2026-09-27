"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { guessDateFormat, mapPickupCsv, type DateFormat } from "@/core/pickup-csv";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Input, Select } from "@/ui/field";
import { cx } from "@/ui/cx";
import { previewReportAction, rotateInboundAction, setUpInboundAction, turnOffInboundAction } from "./actions";

export type InboundState = {
  address: string;
  allowedSenderDomain: string | null;
  lastReceivedAt: string | null;
  lastResult: { ok: boolean; message: string; filename: string | null } | null;
} | null;

/** Per room block: the address the hotel's pickup report goes to, or the button to set one up. */
export function AutoUpdates({
  eventId,
  clauseId,
  label,
  nights,
  inbound,
  canEdit,
}: {
  eventId: string;
  clauseId: string;
  label: string;
  nights: string[];
  inbound: InboundState;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error?.message ?? "Something went wrong.");
      else router.refresh();
    });

  if (!inbound) {
    return canEdit ? (
      <>
        <Button size="sm" onClick={() => setOpen(true)}>
          Set up email updates
        </Button>
        {open ? <SetupDialog eventId={eventId} clauseId={clauseId} label={label} nights={nights} onClose={() => setOpen(false)} /> : null}
      </>
    ) : null;
  }

  const when = inbound.lastReceivedAt ? new Date(inbound.lastReceivedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div data-surface className="w-full rounded-control border border-rule bg-sunken/50 px-3 py-2 text-table">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-muted">Hotel reports by email</span>
        <code className="rounded-[4px] bg-surface px-1.5 py-0.5 font-mono text-meta text-ink">{inbound.address}</code>
        <button
          type="button"
          className="text-meta font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
          onClick={async () => {
            await navigator.clipboard.writeText(inbound.address).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        {canEdit ? (
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => rotateInboundAction(eventId, clauseId))}>
              New address
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => turnOffInboundAction(eventId, clauseId))}>
              Turn off
            </Button>
          </span>
        ) : null}
      </div>
      <p className={cx("mt-1 text-meta", !inbound.lastResult ? "text-faint" : inbound.lastResult.ok ? "text-settled" : "text-risk")}>
        {inbound.lastResult ? `Last report ${when}: ${inbound.lastResult.message}` : "No report received yet. Ask the hotel to send its weekly pickup report to this address."}
        {inbound.allowedSenderDomain ? <span className="text-faint"> Only accepts reports from {inbound.allowedSenderDomain}.</span> : null}
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-meta text-risk">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Preview = { fileName: string; headers: string[]; rows: Array<Record<string, string>> };

function SetupDialog({ eventId, clauseId, label, nights, onClose }: { eventId: string; clauseId: string; label: string; nights: string[]; onClose: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dateColumn, setDateColumn] = useState("");
  const [pickedColumn, setPickedColumn] = useState("");
  const [forecastColumn, setForecastColumn] = useState("");
  const [format, setFormat] = useState<DateFormat>("ISO");
  const [domain, setDomain] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onFile(file: File) {
    setError(null);
    const form = new FormData();
    form.set("file", file);
    start(async () => {
      const res = await previewReportAction(eventId, clauseId, form);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      const { headers, rows } = res.data;
      const d = headers.find((c) => /date|night|arrival|stay/i.test(c)) ?? headers[0];
      setPreview(res.data);
      setDateColumn(d);
      setPickedColumn(headers.find((c) => /pick|actual|booked|occupied|sold/i.test(c)) ?? headers[1]);
      setForecastColumn(headers.find((c) => /forecast|projected/i.test(c)) ?? "");
      setFormat(guessDateFormat(rows.slice(0, 20).map((r) => r[d] ?? "")));
    });
  }

  const mapping = { dateColumn, pickedUpColumn: pickedColumn, forecastColumn: forecastColumn || null, dateFormat: format };
  const result = preview ? mapPickupCsv(preview.rows, mapping, nights) : null;
  const matched = result ? Object.keys(result.nights).length : 0;

  function turnOn() {
    setError(null);
    start(async () => {
      const res = await setUpInboundAction(eventId, clauseId, { mapping, allowedSenderDomain: domain });
      if (!res.ok) {
        setError(Object.values(res.error.fieldErrors)[0] ?? res.error.message);
        return;
      }
      setAddress(res.data.address);
      router.refresh();
    });
  }

  const columns = preview?.headers ?? [];
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Email updates: ${label}`}
      description="Hotels send pickup reports every week. Give this block an address, and each report sent there updates the figures by itself."
      wide
    >
      {address ? (
        <div className="flex flex-col gap-3 text-table">
          <p className="font-medium text-settled">Email updates are on.</p>
          <p>Ask the hotel to send its pickup report to this address, or forward the report yourself when it arrives:</p>
          <code className="rounded-control border border-rule bg-sunken px-3 py-2 font-mono text-body">{address}</code>
          <p className="text-muted">Each report is read with the columns you just chose. A report that doesn&apos;t match is rejected and you&apos;re told why; nothing is guessed.</p>
          <div>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-table">
            <span className="font-medium">1. Upload one of the hotel&apos;s reports</span>{" "}
            <span className="text-muted">(CSV or Excel), so the columns can be matched once.</span>
          </p>
          <label className="inline-flex h-9 w-fit cursor-pointer items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken">
            {pending && !preview ? "Reading…" : preview ? `Sample: ${preview.fileName}` : "Choose a sample report"}
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>

          {preview ? (
            <>
              <p className="text-table font-medium">2. Check the columns</p>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="text-meta text-muted">
                  Night column
                  <Select value={dateColumn} onChange={(e) => setDateColumn(e.target.value)}>
                    {columns.map((c) => (
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
                  Rooms picked up
                  <Select value={pickedColumn} onChange={(e) => setPickedColumn(e.target.value)}>
                    {columns.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </label>
                <label className="text-meta text-muted">
                  Forecast (optional)
                  <Select value={forecastColumn} onChange={(e) => setForecastColumn(e.target.value)}>
                    <option value="">None</option>
                    {columns.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </label>
              </div>
              <p className={cx("text-table", matched ? "text-ink" : "text-watch")} role="status">
                <span className="num font-medium">
                  {matched} of {nights.length}
                </span>{" "}
                nights of this block found in the sample
                {result?.errors.length ? `; ${result.errors.length} row${result.errors.length === 1 ? "" : "s"} couldn't be read` : ""}.
              </p>
              <label className="text-table">
                <span className="font-medium">3. Only accept reports from (optional)</span>
                <Input className="mt-1 max-w-72" placeholder="hotelalvorada.pt" value={domain} onChange={(e) => setDomain(e.target.value)} />
                <span className="mt-1 block text-meta text-muted">Reports from any other sender are rejected, and you&apos;re told.</span>
              </label>
            </>
          ) : null}

          {error ? (
            <p role="alert" className="text-table text-risk">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="primary" disabled={!preview || !matched || pending} onClick={turnOn}>
              Turn on email updates
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
