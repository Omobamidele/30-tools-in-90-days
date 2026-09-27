"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { saveAgreementAction } from "../actions";

type Bearer = "CLIENT" | "AGENCY" | "SPLIT" | "NONE";
type Rule = { category: string; bearer: Bearer; agencyPct: number };

export type AgreementDraft = {
  id: string | null;
  name: string;
  effectiveFrom: string;
  effectiveTo: string;
  rules: Rule[];
};

const bearerLabels: Record<Bearer, string> = {
  CLIENT: "Client",
  AGENCY: "Agency",
  SPLIT: "Split",
  NONE: "Not covered (unassigned)",
};

// Liability matrix: one row per penalty category, bearer + agency share (docs/04 §5.10).
export function AgreementEditor({
  clientId,
  initial,
  categoryLabels,
  onDone,
}: {
  clientId: string;
  initial: AgreementDraft;
  categoryLabels: Record<string, string>;
  onDone: () => void;
}) {
  const router = useRouter();
  const save = useAction(saveAgreementAction);
  const [draft, setDraft] = useState(initial);

  const setRule = (category: string, patch: Partial<Rule>) =>
    setDraft((d) => ({ ...d, rules: d.rules.map((r) => (r.category === category ? { ...r, ...patch } : r)) }));

  async function submit() {
    const res = await save.run(clientId, draft.id, {
      name: draft.name,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo,
      rules: draft.rules,
    });
    if (res.ok) {
      router.refresh();
      onDone();
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <FormError message={save.error} fieldErrors={save.fieldErrors} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Agreement name" required error={save.fe("name")} className="sm:col-span-3">
          {(p) => <Input {...p} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </Field>
        <Field label="Effective from" required error={save.fe("effectiveFrom")}>
          {(p) => (
            <Input {...p} type="date" value={draft.effectiveFrom} onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
          )}
        </Field>
        <Field label="Effective to" help="Leave empty if open-ended" error={save.fe("effectiveTo")}>
          {(p) => (
            <Input {...p} type="date" value={draft.effectiveTo} onChange={(e) => setDraft({ ...draft, effectiveTo: e.target.value })} />
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-table font-medium">Who carries each penalty</legend>
        <div className="overflow-hidden rounded-control border border-rule">
          <table className="w-full text-table">
            <thead className="bg-sunken text-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Penalty</th>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Carried by</th>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Agency share</th>
              </tr>
            </thead>
            <tbody>
              {draft.rules.map((r, i) => (
                <tr key={r.category} className="border-t border-rule">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {categoryLabels[r.category]}
                  </th>
                  <td className="px-3 py-1.5">
                    <Select
                      aria-label={`Who carries ${categoryLabels[r.category]}`}
                      value={r.bearer}
                      onChange={(e) => setRule(r.category, { bearer: e.target.value as Bearer, agencyPct: e.target.value === "SPLIT" ? 50 : 0 })}
                      className="max-w-56"
                    >
                      {(Object.keys(bearerLabels) as Bearer[]).map((b) => (
                        <option key={b} value={b}>
                          {bearerLabels[b]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    {r.bearer === "SPLIT" ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          aria-label={`Agency share of ${categoryLabels[r.category]}`}
                          aria-invalid={Boolean(save.fe(`rules.${i}.agencyPct`))}
                          type="number"
                          min={1}
                          max={99}
                          value={r.agencyPct}
                          onChange={(e) => setRule(r.category, { agencyPct: Number(e.target.value) })}
                          className="num w-20"
                        />
                        <span className="text-muted">% agency, {100 - r.agencyPct}% client</span>
                      </div>
                    ) : (
                      <span className="text-muted">{r.bearer === "AGENCY" ? "100%" : r.bearer === "CLIENT" ? "0%" : "–"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-meta text-muted">
          Penalties marked &ldquo;not covered&rdquo; appear as unassigned exposure until the agreement says who pays.
        </p>
      </fieldset>

      <div className="flex gap-2">
        <Button variant="primary" onClick={submit} disabled={save.pending}>
          {draft.id ? "Save agreement" : "Add agreement"}
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}
