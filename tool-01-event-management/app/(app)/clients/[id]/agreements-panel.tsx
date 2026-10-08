"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { EmptyState, Panel } from "@/ui/page";
import { formatDate } from "@/ui/format";
import { AgreementEditor, type AgreementDraft } from "./agreement-editor";

type Agreement = {
  id: string;
  name: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  rules: Array<{ category: string; bearer: "CLIENT" | "AGENCY" | "SPLIT"; agencyPct: number }>;
};

const bearerText = (r?: { bearer: string; agencyPct: number }) =>
  !r ? "Unassigned" : r.bearer === "SPLIT" ? `Split ${r.agencyPct}% agency / ${100 - r.agencyPct}% client` : r.bearer === "AGENCY" ? "Agency" : "Client";

export function AgreementsPanel({
  clientId,
  agreements,
  categories,
  categoryLabels,
  canEdit,
  today,
}: {
  clientId: string;
  agreements: Agreement[];
  categories: readonly string[];
  categoryLabels: Record<string, string>;
  canEdit: boolean;
  today: string;
}) {
  const [editing, setEditing] = useState<AgreementDraft | null>(null);

  const draftFrom = (a?: Agreement): AgreementDraft => ({
    id: a?.id ?? null,
    name: a?.name ?? "",
    effectiveFrom: a?.effectiveFrom ?? today,
    effectiveTo: a?.effectiveTo ?? "",
    rules: categories.map((category) => {
      const r = a?.rules.find((x) => x.category === category);
      return { category, bearer: r?.bearer ?? "NONE", agencyPct: r?.agencyPct ?? 0 };
    }),
  });

  return (
    <Panel
      title="Agreements and liability rules"
      description="The agreement in force on an event's start date decides who carries each penalty."
      actions={
        canEdit && !editing ? (
          <Button size="sm" onClick={() => setEditing(draftFrom())}>
            Add agreement
          </Button>
        ) : null
      }
    >
      {editing && !editing.id ? (
        <AgreementEditor clientId={clientId} initial={editing} categoryLabels={categoryLabels} onDone={() => setEditing(null)} />
      ) : null}
      {agreements.length === 0 && !editing ? (
        <EmptyState
          title="No agreement recorded"
          actions={
            canEdit ? (
              <Button variant="primary" onClick={() => setEditing(draftFrom())}>
                Add agreement
              </Button>
            ) : null
          }
        >
          Without an agreement, every penalty for this client shows as unassigned exposure.
        </EmptyState>
      ) : null}
      <ul className="divide-y divide-rule">
        {agreements.map((a) =>
          editing?.id === a.id ? (
            <li key={a.id}>
              <AgreementEditor clientId={clientId} initial={editing} categoryLabels={categoryLabels} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-body font-medium">{a.name}</p>
                  <p className="text-meta text-muted">
                    From {formatDate(a.effectiveFrom)}
                    {a.effectiveTo ? ` to ${formatDate(a.effectiveTo)}` : ", open-ended"}
                  </p>
                </div>
                {canEdit ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(draftFrom(a))}>
                    Edit rules
                  </Button>
                ) : null}
              </div>
              <dl className="mt-2 grid gap-x-6 gap-y-1 text-table sm:grid-cols-2">
                {categories.map((c) => {
                  const r = a.rules.find((x) => x.category === c);
                  return (
                    <div key={c} className="flex justify-between gap-3 border-b border-rule/60 py-1">
                      <dt className="text-muted">{categoryLabels[c]}</dt>
                      <dd className={r ? undefined : "text-muted italic"}>{bearerText(r)}</dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ),
        )}
      </ul>
    </Panel>
  );
}
