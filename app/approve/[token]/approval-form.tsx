"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { respondAction } from "./actions";

export function ApprovalForm({ token, agencyName, deadline }: { token: string; agencyName: string; deadline: string }) {
  const respond = useAction(respondAction);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<string | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    const res = await respond.run(token, { decision, approverName: name, comment });
    if (res.ok) {
      setDone(decision === "APPROVE" ? `Change approved. ${agencyName} has been notified.` : `Change rejected. ${agencyName} has been notified.`);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-control border border-settled/40 bg-settled-bg px-3 py-2.5 text-body text-settled">
        {done}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={respond.error} />
      <Field label="Your name" required error={respond.fe("approverName")}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
      </Field>
      <Field label="Comment" error={respond.fe("comment")}>
        {(p) => <Textarea {...p} value={comment} onChange={(e) => setComment(e.target.value)} />}
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" className="h-10 sm:h-8" disabled={respond.pending} onClick={() => decide("APPROVE")}>
          Approve change
        </Button>
        <Button className="h-10 sm:h-8" disabled={respond.pending} onClick={() => decide("REJECT")}>
          Reject change
        </Button>
      </div>
      <p className="text-meta text-muted">This link can be used once and expires {deadline}.</p>
    </div>
  );
}
