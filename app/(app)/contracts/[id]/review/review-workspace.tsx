"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleHelp } from "@/ui/icons";
import type { ClauseType } from "@/core/clauses/schemas";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form-error";
import { ClauseEditor, type ClauseDraft } from "@/ui/clause-editor";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";
import { activateContractAction, confirmClauseAction, removeClauseAction, updateClauseAction } from "../../actions";

export type ReviewItem = {
  id: string;
  type: ClauseType;
  typeLabel: string;
  label: string;
  terms: Record<string, unknown>;
  summary: Array<[string, string]>;
  sources: Array<{ field: string; quote: string; page: number; verified: boolean }>;
  problems: string[];
  lockVersion: number;
};

export function ReviewWorkspace({
  contractId,
  docId,
  items,
  confirmedCount,
  currency,
}: {
  contractId: string;
  docId: string;
  items: ReviewItem[];
  confirmedCount: number;
  currency: string;
}) {
  const router = useRouter();
  const confirm = useAction(confirmClauseAction);
  const reject = useAction(removeClauseAction);
  const save = useAction(updateClauseAction);
  const activate = useAction(activateContractAction);
  const [page, setPage] = useState(items[0]?.sources[0]?.page ?? 1);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState<{ id: string; draft: ClauseDraft } | null>(null);
  const cards = useRef<Array<HTMLElement | null>>([]);
  const error = confirm.error ?? reject.error ?? save.error ?? activate.error;

  const focusCard = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(items.length - 1, i));
      setActive(idx);
      cards.current[idx]?.focus();
      const p = items[idx]?.sources[0]?.page;
      if (p) setPage(p);
    },
    [items],
  );

  const doConfirm = useCallback(
    async (item: ReviewItem) => {
      if (item.problems.length) {
        setEditing({ id: item.id, draft: { label: item.label, terms: item.terms } });
        return;
      }
      if ((await confirm.run(contractId, item.id)).ok) router.refresh();
    },
    [confirm, contractId, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const item = items[active];
      if (e.key === "j") focusCard(active + 1);
      else if (e.key === "k") focusCard(active - 1);
      else if (!item) return;
      else if (e.key === "c") void doConfirm(item);
      else if (e.key === "e") setEditing({ id: item.id, draft: { label: item.label, terms: item.terms } });
      else if (e.key === "x") void reject.run(contractId, item.id).then((r) => r.ok && router.refresh());
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, contractId, doConfirm, editing, focusCard, items, reject, router]);

  const total = items.length + confirmedCount;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 panel px-4 py-2.5">
        <p className="text-table">
          <span className="num font-medium">{confirmedCount} of {total}</span> confirmed.{" "}
          {items.length ? (
            <span className="text-muted">
              Keys: <kbd className="rounded border border-rule px-1">c</kbd> confirm · <kbd className="rounded border border-rule px-1">e</kbd> edit ·{" "}
              <kbd className="rounded border border-rule px-1">x</kbd> reject · <kbd className="rounded border border-rule px-1">j</kbd>/
              <kbd className="rounded border border-rule px-1">k</kbd> next/previous
            </span>
          ) : (
            <span className="text-settled">Every proposed term is resolved.</span>
          )}
        </p>
        <Button
          variant="primary"
          disabled={items.length > 0 || confirmedCount === 0 || activate.pending}
          title={items.length ? `${items.length} term${items.length === 1 ? "" : "s"} still to review` : undefined}
          onClick={async () => {
            if ((await activate.run(contractId)).ok) router.push(`/contracts/${contractId}`);
          }}
        >
          Activate contract
        </Button>
      </div>
      <FormError message={error} />

      <div className="grid grid-cols-1 gap-3 lg:h-[calc(100dvh-230px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="hidden min-h-0 overflow-hidden rounded-panel border border-rule bg-sunken lg:block">
          <iframe key={page} title={`Contract document, page ${page}`} src={`/api/files/${docId}#page=${page}&view=FitH`} className="h-full w-full" />
        </div>
        <ol className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1" aria-label="Proposed terms">
          {items.map((item, i) => (
            <li
              key={item.id}
              ref={(el) => {
                cards.current[i] = el;
              }}
              tabIndex={0}
              onFocus={() => setActive(i)}
              className={cx(
                "rounded-panel border bg-surface outline-none",
                i === active ? "border-brand ring-1 ring-brand" : "border-rule",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-rule px-4 py-2.5">
                <div>
                  <p className="text-body font-medium">
                    {item.label} <span className="font-normal text-muted">{item.typeLabel}</span>
                  </p>
                  {item.problems.length ? <p className="text-meta text-watch">Needs a correction before it can be confirmed</p> : null}
                </div>
                {editing?.id !== item.id ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="primary" onClick={() => doConfirm(item)} disabled={confirm.pending}>
                      Confirm
                    </Button>
                    <Button size="sm" onClick={() => setEditing({ id: item.id, draft: { label: item.label, terms: item.terms } })}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => (await reject.run(contractId, item.id)).ok && router.refresh()}>
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>

              {editing?.id === item.id ? (
                <div className="flex flex-col gap-3 p-4">
                  <FormError message={save.error} fieldErrors={save.fieldErrors} />
                  <ClauseEditor type={item.type} value={editing.draft} onChange={(draft) => setEditing({ id: item.id, draft })} errors={save.fieldErrors} currency={currency} />
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      disabled={save.pending}
                      onClick={async () => {
                        const r = await save.run(contractId, item.id, { label: editing.draft.label, terms: editing.draft.terms }, item.lockVersion);
                        if (r.ok) {
                          setEditing(null);
                          router.refresh();
                        }
                      }}
                    >
                      Confirm with changes
                    </Button>
                    <Button onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 p-4">
                  {item.problems.length ? (
                    <ul className="list-disc rounded-control bg-watch-bg py-1.5 pr-3 pl-7 text-table text-watch">
                      {item.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  <dl className="grid gap-x-6 text-table sm:grid-cols-2">
                    {item.summary.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3 border-b border-rule/60 py-1">
                        <dt className="text-muted">{k}</dt>
                        <dd className="num text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <div>
                    <p className="mb-1 text-meta font-medium text-muted">Source in the document</p>
                    {item.sources.length === 0 ? (
                      <p className="text-table text-watch">No source text: verify manually against the document.</p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {item.sources.map((s) => (
                          <li key={s.field} className="text-table">
                            <button type="button" onClick={() => setPage(s.page)} className="text-left hover:underline">
                              <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
                                {s.verified ? (
                                  <CircleCheck size={14} className="text-settled" aria-label="Found in the document" />
                                ) : (
                                  <CircleHelp size={14} className="text-watch" aria-label="Not found in the document text" />
                                )}
                                <span className="text-meta text-muted">
                                  {s.field} · p.{s.page}
                                </span>
                              </span>
                              <q className="text-ink">{s.quote}</q>
                            </button>
                            {!s.verified ? <span className="block text-meta text-watch">Wording not found in the document text: verify manually.</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
