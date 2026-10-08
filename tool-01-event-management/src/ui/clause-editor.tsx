"use client";

import { useState } from "react";
import { Plus, Trash2 } from "@/ui/icons";
import type { ClauseType } from "@/core/clauses/schemas";
import { parseMoney } from "@/core/money";
import { Button } from "./button";
import { Field, Input, Select } from "./field";

// Edits contract terms for any clause type. Money is typed as decimals and converted to
// minor units here; the server validates everything again with the same schemas.

type Obj = Record<string, unknown>;
const toDecimal = (minor: unknown) => (typeof minor === "number" ? (minor / 100).toFixed(2) : "");
const toMinor = (s: string) => (s.trim() === "" ? null : parseMoney(s));
const toNum = (s: string) => (s.trim() === "" ? null : Number(s));

export type ClauseDraft = { label: string; terms: Obj };

export function defaultTerms(type: ClauseType, defaults: { commitmentPct: number; damagesPct: number; surchargePct: number }): ClauseDraft {
  switch (type) {
    case "PAYMENT":
      return { label: "Deposit", terms: { label: "Deposit", dueDate: "", dueTime: "17:00", amountMinor: null, percentOfContract: null, refundable: false } };
    case "ROOM_BLOCK":
      return {
        label: "Room block",
        terms: {
          blockName: "Main block",
          nights: [{ date: "", rooms: 0, rateMinor: 0 }],
          commitmentPct: defaults.commitmentPct,
          basis: "PER_NIGHT",
          damagesPct: defaults.damagesPct,
          cutoffDate: "",
          cutoffTime: "17:00",
          reviewPoints: [],
        },
      };
    case "FB_MINIMUM":
      return {
        label: "Food & beverage minimum",
        terms: { label: "Food & beverage minimum", minimumMinor: null, basis: "PRE_TAX_PRE_SERVICE", surchargePct: defaults.surchargePct },
      };
    case "CANCELLATION":
      return {
        label: "Cancellation schedule",
        terms: { basis: "CONTRACT_VALUE", depositTreatment: "CREDITED", tiers: [{ startsOn: "", penaltyPct: null, penaltyFixedMinor: null }] },
      };
    case "FINAL_GUARANTEE":
      return { label: "Final guarantee", terms: { dueDate: "", dueTime: "12:00", subject: "FB_COVERS", tolerancePct: 0 } };
    case "OTHER_DEADLINE":
      return { label: "Deadline", terms: { label: "", dueDate: "", dueTime: "17:00" } };
  }
}

