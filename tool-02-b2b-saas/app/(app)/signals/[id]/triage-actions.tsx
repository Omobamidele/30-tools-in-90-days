"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleType } from "@/config/schema";
import { addDays } from "@/core/dates";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { RuleTag } from "@/ui/bits";
import { cx } from "@/ui/cx";
import { acceptAction, dismissAction, reassignAction, snoozeAction } from "../actions";

type Props = {
  signal: { id: string; lockVersion: number; status: string };
  canTriage: boolean;
  canReassign: boolean;
  accountName: string;
  routeTo: string;
  contacts: Array<{ id: string; label: string }>;
  otherOpen: Array<{ id: string; label: string; type: RuleType }>;
  openCsql: { id: string; label: string } | null;
  dismissReasons: string[];
  cooldownDays: number;
  materialPct: number;
  today: string;
  people: Array<{ id: string; name: string }>;
  csqlTerm: string;
};

type Mode = "accept" | "dismiss" | "snooze" | "reassign";
type Errors = Record<string, string>;

export function TriageActions(p: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("accept");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Errors>({});
  const [also, setAlso] = useState<string[]>(p.otherOpen.map((o) => o.id));

  if (!p.canTriage && !p.canReassign) {
    return (
      <section className="panel p-4 text-table text-muted">
        Only the account&apos;s CSM, the person it&apos;s assigned to, or a CS leader can triage this signal.
      </section>
    );
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string; fieldErrors: Errors } ; data?: unknown }>, after?: (data: unknown) => void) =>
    start(async () => {
      setError(null);
      setFields({});
      const res = await fn();
      if (!res.ok) {
        setError(res.error!.message);
        setFields(res.error!.fieldErrors);
        return;
      }
      after?.(res.data);
      router.refresh();
    });

  const modes: Array<{ key: Mode; label: string }> = [
    ...(p.canTriage ? ([{ key: "accept", label: "Accept" }, { key: "dismiss", label: "Dismiss" }, { key: "snooze", label: "Snooze" }] as const) : []),
    ...(p.canReassign ? ([{ key: "reassign", label: "Reassign" }] as const) : []),
  ];
  const current = modes.some((m) => m.key === mode) ? mode : modes[0].key;

  return (
    <section className="panel" aria-labelledby="triage-title">
      <div className="border-b border-rule px-4 pt-3">
        <h2 id="triage-title" className="text-section font-semibold">
          Triage
        </h2>
        <div role="tablist" aria-label="Triage action" className="mt-2 flex gap-1">
          {modes.map((m) => (
            <button
              key={m.key}
              role="tab"
              type="button"
              aria-selected={current === m.key}
              onClick={() => {
                setMode(m.key);
                setError(null);
                setFields({});
              }}
              className={cx("-mb-px border-b-2 px-3 py-2 text-table", current === m.key ? "border-brand font-medium text-text" : "border-transparent text-muted hover:text-text")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="mx-4 mt-3 rounded-control border border-risk/30 bg-risk-bg px-3 py-2 text-table text-risk">
          {error}
        </p>
      ) : null}

      {current === "accept" ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                acceptAction(p.signal.id, p.signal.lockVersion, {
                  handoffNote: String(f.get("handoffNote") ?? ""),
                  contactId: String(f.get("contactId") ?? ""),
                  adjustedValue: String(f.get("adjustedValue") ?? ""),
                  alsoSignalIds: also,
                  mode: p.openCsql ? (String(f.get("mode")) as "new" | "existing") : "new",
                  separateReason: String(f.get("separateReason") ?? ""),
                }) as never,
              (d) => router.push(`/csqls/${(d as { csqlId: string }).csqlId}`),
            );
          }}
        >
          <p className="text-table text-muted">
            Goes to <span className="font-medium text-text">{p.openCsql ? `${p.openCsql.label} (already open)` : p.routeTo}</span> with your note
            {p.openCsql ? "" : ", due in 1 business day"}.
          </p>
          <Field label="Handoff note for the seller" required error={fields.handoffNote} help="What you know that the numbers don't: who's asking, timing, budget.">
            {(a) => <Textarea {...a} name="handoffNote" rows={4} />}
          </Field>
          {p.contacts.length ? (
            <Field label="Best contact" error={fields.contactId}>
              {(a) => (
                <Select {...a} name="contactId" defaultValue="">
                  <option value="">Not sure yet</option>
                  {p.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field label="Adjust the estimate" error={fields.adjustedValue} help="Optional. The rule's estimate is kept alongside yours.">
            {(a) => <Input {...a} name="adjustedValue" inputMode="decimal" placeholder="e.g. 12,000" />}
          </Field>
          {p.otherOpen.length ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-table font-medium">Include other open signals on {p.accountName}</legend>
              {p.otherOpen.map((o) => (
                <label key={o.id} className="flex items-start gap-2 text-table">
                  <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={also.includes(o.id)} onChange={(e) => setAlso(e.target.checked ? [...also, o.id] : also.filter((x) => x !== o.id))} />
                  <span>
                    <RuleTag type={o.type} /> <span className="block text-muted">{o.label}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          {p.openCsql ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-table font-medium">Open {p.csqlTerm} on this account</legend>
              <label className="flex items-center gap-2 text-table">
                <input type="radio" name="mode" value="existing" defaultChecked className="size-4 accent-[var(--brand)]" /> Add to {p.openCsql.label}
              </label>
              <label className="flex items-center gap-2 text-table">
                <input type="radio" name="mode" value="new" className="size-4 accent-[var(--brand)]" /> Create a separate {p.csqlTerm}
              </label>
              <Field label="Why separate?" error={fields.separateReason}>
                {(a) => <Input {...a} name="separateReason" placeholder="Only needed for a separate one" />}
              </Field>
            </fieldset>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Sending…" : p.openCsql ? `Add to ${p.openCsql.label}` : `Accept and route`}
          </Button>
        </form>
      ) : null}

      {current === "dismiss" ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => dismissAction(p.signal.id, p.signal.lockVersion, { reason: String(f.get("reason") ?? ""), note: String(f.get("note") ?? "") }) as never, () => router.push("/signals"));
          }}
        >
          <Field label="Reason" required error={fields.reason}>
            {(a) => (
              <Select {...a} name="reason" defaultValue="">
                <option value="" disabled>
                  Choose a reason
                </option>
                {p.dismissReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
                <option value="Other">Other</option>
              </Select>
            )}
          </Field>
          <Field label="Note" error={fields.note} help="Required for Other. RevOps reads these when tuning rules.">
            {(a) => <Textarea {...a} name="note" rows={3} />}
          </Field>
          <p className="text-meta text-muted">
            This rule won&apos;t fire again for {p.accountName} for {p.cooldownDays} days, unless the estimate grows by more than {p.materialPct}%.
          </p>
          <Button type="submit" disabled={pending}>
            {pending ? "Dismissing…" : "Dismiss signal"}
          </Button>
        </form>
      ) : null}

      {current === "snooze" ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => snoozeAction(p.signal.id, p.signal.lockVersion, { until: String(f.get("until") ?? "") }) as never, () => router.push("/signals"));
          }}
        >
          <Field label="Back in the queue on" required error={fields.until} help="For example, when their budget cycle opens.">
            {(a) => <Input {...a} type="date" name="until" min={addDays(p.today, 1)} defaultValue={addDays(p.today, 14)} />}
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Snoozing…" : "Snooze"}
          </Button>
        </form>
      ) : null}

      {current === "reassign" ? (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => reassignAction(p.signal.id, p.signal.lockVersion, { assigneeId: String(f.get("assigneeId") ?? ""), reason: String(f.get("reason") ?? "") }) as never);
          }}
        >
          <Field label="Assign to" required error={fields.assigneeId}>
            {(a) => (
              <Select {...a} name="assigneeId" defaultValue="">
                <option value="" disabled>
                  Choose a person
                </option>
                {p.people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Why" required error={fields.reason}>
            {(a) => <Input {...a} name="reason" placeholder="e.g. Holiday cover" />}
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Reassign"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
