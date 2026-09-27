"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "@/ui/icons";
import { parseMoney, formatMoney } from "@/core/money";
import { suggestPrice, type PricingRules } from "@/core/pricing/price";
import type { ChangeImpact } from "@/services/changes";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { Panel } from "@/ui/page";
import { useAction } from "@/ui/use-action";
import { ImpactPanel } from "./impact-panel";
import { previewImpactAction, saveChangeAction } from "./actions";

type Line = { contractId: string; category: string; description: string; costDelta: string; priceDelta: string };
export type ChangeFormValues = {
  title: string;
  type: string;
  reason: string;
  attendanceDelta: string;
  requestedByType: "INTERNAL" | "CLIENT";
  lines: Line[];
};

export function ChangeEditor({
  eventId,
  changeId,
  lockVersion,
  initial,
  types,
  categories,
  contracts,
  pricing,
  currency,
  forecastAttendance,
}: {
  eventId: string;
  changeId: string | null;
  lockVersion: number;
  initial: ChangeFormValues;
  types: Array<{ value: string; label: string }>;
  categories: string[];
  contracts: Array<{ id: string; label: string }>;
  pricing: PricingRules;
  currency: string;
  forecastAttendance: number;
}) {
  const router = useRouter();
  const save = useAction(saveChangeAction);
  const preview = useAction(previewImpactAction);
  const [v, setV] = useState(initial);
  const [impact, setImpact] = useState<ChangeImpact | null>(null);
  const seq = useRef(0);

  const payload = { ...v, attendanceDelta: v.attendanceDelta === "" ? 0 : Number(v.attendanceDelta) };

  // Live impact: recalculated on the server shortly after each edit.
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const complete = v.lines.every((l) => l.category && l.description && parseMoney(l.costDelta) !== null);
      if (!complete && v.lines.length) return;
      const res = await previewImpactAction(eventId, { ...v, title: v.title || "Draft", attendanceDelta: v.attendanceDelta === "" ? 0 : Number(v.attendanceDelta) });
      if (n === seq.current && res.ok) setImpact(res.data);
    }, 400);
    return () => clearTimeout(t);
  }, [v, eventId]);

  const setLine = (i: number, patch: Partial<Line>) => setV({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const suggested = (l: Line) => {
    const cost = parseMoney(l.costDelta);
    return cost === null ? null : suggestPrice(pricing, l.category, cost);
  };

  async function onSave() {
    const res = await save.run(eventId, changeId, payload, lockVersion);
    if (res.ok) {
      router.push(`/changes/${res.data.id}`);
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel title={changeId ? "Edit draft" : "New change request"}>
        <div className="flex flex-col gap-4 p-4">
          <FormError message={save.error} fieldErrors={save.fieldErrors} />
          <Field label="Title" required error={save.fe("title")}>
            {(p) => <Input {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Headcount reduction" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type" error={save.fe("type")}>
              {(p) => (
                <Select {...p} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
                  {types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Attendance change" help={`Forecast now ${forecastAttendance}`} error={save.fe("attendanceDelta")}>
              {(p) => <Input {...p} type="number" className="num" value={v.attendanceDelta} onChange={(e) => setV({ ...v, attendanceDelta: e.target.value })} placeholder="e.g. -60" />}
            </Field>
            <Field label="Requested by">
              {(p) => (
                <Select {...p} value={v.requestedByType} onChange={(e) => setV({ ...v, requestedByType: e.target.value as "INTERNAL" | "CLIENT" })}>
                  <option value="CLIENT">The client</option>
                  <option value="INTERNAL">Our team</option>
                </Select>
              )}
            </Field>
          </div>
          <Field label="Reason" error={save.fe("reason")}>
            {(p) => <Textarea {...p} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="What changed and why" />}
          </Field>

          <fieldset>
            <legend className="text-table font-medium">Cost lines</legend>
            <p className="text-meta text-muted">Use negative amounts for reductions. Leave the price empty to use the suggested price from your markup rules.</p>
            <div className="mt-2 flex flex-col gap-2">
              {v.lines.map((l, i) => {
                const s = suggested(l);
                return (
                  <div key={i} className="grid gap-2 rounded-control border border-rule p-2.5 sm:grid-cols-[1.2fr_1fr_auto]">
                    <Input aria-label={`Line ${i + 1} description`} aria-invalid={Boolean(save.fe(`lines.${i}.description`))} placeholder="Description, e.g. Lunch covers −60 × 3 days" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className="sm:col-span-2" />
                    <Button size="sm" variant="ghost" className="order-last justify-self-end sm:order-none sm:justify-self-auto" aria-label={`Remove line ${i + 1}`} onClick={() => setV({ ...v, lines: v.lines.filter((_, j) => j !== i) })}>
                      <Trash2 size={14} aria-hidden />
                      <span className="sm:hidden">Remove line</span>
                    </Button>
                    <Select aria-label={`Line ${i + 1} contract`} value={l.contractId} onChange={(e) => setLine(i, { contractId: e.target.value })}>
                      <option value="">No specific contract</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                    <Select aria-label={`Line ${i + 1} category`} value={l.category} onChange={(e) => setLine(i, { category: e.target.value })}>
                      {categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                    <span className="hidden sm:block" />
                    <label className="text-meta text-muted">
                      Cost change ({currency})
                      <Input aria-invalid={Boolean(save.fe(`lines.${i}.costDelta`))} inputMode="decimal" className="num" value={l.costDelta} onChange={(e) => setLine(i, { costDelta: e.target.value })} placeholder="-10,800.00" />
                    </label>
                    <label className="text-meta text-muted">
                      Client price change
                      <Input inputMode="decimal" className="num" value={l.priceDelta} onChange={(e) => setLine(i, { priceDelta: e.target.value })} placeholder={s !== null ? formatMoney(s, currency, { withCode: false }) : "Suggested"} />
                    </label>
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="ghost" onClick={() => setV({ ...v, lines: [...v.lines, { contractId: "", category: categories[0], description: "", costDelta: "", priceDelta: "" }] })}>
                  <Plus size={14} aria-hidden /> Add line
                </Button>
              </div>
            </div>
          </fieldset>

          <div className="flex gap-2 border-t border-rule pt-3">
            <Button variant="primary" onClick={onSave} disabled={save.pending}>
              {changeId ? "Save draft" : "Create draft"}
            </Button>
            <Button onClick={() => router.back()}>Cancel</Button>
          </div>
        </div>
      </Panel>
      <div className="lg:sticky lg:top-16 lg:self-start">
        <Panel>
          <div className="p-4">
            {impact ? (
              <ImpactPanel impact={impact} currency={currency} />
            ) : (
              <p className="text-table text-muted">{preview.pending ? "Calculating impact…" : "Impact appears as you enter the change."}</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
