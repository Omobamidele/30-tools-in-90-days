"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CLAUSE_TYPES, type ClauseType } from "@/core/clauses/schemas";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { EmptyState, Panel } from "@/ui/page";
import { Status } from "@/ui/status";
import { ClauseEditor, defaultTerms, type ClauseDraft } from "@/ui/clause-editor";
import { useAction } from "@/ui/use-action";
import { addClauseAction, removeClauseAction, updateClauseAction } from "../actions";

export type TermRow = {
  id: string;
  type: ClauseType;
  typeLabel: string;
  label: string;
  status: "PROPOSED" | "CONFIRMED" | "REJECTED";
  terms: Record<string, unknown>;
  summary: Array<[string, string]>;
  lockVersion: number;
  confirmedByName: string | null;
  confirmedAtText: string | null;
};

type EditState = { mode: "add" | "edit"; type: ClauseType; draft: ClauseDraft; clause?: TermRow };

export function TermsPanel({
  contractId,
  terms,
  typeLabels,
  currency,
  editable,
  defaults,
}: {
  contractId: string;
  terms: TermRow[];
  typeLabels: Record<ClauseType, string>;
  currency: string;
  editable: boolean;
  defaults: { commitmentPct: number; damagesPct: number; surchargePct: number };
}) {
  const router = useRouter();
  const add = useAction(addClauseAction);
  const upd = useAction(updateClauseAction);
  const rem = useAction(removeClauseAction);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [removing, setRemoving] = useState<TermRow | null>(null);
  const a = edit?.mode === "edit" ? upd : add;

  const startAdd = (type: ClauseType = "CANCELLATION") => {
    add.reset();
    setEdit({ mode: "add", type, draft: defaultTerms(type, defaults) });
  };

  async function save() {
    if (!edit) return;
    const res =
      edit.mode === "add"
        ? await add.run(contractId, { type: edit.type, label: edit.draft.label, terms: edit.draft.terms })
        : await upd.run(contractId, edit.clause!.id, { label: edit.draft.label, terms: edit.draft.terms }, edit.clause!.lockVersion);
    if (res.ok) {
      setEdit(null);
      router.refresh();
    }
  }

  const visible = terms.filter((t) => t.status !== "REJECTED");
  const grouped = CLAUSE_TYPES.map((type) => ({ type, rows: visible.filter((t) => t.type === type) })).filter((g) => g.rows.length);

  return (
    <Panel
      title="Terms"
      description="Confirmed terms drive deadlines and exposure."
      actions={editable && visible.length ? <Button size="sm" onClick={() => startAdd()}>Add term</Button> : null}
    >
      {visible.length === 0 ? (
        <EmptyState title="No terms entered" actions={editable ? <Button variant="primary" onClick={() => startAdd()}>Add term</Button> : null}>
          Enter the deposits, room block, F&B minimum, cancellation schedule and deadlines from the signed contract.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-rule">
          {grouped.flatMap((g) =>
            g.rows.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-body font-medium">
                      {t.label}
                      {t.label.toLowerCase() !== t.typeLabel.toLowerCase() ? (
                        <span className="font-normal text-muted"> {t.typeLabel}</span>
                      ) : null}
                    </p>
                    {t.status === "PROPOSED" ? (
                      <Status tone="watch">Proposed, needs review</Status>
                    ) : (
                      <p className="text-meta text-muted">
                        Confirmed{t.confirmedByName ? ` by ${t.confirmedByName}` : ""}
                        {t.confirmedAtText ? ` on ${t.confirmedAtText}` : ""}
                      </p>
                    )}
                  </div>
                  {editable ? (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        onClick={() => {
                          upd.reset();
                          setEdit({ mode: "edit", type: t.type, draft: { label: t.label, terms: t.terms }, clause: t });
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(t)}>
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </div>
                <dl className="mt-2 grid gap-x-6 text-table sm:grid-cols-2">
                  {t.summary.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-rule/60 py-1">
                      <dt className="text-muted">{k}</dt>
                      <dd className="num text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            )),
          )}
        </ul>
      )}

      <Dialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.mode === "edit" ? `Edit ${typeLabels[edit.type].toLowerCase()}` : "Add term"}
        description="Enter values exactly as written in the signed contract."
        wide
      >
        {edit ? (
          <div className="flex flex-col gap-4">
            <FormError message={a.error} fieldErrors={a.fieldErrors} />
            {edit.mode === "add" ? (
              <Field label="Term type">
                {(p) => (
                  <Select
                    {...p}
                    value={edit.type}
                    onChange={(e) => {
                      const type = e.target.value as ClauseType;
                      a.reset();
                      setEdit({ mode: "add", type, draft: defaultTerms(type, defaults) });
                    }}
                  >
                    {CLAUSE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {typeLabels[t]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ) : null}
            <ClauseEditor
              key={`${edit.mode}-${edit.type}-${edit.clause?.id ?? "new"}`}
              type={edit.type}
              value={edit.draft}
              onChange={(draft) => setEdit({ ...edit, draft })}
              errors={a.fieldErrors}
              currency={currency}
            />
            <div className="flex gap-2 border-t border-rule pt-3">
              <Button variant="primary" onClick={save} disabled={a.pending}>
                {edit.mode === "edit" ? "Save term" : "Add term"}
              </Button>
              <Button onClick={() => setEdit(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)} title={`Remove “${removing?.label ?? ""}”?`}>
        <div className="flex flex-col gap-3">
          <FormError message={rem.error} />
          <p className="text-body">
            Its open deadlines will be removed and it will no longer count toward exposure. The change is kept in the activity log.
          </p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={rem.pending}
              onClick={async () => {
                const res = await rem.run(contractId, removing!.id);
                if (res.ok) {
                  setRemoving(null);
                  router.refresh();
                }
              }}
            >
              Remove term
            </Button>
            <Button onClick={() => setRemoving(null)}>Keep term</Button>
          </div>
        </div>
      </Dialog>
    </Panel>
  );
}
