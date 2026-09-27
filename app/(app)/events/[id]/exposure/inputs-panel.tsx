"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, parseMoney } from "@/core/money";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { Panel } from "@/ui/page";
import { formatDate } from "@/ui/format";
import { useAction } from "@/ui/use-action";
import { recordPickupAction, updateInputsAction } from "./actions";
import { CsvImport } from "./csv-import";
import { AutoUpdates, type InboundState } from "./auto-updates";

export type BlockInput = {
  clauseId: string;
  label: string;
  supplierName: string;
  nights: Array<{ date: string; rooms: number }>;
  latest: { capturedAt: string; nights: Record<string, { pickedUp: number; forecastFinal: number | null }> } | null;
  projection: "CURRENT" | "FORECAST";
  /** Emailed hotel reports for this block, or null when not set up. */
  inbound: InboundState;
};

export type FbInput = {
  clauseId: string;
  label: string;
  supplierName: string;
  currency: string;
  minimumMinor: number;
  forecastMethod: "MANUAL" | "PER_HEAD";
  perHeadMinor: number | null;
  forecastManualMinor: number | null;
};

// Planner inputs: pickup and F&B forecasts. These are estimates, not contract terms,
// so they can change any time without re-confirming the contract.
export function InputsPanel({
  eventId,
  blocks,
  fbs,
  attendance,
  canEdit,
}: {
  eventId: string;
  blocks: BlockInput[];
  fbs: FbInput[];
  attendance: number;
  canEdit: boolean;
}) {
  const [pickupFor, setPickupFor] = useState<BlockInput | null>(null);
  const [fbFor, setFbFor] = useState<FbInput | null>(null);
  if (!blocks.length && !fbs.length) return null;

  return (
    <Panel title="Forecast inputs" description="Pickup and spend forecasts that drive current exposure.">
      <ul className="divide-y divide-rule">
        {blocks.map((b) => {
          const total = b.nights.reduce((s, n) => s + n.rooms, 0);
          const picked = b.latest ? Object.values(b.latest.nights).reduce((s, n) => s + n.pickedUp, 0) : null;
          return (
            <li key={b.clauseId} className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between">
              <div className="min-w-0 text-table">
                <p className="font-medium">
                  {b.label} <span className="font-normal text-muted">{b.supplierName}</span>
                </p>
                <p className="text-muted">
                  {picked === null ? (
                    <span className="text-watch">No pickup recorded</span>
                  ) : (
                    <>
                      <span className="num text-ink">
                        {picked.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
                      </span>{" "}
                      room nights picked up as of {new Date(b.latest!.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </>
                  )}
                  {" · "}projection: {b.projection === "FORECAST" ? "forecast final pickup" : "current pickup"}
                </p>
              </div>
              {canEdit ? (
                <span className="flex gap-2">
                  {!b.inbound ? <AutoUpdates eventId={eventId} clauseId={b.clauseId} label={b.label} nights={b.nights.map((n) => n.date)} inbound={null} canEdit={canEdit} /> : null}
                  <Button size="sm" onClick={() => setPickupFor(b)}>
                    Record pickup
                  </Button>
                </span>
              ) : null}
              {b.inbound ? <AutoUpdates eventId={eventId} clauseId={b.clauseId} label={b.label} nights={b.nights.map((n) => n.date)} inbound={b.inbound} canEdit={canEdit} /> : null}
            </li>
          );
        })}
        {fbs.map((f) => (
          <li key={f.clauseId} className="flex flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 text-table">
              <p className="font-medium">
                {f.label} <span className="font-normal text-muted">{f.supplierName}</span>
              </p>
              <p className="text-muted">
                Minimum <span className="num text-ink">{formatMoney(f.minimumMinor, f.currency)}</span> · forecast{" "}
                {f.forecastMethod === "PER_HEAD" ? (
                  f.perHeadMinor !== null ? (
                    <span className="num text-ink">
                      {formatMoney(f.perHeadMinor, f.currency)} per attendee × {attendance}
                    </span>
                  ) : (
                    <span className="text-watch">not set</span>
                  )
                ) : f.forecastManualMinor !== null ? (
                  <span className="num text-ink">{formatMoney(f.forecastManualMinor, f.currency)}</span>
                ) : (
                  <span className="text-watch">not set</span>
                )}
              </p>
            </div>
            {canEdit ? (
              <Button size="sm" onClick={() => setFbFor(f)}>
                Update forecast
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {pickupFor ? <PickupDialog eventId={eventId} block={pickupFor} onClose={() => setPickupFor(null)} /> : null}
      {fbFor ? <FbDialog eventId={eventId} fb={fbFor} onClose={() => setFbFor(null)} /> : null}
    </Panel>
  );
}

function PickupDialog({ eventId, block, onClose }: { eventId: string; block: BlockInput; onClose: () => void }) {
  const router = useRouter();
  const save = useAction(recordPickupAction);
  const inputs = useAction(updateInputsAction);
  const [projection, setProjection] = useState(block.projection);
  const [source, setSource] = useState<{ kind: "MANUAL" | "CSV"; fileName?: string }>({ kind: "MANUAL" });
  const [rows, setRows] = useState(
    block.nights.map((n) => ({
      date: n.date,
      rooms: n.rooms,
      pickedUp: String(block.latest?.nights[n.date]?.pickedUp ?? ""),
      forecastFinal: String(block.latest?.nights[n.date]?.forecastFinal ?? ""),
    })),
  );

  async function submit() {
    if (projection !== block.projection) {
      const r = await inputs.run(eventId, block.clauseId, { projection });
      if (!r.ok) return;
    }
    const res = await save.run(
      eventId,
      block.clauseId,
      { nights: rows.map((r) => ({ date: r.date, pickedUp: r.pickedUp === "" ? undefined : r.pickedUp, forecastFinal: r.forecastFinal })) },
      source.kind,
    );
    if (res.ok) {
      onClose();
      router.refresh();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Record pickup: ${block.label}`} description="From the hotel's pickup or housing report. Saved as a dated snapshot." wide>
      <div className="flex flex-col gap-3">
        <FormError message={save.error ?? inputs.error} fieldErrors={save.fieldErrors} />
        <CsvImport
          nights={block.nights.map((n) => n.date)}
          onApply={(values, fileName) => {
            setRows(rows.map((r) => (values[r.date] ? { ...r, pickedUp: String(values[r.date].pickedUp), forecastFinal: values[r.date].forecastFinal === null ? r.forecastFinal : String(values[r.date].forecastFinal) } : r)));
            setSource({ kind: "CSV", fileName });
          }}
        />
        {source.kind === "CSV" ? <p className="text-meta text-muted">Values below came from {source.fileName}. Check them, then save.</p> : null}
        <table className="w-full text-table">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">Night of</th>
              <th scope="col" className="py-1 text-right font-medium">Block</th>
              <th scope="col" className="py-1 pl-3 text-left font-medium">Picked up</th>
              <th scope="col" className="py-1 pl-3 text-left font-medium">Forecast final (optional)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.date} className="border-t border-rule">
                <td className="py-1">{formatDate(r.date)}</td>
                <td className="num py-1 text-right">{r.rooms}</td>
                <td className="py-1 pl-3">
                  <Input
                    aria-label={`Picked up on ${r.date}`}
                    type="number"
                    min={0}
                    className="num w-24"
                    value={r.pickedUp}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pickedUp: e.target.value } : x)))}
                  />
                </td>
                <td className="py-1 pl-3">
                  <Input
                    aria-label={`Forecast final on ${r.date}`}
                    type="number"
                    min={0}
                    className="num w-24"
                    value={r.forecastFinal}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, forecastFinal: e.target.value } : x)))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Field label="Project exposure from" help="Forecast final uses your estimate of where pickup will end; it must be set for every night.">
          {(p) => (
            <Select {...p} value={projection} onChange={(e) => setProjection(e.target.value as "CURRENT" | "FORECAST")} className="max-w-72">
              <option value="CURRENT">Current pickup (no further bookings)</option>
              <option value="FORECAST">Forecast final pickup</option>
            </Select>
          )}
        </Field>
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} disabled={save.pending || inputs.pending || rows.some((r) => r.pickedUp === "")}>
            Save pickup
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

function FbDialog({ eventId, fb, onClose }: { eventId: string; fb: FbInput; onClose: () => void }) {
  const router = useRouter();
  const save = useAction(updateInputsAction);
  const [method, setMethod] = useState(fb.forecastMethod);
  const [perHead, setPerHead] = useState(fb.perHeadMinor !== null ? (fb.perHeadMinor / 100).toFixed(2) : "");
  const [manual, setManual] = useState(fb.forecastManualMinor !== null ? (fb.forecastManualMinor / 100).toFixed(2) : "");
  const [local, setLocal] = useState<string | null>(null);

  async function submit() {
    const ph = perHead.trim() ? parseMoney(perHead) : null;
    const mn = manual.trim() ? parseMoney(manual) : null;
    if ((perHead.trim() && ph === null) || (manual.trim() && mn === null)) {
      setLocal("Enter amounts like 95.00");
      return;
    }
    const res = await save.run(eventId, fb.clauseId, { forecastMethod: method, perHeadMinor: ph, forecastManualMinor: mn });
    if (res.ok) {
      onClose();
      router.refresh();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`F&B forecast: ${fb.label}`} description={`Minimum ${formatMoney(fb.minimumMinor, fb.currency)}`}>
      <div className="flex flex-col gap-3">
        <FormError message={local ?? save.error} />
        <Field label="Forecast method">
          {(p) => (
            <Select {...p} value={method} onChange={(e) => setMethod(e.target.value as "MANUAL" | "PER_HEAD")}>
              <option value="PER_HEAD">Spend per attendee × forecast attendance</option>
              <option value="MANUAL">Total forecast spend</option>
            </Select>
          )}
        </Field>
        {method === "PER_HEAD" ? (
          <Field label={`Spend per attendee (${fb.currency})`} help="Across the whole event, before tax and service">
            {(p) => <Input {...p} inputMode="decimal" className="num max-w-40" value={perHead} onChange={(e) => setPerHead(e.target.value)} />}
          </Field>
        ) : (
          <Field label={`Total forecast spend (${fb.currency})`}>
            {(p) => <Input {...p} inputMode="decimal" className="num max-w-48" value={manual} onChange={(e) => setManual(e.target.value)} />}
          </Field>
        )}
        <div className="flex gap-2">
          <Button variant="primary" onClick={submit} disabled={save.pending}>
            Save forecast
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
