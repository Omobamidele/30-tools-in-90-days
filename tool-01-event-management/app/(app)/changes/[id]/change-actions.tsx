"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { approveInternallyAction, reissueLinkAction, sendBackAction, submitChangeAction, withdrawChangeAction } from "../actions";

type Link = { url: string; emailed: boolean } | null;

/** Lifecycle actions for a change request, shown according to status and role. */
export function ChangeActions({
  id,
  status,
  canRaise,
  canApprove,
  defaultEmail,
}: {
  id: string;
  status: string;
  canRaise: boolean;
  canApprove: boolean;
  defaultEmail: string;
}) {
  const router = useRouter();
  const submit = useAction(submitChangeAction);
  const approve = useAction(approveInternallyAction);
  const back = useAction(sendBackAction);
  const withdraw = useAction(withdrawChangeAction);
  const reissue = useAction(reissueLinkAction);
  const [email, setEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [link, setLink] = useState<Link>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const error = submit.error ?? approve.error ?? back.error ?? withdraw.error ?? reissue.error;

  const done = (l: Link) => {
    setLink(l);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-4 text-table">
      <FormError message={error} />
      {link ? <LinkNotice link={link} /> : null}

      {status === "DRAFT" && canRaise ? (
        <>
          <Field label="Client approver's email" required error={submit.fe("recipientEmail")} help="They get a single-use link. No account needed.">
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
          <div>
            <Button variant="primary" disabled={submit.pending} onClick={async () => {
              const r = await submit.run(id, email);
              if (r.ok) done(r.data.link);
            }}>
              Submit for approval
            </Button>
          </div>
        </>
      ) : null}

      {status === "INTERNAL_REVIEW" && canApprove ? (
        <>
          <Field label="Note" help="Required when sending back">
            {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={approve.pending} onClick={async () => {
              const r = await approve.run(id, note);
              if (r.ok) done(r.data.link);
            }}>
              Approve and send to client
            </Button>
            <Button disabled={back.pending} onClick={async () => (await back.run(id, note)).ok && router.refresh()}>
              Send back
            </Button>
          </div>
        </>
      ) : null}
      {status === "INTERNAL_REVIEW" && !canApprove ? <p className="text-muted">Waiting for internal approval.</p> : null}

      {(status === "SENT_TO_CLIENT" || status === "EXPIRED") && canRaise ? (
        <>
          <p className="text-muted">
            {status === "EXPIRED" ? "The approval link expired before the client responded." : "Waiting for the client's decision."} You can send a new link; any earlier link stops working.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Send to" className="min-w-60 flex-1">
              {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Button disabled={reissue.pending} onClick={async () => {
              const r = await reissue.run(id, email);
              if (r.ok) done(r.data.link);
            }}>
              Send new link
            </Button>
          </div>
        </>
      ) : null}

      {canRaise && ["DRAFT", "INTERNAL_REVIEW", "SENT_TO_CLIENT", "EXPIRED"].includes(status) ? (
        <div className="border-t border-rule pt-3">
          <Button variant="ghost" onClick={() => setConfirmWithdraw(true)}>
            Withdraw change
          </Button>
        </div>
      ) : null}

      <Dialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw} title="Withdraw this change?">
        <div className="flex flex-col gap-3">
          <p className="text-body">Any approval link stops working. The change stays in the record as withdrawn.</p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={withdraw.pending} onClick={async () => {
              if ((await withdraw.run(id)).ok) {
                setConfirmWithdraw(false);
                router.refresh();
              }
            }}>
              Withdraw change
            </Button>
            <Button onClick={() => setConfirmWithdraw(false)}>Keep change</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function LinkNotice({ link }: { link: { url: string; emailed: boolean } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-control border border-settled/40 bg-settled-bg px-3 py-2">
      <p className="font-medium text-settled">{link.emailed ? "Approval link emailed to the client." : "Emails aren't being sent. Copy the approval link to share it."}</p>
      <div className="mt-1.5 flex gap-2">
        <Input readOnly value={link.url} aria-label="Approval link" onFocus={(e) => e.currentTarget.select()} />
        <Button onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
      </div>
      <p className="mt-1 text-meta text-muted">This is the only time the link is shown. Send a new one if it gets lost.</p>
    </div>
  );
}