export function ClauseEditor({
  type,
  value,
  onChange,
  errors,
  currency,
}: {
  type: ClauseType;
  value: ClauseDraft;
  onChange: (v: ClauseDraft) => void;
  errors: Record<string, string>;
  currency: string;
}) {
  const t = value.terms;
  const set = (patch: Obj) => onChange({ ...value, terms: { ...t, ...patch } });
  const e = (path: string) => errors[`terms.${path}`];

  switch (type) {
    case "PAYMENT":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment name" required error={e("label")} className="sm:col-span-2">
            {(p) => (
              <Input {...p} value={String(t.label ?? "")} onChange={(ev) => onChange({ label: ev.target.value, terms: { ...t, label: ev.target.value } })} />
            )}
          </Field>
          <Field label="Due date" required error={e("dueDate")}>
            {(p) => <Input {...p} type="date" value={String(t.dueDate ?? "")} onChange={(ev) => set({ dueDate: ev.target.value })} />}
          </Field>
          <Field label="Due time (supplier local)" error={e("dueTime")}>
            {(p) => <Input {...p} type="time" value={String(t.dueTime ?? "17:00")} onChange={(ev) => set({ dueTime: ev.target.value })} />}
          </Field>
          <PaymentAmount t={t} set={set} e={e} currency={currency} />
          <label className="flex items-center gap-2 text-table sm:col-span-2">
            <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={Boolean(t.refundable)} onChange={(ev) => set({ refundable: ev.target.checked })} />
            Refundable if the event is cancelled
          </label>
        </div>
      );

    case "ROOM_BLOCK":
      return <RoomBlockEditor t={t} set={set} e={e} currency={currency} onLabel={(l) => onChange({ label: l, terms: { ...t, blockName: l } })} />;

    case "FB_MINIMUM":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required error={e("label")} className="sm:col-span-2">
            {(p) => (
              <Input {...p} value={String(t.label ?? "")} onChange={(ev) => onChange({ label: ev.target.value, terms: { ...t, label: ev.target.value } })} />
            )}
          </Field>
          <MoneyField label={`Minimum spend (${currency})`} required value={t.minimumMinor} onChange={(v) => set({ minimumMinor: v })} error={e("minimumMinor")} />
          <Field label="Measured on" error={e("basis")}>
            {(p) => (
              <Select {...p} value={String(t.basis)} onChange={(ev) => set({ basis: ev.target.value })}>
                <option value="PRE_TAX_PRE_SERVICE">Food & beverage before tax and service</option>
                <option value="INCLUSIVE">Total including tax and service</option>
              </Select>
            )}
          </Field>
          <Field label="Surcharge on any shortfall (%)" help="Service charge and tax the supplier adds to the shortfall" error={e("surchargePct")}>
            {(p) => <Input {...p} type="number" step="0.01" min={0} max={100} className="num" value={String(t.surchargePct ?? 0)} onChange={(ev) => set({ surchargePct: toNum(ev.target.value) })} />}
          </Field>
        </div>
      );

    case "CANCELLATION":
      return <CancellationEditor t={t} set={set} e={e} currency={currency} />;

    case "FINAL_GUARANTEE":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Guarantee covers" error={e("subject")}>
            {(p) => (
              <Select {...p} value={String(t.subject)} onChange={(ev) => set({ subject: ev.target.value })}>
                <option value="FB_COVERS">F&B covers</option>
                <option value="ATTENDANCE">Attendance</option>
              </Select>
            )}
          </Field>
          <Field label="Allowed variance above the guarantee (%)" error={e("tolerancePct")}>
            {(p) => <Input {...p} type="number" step="0.01" min={0} max={100} className="num" value={String(t.tolerancePct ?? 0)} onChange={(ev) => set({ tolerancePct: toNum(ev.target.value) })} />}
          </Field>
          <Field label="Due date" required error={e("dueDate")}>
            {(p) => <Input {...p} type="date" value={String(t.dueDate ?? "")} onChange={(ev) => set({ dueDate: ev.target.value })} />}
          </Field>
          <Field label="Due time (supplier local)" error={e("dueTime")}>
            {(p) => <Input {...p} type="time" value={String(t.dueTime ?? "12:00")} onChange={(ev) => set({ dueTime: ev.target.value })} />}
          </Field>
        </div>
      );

    case "OTHER_DEADLINE":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What is due" required error={e("label")} className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                placeholder="e.g. Rooming list due"
                value={String(t.label ?? "")}
                onChange={(ev) => onChange({ label: ev.target.value || "Deadline", terms: { ...t, label: ev.target.value } })}
              />
            )}
          </Field>
          <Field label="Due date" required error={e("dueDate")}>
            {(p) => <Input {...p} type="date" value={String(t.dueDate ?? "")} onChange={(ev) => set({ dueDate: ev.target.value })} />}
          </Field>
          <Field label="Due time (supplier local)" error={e("dueTime")}>
            {(p) => <Input {...p} type="time" value={String(t.dueTime ?? "17:00")} onChange={(ev) => set({ dueTime: ev.target.value })} />}
          </Field>
        </div>
      );
  }
}

function MoneyField({
  label,
  value,
  onChange,
  error,
  required,
  help,
}: {
  label: string;
  value: unknown;
  onChange: (minor: number | null) => void;
  error?: string;
  required?: boolean;
  help?: string;
}) {
  const [text, setText] = useState(toDecimal(value));
  const [local, setLocal] = useState<string | undefined>();
  return (
    <Field label={label} required={required} error={error ?? local} help={help}>
      {(p) => (
        <Input
          {...p}
          inputMode="decimal"
          className="num"
          value={text}
          onChange={(ev) => {
            setText(ev.target.value);
            const m = toMinor(ev.target.value);
            setLocal(ev.target.value.trim() && m === null ? "Enter an amount like 12,500.00" : undefined);
            onChange(m);
          }}
        />
      )}
    </Field>
  );
}

