"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/core/money";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { cx } from "@/ui/cx";
import { csqlAction } from "../actions";

type Act = "ACCEPT" | "RETURN" | "REROUTE" | "REASSIGN" | "RECORD_OPPORTUNITY" | "WIN" | "LOSE" | "CLOSE_NO_OPP";

const LABEL: Record<Act, string> = {
  ACCEPT: "Accept",
  RETURN: "Send back",
  REROUTE: "Re-route",
  REASSIGN: "Reassign",
  RECORD_OPPORTUNITY: "Opportunity",
  WIN: "Won",
  LOSE: "Lost",
  CLOSE_NO_OPP: "No opportunity",
};

const HELP: Partial<Record<Act, string>> = {
  ACCEPT: "You'll work this with the customer. The deadline clock stops.",
  RETURN: "Sends it back to the CSM with your reason. Use it when the handoff is missing something.",
  REROUTE: "Sends it to a seller again with your update.",
  RECORD_OPPORTUNITY: "Record the opportunity you created in the CRM. This is what counts as pipeline.",
  WIN: "Record the closed amount. This is what counts as won revenue.",
  CLOSE_NO_OPP: "Close it without an opportunity, with a reason the CSM will see.",
};

export function CsqlActions({
  csql,
  actions,
  sellers,
  returnReasons,
  lostReasons,
  currency,
  csqlTerm,
}: {
  csql: { id: string; lockVersion: number; status: string; estimateMinor: number | null; oppAmountMinor: number | null };
  actions: Act[];
  sellers: Array<{ id: string; name: string }>;
  returnReasons: string[];
  lostReasons: string[];
  currency: string;
  csqlTerm: string;
}) {
  const router = useRouter();
  const order: Act[] = ["ACCEPT", "RECORD_OPPORTUNITY", "WIN", "LOSE", "RETURN", "REROUTE", "CLOSE_NO_OPP", "REASSIGN"];
  const list = order.filter((a) => actions.includes(a));
  const [act, setAct] = useState<Act | null>(list[0] ?? null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  if (!list.length) {
    const closed = ["WON", "LOST", "CLOSED_NO_OPP"].includes(csql.status);
    return (
      <section className="panel px-4 py-3 text-table text-muted">
        {closed ? `This ${csqlTerm} is closed.` : `Only the seller it's routed to, or a sales leader, can work this ${csqlTerm}.`}
      </section>
    );
  }
  const current = act && list.includes(act) ? act : list[0];
  const submit = (input: Record<string, unknown>) =>
    start(async () => {
      setError(null);
      setFe({});
      const res = await csqlAction(csql.id, csql.lockVersion, current, input);
      if (!res.ok) {
        setError(res.error.message);
        setFe(res.error.fieldErrors);
        return;
      }
      router.refresh();
    });
  const amountDefault = csql.oppAmountMinor ?? csql.estimateMinor;

  return (
    <section className="panel" aria-labelledby="work-title">
      <div className="border-b border-rule px-4 pt-3">
        <h2 id="work-title" className="text-section font-semibold">
          Next step
        </h2>
        <div role="tablist" aria-label="Action" className="mt-2 flex flex-wrap gap-x-1">
          {list.map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={current === a}
              onClick={() => {
                setAct(a);
                setError(null);
                setFe({});
              }}
              className={cx("-mb-px border-b-2 px-2.5 py-2 text-table", current === a ? "border-brand font-medium text-text" : "border-transparent text-muted hover:text-text")}
            >
              {LABEL[a]}
            </button>
          ))}
        </div>
      </div>
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget).entries());
          submit(f);
        }}
      >
        {HELP[current] ? <p className="text-table text-muted">{HELP[current]}</p> : null}
        {error ? (
          <p role="alert" className="rounded-control border border-risk/30 bg-risk-bg px-3 py-2 text-table text-risk">
            {error}
          </p>
        ) : null}

        {current === "RETURN" || current === "LOSE" || current === "CLOSE_NO_OPP" ? (
          <>
            <Field label="Reason" required error={fe.reason}>
              {(a) => (
                <Select {...a} name="reason" defaultValue="">
                  <option value="" disabled>
                    Choose a reason
                  </option>
                  {(current === "LOSE" ? lostReasons : current === "RETURN" ? returnReasons : ["Customer isn't ready to talk", "Already working this deal", "Not a real opportunity"]).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Note" error={fe.note}>
              {(a) => <Textarea {...a} name="note" rows={3} />}
            </Field>
          </>
        ) : null}

        {current === "REROUTE" || current === "REASSIGN" ? (
          <Field label="Seller" required={current === "REASSIGN"} error={fe.sellerId} help={current === "REROUTE" ? "Leave on automatic to use the routing rules again." : undefined}>
            {(a) => (
              <Select {...a} name="sellerId" defaultValue="">
                {current === "REROUTE" ? <option value="">Automatic (routing rules)</option> : <option value="" disabled>Choose a seller</option>}
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {current === "REROUTE" ? <Field label="Update for the seller" error={fe.note}>{(a) => <Textarea {...a} name="note" rows={3} />}</Field> : null}
        {current === "REASSIGN" ? <Field label="Why" required error={fe.reason}>{(a) => <Input {...a} name="reason" />}</Field> : null}

        {current === "RECORD_OPPORTUNITY" ? (
          <>
            <Field label="Amount, ARR" required error={fe.amount} help={amountDefault ? `Estimate was ${formatMoney(amountDefault, currency)}.` : undefined}>
              {(a) => <Input {...a} name="amount" inputMode="decimal" defaultValue={amountDefault ? String(amountDefault / 100) : ""} />}
            </Field>
            <Field label="What they're buying" required error={fe.kind}>
              {(a) => (
                <Select {...a} name="kind" defaultValue="SEATS">
                  <option value="SEATS">More seats</option>
                  <option value="USAGE_TIER">Higher usage tier</option>
                  <option value="ADDON">An add-on</option>
                  <option value="MULTI">More than one of these</option>
                </Select>
              )}
            </Field>
            <Field label="CRM opportunity ID or link" error={fe.crmRef}>
              {(a) => <Input {...a} name="crmRef" placeholder="e.g. OPP-24518" />}
            </Field>
            <Field label="Expected close" error={fe.expectedClose}>
              {(a) => <Input {...a} type="date" name="expectedClose" />}
            </Field>
          </>
        ) : null}

        {current === "WIN" ? (
          <Field label="Closed amount, ARR" required error={fe.amount}>
            {(a) => <Input {...a} name="amount" inputMode="decimal" defaultValue={csql.oppAmountMinor ? String(csql.oppAmountMinor / 100) : ""} />}
          </Field>
        ) : null}

        <Button type="submit" variant={current === "RETURN" || current === "LOSE" || current === "CLOSE_NO_OPP" ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Saving…" : current === "ACCEPT" ? "Accept and work it" : current === "WIN" ? "Mark as won" : current === "LOSE" ? "Mark as lost" : current === "RECORD_OPPORTUNITY" ? "Save opportunity" : LABEL[current]}
        </Button>
      </form>
    </section>
  );
}
