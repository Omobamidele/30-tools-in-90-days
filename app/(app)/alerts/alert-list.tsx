"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { Status } from "@/ui/status";
import { useAction } from "@/ui/use-action";
import { decideAlertAction } from "./actions";

export type AlertItem = {
  id: string;
  severity: "HIGH" | "WATCH" | "INFO";
  title: string;
  ruleLabel: string;
  eventId: string;
  eventName: string;
  openedText: string;
  currency: string;
  suggestedReduction: string | null;
  /** Rooms the alert is about (savings alerts), so a release decision can record them. */
  roomNightsAbout: boolean;
  suggestedRoomNights: number | null;
  canDecide: boolean;
};

const decisionOptions = [
  { value: "RELEASED_INVENTORY", label: "Released inventory (rooms or space)", reduces: true },
  { value: "RENEGOTIATED", label: "Renegotiated with the supplier", reduces: true },
  { value: "CLIENT_INFORMED", label: "Informed the client", reduces: false },
  { value: "ACCEPTED_RISK", label: "Accepted the risk", reduces: false },
  { value: "OTHER", label: "Other", reduces: false },
];

export function AlertList({ alerts, showEvent, limit }: { alerts: AlertItem[]; showEvent: boolean; limit?: number }) {
  const [deciding, setDeciding] = useState<AlertItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const shown = limit && !expanded ? alerts.slice(0, limit) : alerts;
  if (!alerts.length) return <p className="px-4 py-5 text-center text-table text-muted">No open alerts.</p>;
  return (
    <>
      <ul className="divide-y divide-rule">
        {shown.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2.5 px-5 py-3.5 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0 text-table">
              <Status plain tone={a.severity === "HIGH" ? "risk" : "watch"}>{a.ruleLabel}</Status>
              <p className="mt-1 text-ink">{a.title}</p>
              <p className="mt-0.5 text-meta text-faint">
                {showEvent ? (
                  <>
                    <Link href={`/events/${a.eventId}`} className="hover:underline">
                      {a.eventName}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                Opened {a.openedText}
              </p>
            </div>
            {a.canDecide ? (
              <Button size="sm" className="shrink-0" onClick={() => setDeciding(a)}>
                Decide
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {limit && alerts.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="w-full border-t border-rule px-5 py-2.5 text-left text-table font-medium text-brand hover:bg-sunken"
        >
          {expanded ? "Show fewer" : `Show all ${alerts.length} alerts`}
        </button>
      ) : null}
      {deciding ? <DecideDialog alert={deciding} onClose={() => setDeciding(null)} /> : null}
    </>
  );
}

function DecideDialog({ alert, onClose }: { alert: AlertItem; onClose: () => void }) {
  const router = useRouter();
  const decide = useAction(decideAlertAction);
  const [type, setType] = useState("RELEASED_INVENTORY");
  const reduces = decisionOptions.find((o) => o.value === type)?.reduces;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values: Record<string, unknown> = { ...Object.fromEntries(new FormData(e.currentTarget)), type };
    if (!reduces) values.exposureReduction = "";
    const res = await decide.run(alert.id, values);
    if (res.ok) {
      onClose();
      router.refresh();
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Record a decision" description={alert.title} wide>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <FormError message={decide.error} />
        <fieldset>
          <legend className="mb-1.5 text-table font-medium">What did you decide?</legend>
          <div className="flex flex-col gap-1.5">
            {decisionOptions.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-body">
                <input type="radio" name="decision" value={o.value} checked={type === o.value} onChange={() => setType(o.value)} className="size-4 accent-[var(--brand)]" />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        {reduces ? (
          <Field
            label={`Exposure removed (${alert.currency})`}
            help="Optional. Counts in Money protected and the penalties report. Pre-filled with what the system worked out; change it to what actually happened."
            error={decide.fe("exposureReduction")}
          >
            {(p) => <Input {...p} name="exposureReduction" inputMode="decimal" className="num max-w-48" defaultValue={alert.suggestedReduction ?? ""} />}
          </Field>
        ) : null}
        {reduces && alert.roomNightsAbout ? (
          <Field label="Room nights given back" help="Optional. Shown in Money protected." error={decide.fe("roomNights")}>
            {(p) => <Input {...p} name="roomNights" type="number" min={0} inputMode="numeric" className="num max-w-32" defaultValue={alert.suggestedRoomNights ?? ""} />}
          </Field>
        ) : null}
        <Field label="Note" required={type === "ACCEPTED_RISK" || type === "OTHER"} error={decide.fe("note")}>
          {(p) => <Textarea {...p} name="note" placeholder="e.g. Released 20 rooms per night on the 15th and 16th" />}
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={decide.pending}>
            Record decision
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}
