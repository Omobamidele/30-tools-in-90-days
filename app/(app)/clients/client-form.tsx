"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { createClientAction, updateClientAction } from "./actions";

type Values = { name: string; industry: string; billingContactName: string; billingContactEmail: string; notes: string };

export function ClientForm({ clientId, initial, cancelHref }: { clientId?: string; initial?: Partial<Values>; cancelHref: string }) {
  const router = useRouter();
  const create = useAction(createClientAction);
  const update = useAction(updateClientAction);
  const a = clientId ? update : create;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (clientId) {
      const res = await update.run(clientId, values);
      if (res.ok) {
        router.push(`/clients/${clientId}`);
        router.refresh();
      }
    } else {
      const res = await create.run(values);
      if (res.ok) router.push(`/clients/${res.data.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
      <FormError message={a.error} fieldErrors={a.fieldErrors} />
      <Field label="Name" required error={a.fe("name")}>
        {(p) => <Input {...p} name="name" defaultValue={initial?.name} autoFocus />}
      </Field>
      <Field label="Industry" error={a.fe("industry")}>
        {(p) => <Input {...p} name="industry" defaultValue={initial?.industry ?? ""} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Billing contact" error={a.fe("billingContactName")}>
          {(p) => <Input {...p} name="billingContactName" defaultValue={initial?.billingContactName ?? ""} />}
        </Field>
        <Field label="Billing email" error={a.fe("billingContactEmail")}>
          {(p) => <Input {...p} name="billingContactEmail" type="email" defaultValue={initial?.billingContactEmail ?? ""} />}
        </Field>
      </div>
      <Field label="Notes" error={a.fe("notes")}>
        {(p) => <Textarea {...p} name="notes" defaultValue={initial?.notes ?? ""} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={a.pending}>
          {clientId ? "Save changes" : "Create client"}
        </Button>
        <Button onClick={() => router.push(cancelHref)}>Cancel</Button>
      </div>
    </form>
  );
}
