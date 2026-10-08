"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "@/ui/icons";
import { Button } from "@/ui/button";
import { Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";
import { deletePenaltyAction, recordPenaltyAction } from "./actions";

export function PenaltyForm({
  contractId,
  eventId,
  currency,
  categories,
}: {
  contractId: string;
  eventId: string;
  currency: string;
  categories: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const save = useAction(recordPenaltyAction);
  const [key, setKey] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await save.run(eventId, contractId, Object.fromEntries(new FormData(e.currentTarget)));
    if (res.ok) {
      setKey((k) => k + 1);
      router.refresh();
    }
  }

  return (
    <form key={key} onSubmit={onSubmit} className="mt-2 flex flex-wrap items-end gap-2" noValidate>
      <label className="text-meta text-muted">
        Penalty
        <Select name="category" className="min-w-48">
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-meta text-muted">
        Amount ({currency})
        <Input name="amount" inputMode="decimal" className="num w-36" aria-invalid={Boolean(save.fe("amount"))} />
      </label>
      <label className="text-meta text-muted">
        Invoice reference
        <Input name="invoiceRef" className="w-40" />
      </label>
      <Button type="submit" size="md" disabled={save.pending}>
        Record penalty
      </Button>
      {save.error ? <p className="w-full text-meta text-risk">{save.error}</p> : null}
    </form>
  );
}

export function RemovePenalty({ id, eventId }: { id: string; eventId: string }) {
  const router = useRouter();
  const del = useAction(deletePenaltyAction);
  return (
    <Button size="sm" variant="ghost" aria-label="Remove this penalty" disabled={del.pending} onClick={async () => (await del.run(eventId, id)).ok && router.refresh()}>
      <Trash2 size={14} aria-hidden />
    </Button>
  );
}