function PaymentAmount({ t, set, e, currency }: { t: Obj; set: (p: Obj) => void; e: (p: string) => string | undefined; currency: string }) {
  const [mode, setMode] = useState<"amount" | "pct">(t.percentOfContract !== null && t.percentOfContract !== undefined ? "pct" : "amount");
  return (
    <>
      <Field label="Amount is" error={undefined}>
        {(p) => (
          <Select
            {...p}
            value={mode}
            onChange={(ev) => {
              const m = ev.target.value as "amount" | "pct";
              setMode(m);
              set(m === "amount" ? { percentOfContract: null } : { amountMinor: null });
            }}
          >
            <option value="amount">A fixed amount</option>
            <option value="pct">A percentage of the contract value</option>
          </Select>
        )}
      </Field>
      {mode === "amount" ? (
        <MoneyField label={`Amount (${currency})`} required value={t.amountMinor} onChange={(v) => set({ amountMinor: v })} error={e("amountMinor")} />
      ) : (
        <Field label="Percentage of contract value" required error={e("percentOfContract")}>
          {(p) => (
            <Input {...p} type="number" step="0.01" min={0} max={100} className="num" value={t.percentOfContract === null || t.percentOfContract === undefined ? "" : String(t.percentOfContract)} onChange={(ev) => set({ percentOfContract: toNum(ev.target.value) })} />
          )}
        </Field>
      )}
    </>
  );
}

type Night = { date: string; rooms: number; rateMinor: number };

