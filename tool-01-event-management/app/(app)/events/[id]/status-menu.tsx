"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import type { EventStatus } from "@/services/events";
import { setEventStatusAction } from "../actions";

const destructive: EventStatus[] = ["CANCELLED"];

export function StatusMenu({
  eventId,
  eventName,
  options,
  labels,
}: {
  eventId: string;
  eventName: string;
  options: EventStatus[];
  labels: Record<EventStatus, string>;
}) {
  const router = useRouter();
  const set = useAction(setEventStatusAction);
  const [confirm, setConfirm] = useState<EventStatus | null>(null);

  if (!options.length) return null;

  async function apply(status: EventStatus) {
    const res = await set.run(eventId, status);
    if (res.ok) {
      setConfirm(null);
      router.refresh();
    }
  }

  return (
    <>
      <label className="sr-only" htmlFor="status-change">
        Change status
      </label>
      <select
        id="status-change"
        value=""
        onChange={(e) => {
          const s = e.target.value as EventStatus;
          if (!s) return;
          if (destructive.includes(s)) setConfirm(s);
          else void apply(s);
        }}
        disabled={set.pending}
        className="h-8 rounded-control border border-rule-strong bg-surface px-2 text-body text-ink"
      >
        <option value="">Change status…</option>
        {options.map((s) => (
          <option key={s} value={s}>
            Mark {labels[s].toLowerCase()}
          </option>
        ))}
      </select>
      {set.error && !confirm ? <p className="w-full text-meta text-risk">{set.error}</p> : null}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)} title={`Mark “${eventName}” cancelled?`}>
        <div className="flex flex-col gap-3">
          <FormError message={set.error} />
          <p className="text-body">
            Contracts and deadlines stay in place so cancellation charges can be tracked and reconciled. You can move the event to
            reconciled once charges are settled.
          </p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => apply("CANCELLED")} disabled={set.pending}>
              Mark cancelled
            </Button>
            <Button onClick={() => setConfirm(null)}>Keep event</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
