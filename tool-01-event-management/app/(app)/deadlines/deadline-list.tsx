"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { Money } from "@/ui/money";
import { Status } from "@/ui/status";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";
import { markDoneAction, recordPaymentAction, reopenAction, waiveAction } from "./actions";

export type DeadlineItem = {
  id: string;
  kind: string;
  kindLabel: string;
  label: string;
  dueText: string; // supplier-local, with tz abbreviation
  dueOrgText: string; // organisation time, shown on hover
  relative: string;
  days: number;
  overdue: boolean;
  amountMinor: number | null;
  paidMinor: number;
  currency: string | null;
  status: string;
  eventId: string;
  eventName: string;
  contractId: string;
  supplierName: string;
  ownerName: string | null;
  canEdit: boolean;
  canPay: boolean;
};

type Group = { key: string; label: string; items: DeadlineItem[] };

function group(items: DeadlineItem[]): Group[] {
  const g: Group[] = [
    { key: "overdue", label: "Overdue", items: [] },
    { key: "today", label: "Today", items: [] },
    { key: "week", label: "Next 7 days", items: [] },
    { key: "month", label: "Next 30 days", items: [] },
    { key: "later", label: "Later", items: [] },
    { key: "closed", label: "Closed", items: [] },
  ];
  for (const i of items) {
    if (i.status !== "OPEN") g[5].items.push(i);
    else if (i.overdue) g[0].items.push(i);
    else if (i.days === 0) g[1].items.push(i);
    else if (i.days <= 7) g[2].items.push(i);
    else if (i.days <= 30) g[3].items.push(i);
    else g[4].items.push(i);
  }
  return g.filter((x) => x.items.length);
}

export function DeadlineList({ items, showEvent }: { items: DeadlineItem[]; showEvent: boolean }) {
  const router = useRouter();
  const done = useAction(markDoneAction);
  const reopen = useAction(reopenAction);
  const [paying, setPaying] = useState<DeadlineItem | null>(null);
  const [waiving, setWaiving] = useState<DeadlineItem | null>(null);

  const groups = group(items);
  const error = done.error ?? reopen.error;

  return (
    <div>
      {error ? (
        <div className="p-3">
          <FormError message={error} />
        </div>
      ) : null}
      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`g-${g.key}`}>
          <h3
            id={`g-${g.key}`}
            className={cx(
              "sticky top-16 z-[1] border-b border-rule bg-sunken px-4 py-1.5 text-table font-medium",
              g.key === "overdue" ? "text-risk" : "text-muted",
            )}
          >
            {g.label} <span className="num font-normal">{g.items.length}</span>
          </h3>
          <ul className="divide-y divide-rule">
            {g.items.map((i) => (
              <li key={i.id} className="grid grid-cols-1 gap-2 px-4 py-2.5 md:grid-cols-[180px_minmax(0,1fr)_160px_auto] md:items-center md:gap-4">
                <div className="text-table">
                  <span className="num block" title={`Your time: ${i.dueOrgText}`}>
                    {i.dueText}
                  </span>
                  {i.status === "OPEN" ? (
                    <Status tone={i.overdue ? "risk" : i.days <= 7 ? "watch" : "muted"}>{i.relative}</Status>
                  ) : (
                    <Status tone="settled">{i.status === "WAIVED" ? "Waived" : "Done"}</Status>
                  )}
                </div>
                <div className="min-w-0 text-table">
                  <p className="font-medium">
                    {i.label} <span className="font-normal text-muted">{i.kindLabel}</span>
                  </p>
                  <p className="truncate text-muted">
                    <Link href={`/contracts/${i.contractId}`} className="hover:underline">
                      {i.supplierName}
                    </Link>
                    {showEvent ? (
                      <>
                        {" · "}
                        <Link href={`/events/${i.eventId}`} className="hover:underline">
                          {i.eventName}
                        </Link>
                      </>
                    ) : null}
                    {i.ownerName ? ` · ${i.ownerName}` : ""}
                  </p>
                </div>
                <div className="text-table md:text-right">
                  {i.amountMinor !== null && i.currency ? (
                    <>
                      <Money minor={i.amountMinor} currency={i.currency} />
                      {i.paidMinor > 0 ? (
                        <span className="block text-meta text-muted">
                          Paid <Money minor={i.paidMinor} currency={i.currency} />
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 md:justify-end">
                  {i.status === "OPEN" && i.kind === "PAYMENT" && i.canPay ? (
                    <Button size="sm" onClick={() => setPaying(i)}>
                      Record payment
                    </Button>
                  ) : null}
                  {i.status === "OPEN" && i.canEdit && i.kind !== "TIER_CHANGE" ? (
                    <>
                      <Button size="sm" disabled={done.pending} onClick={async () => (await done.run(i.id)).ok && router.refresh()}>
                        Mark done
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setWaiving(i)}>
                        Waive
                      </Button>
                    </>
                  ) : null}
                  {i.status === "OPEN" && i.kind === "TIER_CHANGE" ? (
                    <span className="text-meta text-muted">Takes effect automatically</span>
                  ) : null}
                  {i.status !== "OPEN" && i.canEdit ? (
                    <Button size="sm" variant="ghost" disabled={reopen.pending} onClick={async () => (await reopen.run(i.id)).ok && router.refresh()}>
                      Reopen
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {paying ? <PaymentDialog item={paying} onClose={() => setPaying(null)} /> : null}
      {waiving ? <WaiveDialog item={waiving} onClose={() => setWaiving(null)} /> : null}
    </div>
  );
}

export function PaymentDialog({ item, onClose }: { item: DeadlineItem; onClose: () => void }) {
  const router = useRouter();
  const pay = useAction(recordPaymentAction);
  const remaining = item.amountMinor !== null ? Math.max(0, item.amountMinor - item.paidMinor) : null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await pay.run(item.id, Object.fromEntries(new FormData(e.currentTarget)));
    if (res.ok) {
      onClose();
      router.refresh();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Record payment" description={`${item.label}: ${item.supplierName}`}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <FormError message={pay.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Amount (${item.currency ?? ""})`} required error={pay.fe("amount")}>
            {(p) => (
              <Input {...p} name="amount" inputMode="decimal" className="num" defaultValue={remaining !== null ? (remaining / 100).toFixed(2) : ""} autoFocus />
            )}
          </Field>
          <Field label="Paid on" required error={pay.fe("paidAt")}>
            {(p) => <Input {...p} name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />}
          </Field>
        </div>
        <Field label="Reference" help="Payment or invoice reference" error={pay.fe("reference")}>
          {(p) => <Input {...p} name="reference" />}
        </Field>
        <p className="text-meta text-muted">The deadline closes automatically once the full amount is paid.</p>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={pay.pending}>
            Record payment
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function WaiveDialog({ item, onClose }: { item: DeadlineItem; onClose: () => void }) {
  const router = useRouter();
  const waive = useAction(waiveAction);
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Waive deadline" description={`${item.label}: ${item.supplierName}`}>
      <div className="flex flex-col gap-3">
        <FormError message={waive.error} />
        <Field label="Why doesn't this deadline apply?" required error={waive.fe("reason")}>
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
        </Field>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={waive.pending}
            onClick={async () => {
              const res = await waive.run(item.id, reason);
              if (res.ok) {
                onClose();
                router.refresh();
              }
            }}
          >
            Waive deadline
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}