function RoomBlockEditor({
  t,
  set,
  e,
  currency,
  onLabel,
}: {
  t: Obj;
  set: (p: Obj) => void;
  e: (p: string) => string | undefined;
  currency: string;
  onLabel: (l: string) => void;
}) {
  const nights = (t.nights as Night[]) ?? [];
  const reviews = (t.reviewPoints as Array<{ date: string; maxReductionPct: number }>) ?? [];
  const setNight = (i: number, patch: Partial<Night>) => set({ nights: nights.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const [rateText, setRateText] = useState(nights.map((n) => toDecimal(n.rateMinor)));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Block name" required error={e("blockName")} className="sm:col-span-2">
          {(p) => <Input {...p} value={String(t.blockName ?? "")} onChange={(ev) => onLabel(ev.target.value)} />}
        </Field>
        <Field label="Committed pickup (%)" required help="Share of the block you must fill" error={e("commitmentPct")}>
          {(p) => <Input {...p} type="number" step="0.01" min={0} max={100} className="num" value={String(t.commitmentPct ?? "")} onChange={(ev) => set({ commitmentPct: toNum(ev.target.value) })} />}
        </Field>
        <Field label="Measured" required error={e("basis")}>
          {(p) => (
            <Select {...p} value={String(t.basis)} onChange={(ev) => set({ basis: ev.target.value })}>
              <option value="PER_NIGHT">Per night</option>
              <option value="CUMULATIVE">Across all nights (cumulative)</option>
            </Select>
          )}
        </Field>
        <Field label="Damages (% of room rate)" help="Charged per unsold committed room" error={e("damagesPct")}>
          {(p) => <Input {...p} type="number" step="0.01" min={0} max={100} className="num" value={String(t.damagesPct ?? 100)} onChange={(ev) => set({ damagesPct: toNum(ev.target.value) })} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cutoff date" required error={e("cutoffDate")}>
            {(p) => <Input {...p} type="date" value={String(t.cutoffDate ?? "")} onChange={(ev) => set({ cutoffDate: ev.target.value })} />}
          </Field>
          <Field label="Cutoff time" error={e("cutoffTime")}>
            {(p) => <Input {...p} type="time" value={String(t.cutoffTime ?? "17:00")} onChange={(ev) => set({ cutoffTime: ev.target.value })} />}
          </Field>
        </div>
      </div>

      <fieldset>
        <legend className="text-table font-medium">Nights</legend>
        {e("nights") ? <p className="text-meta text-risk">{e("nights")}</p> : null}
        <table className="mt-1 w-full text-table">
          <thead className="text-left text-muted">
            <tr>
              <th scope="col" className="py-1 pr-2 font-medium">Night of</th>
              <th scope="col" className="py-1 pr-2 font-medium">Rooms</th>
              <th scope="col" className="py-1 pr-2 font-medium">Rate ({currency})</th>
              <th scope="col" className="sr-only">Remove</th>
            </tr>
          </thead>
          <tbody>
            {nights.map((n, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Input aria-label={`Night ${i + 1} date`} aria-invalid={Boolean(e(`nights.${i}.date`))} type="date" value={n.date} onChange={(ev) => setNight(i, { date: ev.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label={`Night ${i + 1} rooms`} aria-invalid={Boolean(e(`nights.${i}.rooms`))} type="number" min={0} className="num w-24" value={String(n.rooms)} onChange={(ev) => setNight(i, { rooms: Number(ev.target.value) })} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    aria-label={`Night ${i + 1} rate`}
                    aria-invalid={Boolean(e(`nights.${i}.rateMinor`))}
                    inputMode="decimal"
                    className="num w-32"
                    value={rateText[i] ?? ""}
                    onChange={(ev) => {
                      const next = [...rateText];
                      next[i] = ev.target.value;
                      setRateText(next);
                      setNight(i, { rateMinor: toMinor(ev.target.value) ?? 0 });
                    }}
                  />
                </td>
                <td className="py-1 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove night ${i + 1}`}
                    disabled={nights.length === 1}
                    onClick={() => {
                      set({ nights: nights.filter((_, j) => j !== i) });
                      setRateText(rateText.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const last = nights[nights.length - 1];
            const nextDate = last?.date ? new Date(Date.parse(`${last.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : "";
            set({ nights: [...nights, { date: nextDate, rooms: last?.rooms ?? 0, rateMinor: last?.rateMinor ?? 0 }] });
            setRateText([...rateText, rateText[rateText.length - 1] ?? ""]);
          }}
        >
          <Plus size={14} aria-hidden /> Add night
        </Button>
      </fieldset>

      <fieldset>
        <legend className="text-table font-medium">Block review points</legend>
        <p className="text-meta text-muted">Dates before which the block can be reduced without penalty.</p>
        {reviews.map((r, i) => (
          <div key={i} className="mt-1.5 flex items-end gap-2">
            <Input aria-label={`Review ${i + 1} date`} type="date" value={r.date} onChange={(ev) => set({ reviewPoints: reviews.map((x, j) => (j === i ? { ...x, date: ev.target.value } : x)) })} className="max-w-44" />
            <Input aria-label={`Review ${i + 1} maximum reduction`} type="number" min={0} max={100} className="num w-24" value={String(r.maxReductionPct)} onChange={(ev) => set({ reviewPoints: reviews.map((x, j) => (j === i ? { ...x, maxReductionPct: Number(ev.target.value) } : x)) })} />
            <span className="pb-1.5 text-table text-muted">% max reduction</span>
            <Button size="sm" variant="ghost" aria-label={`Remove review ${i + 1}`} onClick={() => set({ reviewPoints: reviews.filter((_, j) => j !== i) })}>
              <Trash2 size={14} aria-hidden />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => set({ reviewPoints: [...reviews, { date: "", maxReductionPct: 10 }] })}>
          <Plus size={14} aria-hidden /> Add review point
        </Button>
      </fieldset>
    </div>
  );
}

type Tier = { startsOn: string; penaltyPct: number | null; penaltyFixedMinor: number | null };

function CancellationEditor({ t, set, e, currency }: { t: Obj; set: (p: Obj) => void; e: (p: string) => string | undefined; currency: string }) {
  const tiers = (t.tiers as Tier[]) ?? [];
  const fixed = t.basis === "FIXED";
  const setTier = (i: number, patch: Partial<Tier>) => set({ tiers: tiers.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const [fixedText, setFixedText] = useState(tiers.map((x) => toDecimal(x.penaltyFixedMinor)));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Penalty is calculated on" required error={e("basis")}>
          {(p) => (
            <Select {...p} value={String(t.basis)} onChange={(ev) => set({ basis: ev.target.value })}>
              <option value="CONTRACT_VALUE">Contracted value</option>
              <option value="ROOM_REVENUE">Contracted room revenue</option>
              <option value="FB_MINIMUM">F&B minimum</option>
              <option value="FIXED">Fixed amounts per tier</option>
            </Select>
          )}
        </Field>
        <Field label="Deposits already paid" error={e("depositTreatment")}>
          {(p) => (
            <Select {...p} value={String(t.depositTreatment)} onChange={(ev) => set({ depositTreatment: ev.target.value })}>
              <option value="CREDITED">Are credited against the penalty</option>
              <option value="ADDITIONAL">Are forfeited in addition</option>
            </Select>
          )}
        </Field>
      </div>
      <fieldset>
        <legend className="text-table font-medium">Tiers</legend>
        <p className="text-meta text-muted">
          Each tier applies from its date until the next tier starts. Before the first tier there is no penalty. The step date
          belongs to the higher tier.
        </p>
        {e("tiers") ? <p className="text-meta text-risk">{e("tiers")}</p> : null}
        {tiers.map((tier, i) => (
          <div key={i} className="mt-1.5 flex flex-wrap items-end gap-2">
            <div>
              <span className="block text-meta text-muted">From</span>
              <Input aria-label={`Tier ${i + 1} start date`} aria-invalid={Boolean(e(`tiers.${i}.startsOn`))} type="date" value={tier.startsOn} onChange={(ev) => setTier(i, { startsOn: ev.target.value })} className="max-w-44" />
            </div>
            {fixed ? (
              <div>
                <span className="block text-meta text-muted">Penalty ({currency})</span>
                <Input
                  aria-label={`Tier ${i + 1} fixed penalty`}
                  aria-invalid={Boolean(e(`tiers.${i}.penaltyFixedMinor`))}
                  inputMode="decimal"
                  className="num w-36"
                  value={fixedText[i] ?? ""}
                  onChange={(ev) => {
                    const next = [...fixedText];
                    next[i] = ev.target.value;
                    setFixedText(next);
                    setTier(i, { penaltyFixedMinor: toMinor(ev.target.value), penaltyPct: null });
                  }}
                />
              </div>
            ) : (
              <div>
                <span className="block text-meta text-muted">Penalty (%)</span>
                <Input
                  aria-label={`Tier ${i + 1} penalty percentage`}
                  aria-invalid={Boolean(e(`tiers.${i}.penaltyPct`))}
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  className="num w-24"
                  value={tier.penaltyPct === null ? "" : String(tier.penaltyPct)}
                  onChange={(ev) => setTier(i, { penaltyPct: toNum(ev.target.value), penaltyFixedMinor: null })}
                />
              </div>
            )}
            <Button size="sm" variant="ghost" aria-label={`Remove tier ${i + 1}`} disabled={tiers.length === 1} onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })}>
              <Trash2 size={14} aria-hidden />
            </Button>
            {e(`tiers.${i}.startsOn`) || e(`tiers.${i}.penaltyPct`) || e(`tiers.${i}.penaltyFixedMinor`) ? (
              <p className="w-full text-meta text-risk">{e(`tiers.${i}.startsOn`) ?? e(`tiers.${i}.penaltyPct`) ?? e(`tiers.${i}.penaltyFixedMinor`)}</p>
            ) : null}
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            set({ tiers: [...tiers, { startsOn: "", penaltyPct: null, penaltyFixedMinor: null }] });
            setFixedText([...fixedText, ""]);
          }}
        >
          <Plus size={14} aria-hidden /> Add tier
        </Button>
      </fieldset>
    </div>
  );
}
