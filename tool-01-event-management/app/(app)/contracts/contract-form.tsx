"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { SupplierForm, type SupplierOption } from "../suppliers/supplier-form";
import { createContractAction, updateContractAction } from "./actions";

type Values = { supplierId: string; title: string; reference: string; signedDate: string; currency: string; contractedValue: string };

export function ContractForm({
  eventId,
  contractId,
  initial,
  suppliers,
  supplierTypes,
  currencies,
  cancelHref,
  canAddSupplier,
}: {
  eventId?: string;
  contractId?: string;
  initial: Values;
  suppliers: SupplierOption[];
  supplierTypes: Array<{ value: string; label: string }>;
  currencies: string[];
  cancelHref: string;
  canAddSupplier: boolean;
}) {
  const router = useRouter();
  const create = useAction(createContractAction);
  const update = useAction(updateContractAction);
  const a = contractId ? update : create;
  const [options, setOptions] = useState(suppliers);
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [adding, setAdding] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = { ...Object.fromEntries(new FormData(e.currentTarget)), supplierId };
    if (contractId) {
      const res = await update.run(contractId, values);
      if (res.ok) {
        router.push(`/contracts/${contractId}`);
        router.refresh();
      }
    } else {
      const res = await create.run(eventId!, values);
      if (res.ok) router.push(`/contracts/${res.data.id}`);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
        <FormError message={a.error} fieldErrors={a.fieldErrors} />
        <Field
          label="Supplier"
          required
          error={a.fe("supplierId")}
          help={
            canAddSupplier && !contractId ? (
              <button type="button" className="text-brand hover:underline" onClick={() => setAdding(true)}>
                Supplier not listed? Add a supplier
              </button>
            ) : undefined
          }
        >
          {(p) => (
            <Select {...p} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={Boolean(contractId)}>
              <option value="">Choose…</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? `, ${s.city}` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contract name" required error={a.fe("title")} help="e.g. Group agreement, Venue hire, Catering">
            {(p) => <Input {...p} name="title" defaultValue={initial.title} />}
          </Field>
          <Field label="Supplier reference" error={a.fe("reference")}>
            {(p) => <Input {...p} name="reference" defaultValue={initial.reference} />}
          </Field>
          <Field label="Signed on" error={a.fe("signedDate")}>
            {(p) => <Input {...p} name="signedDate" type="date" defaultValue={initial.signedDate} />}
          </Field>
          <Field label="Currency" required error={a.fe("currency")}>
            {(p) => (
              <Select {...p} name="currency" defaultValue={initial.currency}>
                {currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Contracted value"
            help="Total committed spend in the contract. Used for percentage deposits and cancellation."
            error={a.fe("contractedValue")}
            className="sm:col-span-2"
          >
            {(p) => <Input {...p} name="contractedValue" inputMode="decimal" className="num max-w-60" defaultValue={initial.contractedValue} />}
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={a.pending}>
            {contractId ? "Save changes" : "Add contract"}
          </Button>
          <Button onClick={() => router.push(cancelHref)}>Cancel</Button>
        </div>
      </form>
      <Dialog open={adding} onOpenChange={setAdding} title="Add supplier">
        <SupplierForm
          compact
          types={supplierTypes}
          onCancel={() => setAdding(false)}
          onCreated={(s) => {
            setOptions((o) => [...o, s].sort((x, y) => x.name.localeCompare(y.name)));
            setSupplierId(s.id);
            setAdding(false);
          }}
        />
      </Dialog>
    </>
  );
}
