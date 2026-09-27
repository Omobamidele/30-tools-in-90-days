"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { createSupplierAction } from "./actions";

export type SupplierOption = { id: string; name: string; city: string | null };

/** Supplier creation with duplicate detection: a conflict asks the user to confirm. */
export function SupplierForm({
  types,
  onCreated,
  onCancel,
  compact,
}: {
  types: Array<{ value: string; label: string }>;
  onCreated: (s: SupplierOption) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const create = useAction(createSupplierAction);
  const [duplicate, setDuplicate] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const values = { ...Object.fromEntries(new FormData(e.currentTarget)), allowDuplicate: duplicate ? "true" : "" };
    const res = await create.run(values);
    if (res.ok) onCreated(res.data);
    else if (res.error.code === "CONFLICT") setDuplicate(true);
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "flex flex-col gap-3" : "flex flex-col gap-4 p-4"} noValidate>
      <FormError message={create.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier name" required error={create.fe("name")} className="sm:col-span-2">
          {(p) => <Input {...p} name="name" onChange={() => setDuplicate(false)} />}
        </Field>
        <Field label="Type" required error={create.fe("type")}>
          {(p) => (
            <Select {...p} name="type" defaultValue="HOTEL">
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="City" error={create.fe("city")}>
          {(p) => <Input {...p} name="city" onChange={() => setDuplicate(false)} />}
        </Field>
        <Field label="Country" error={create.fe("country")}>
          {(p) => <Input {...p} name="country" />}
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.pending}>
          {duplicate ? "Add as a different supplier" : "Add supplier"}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}
