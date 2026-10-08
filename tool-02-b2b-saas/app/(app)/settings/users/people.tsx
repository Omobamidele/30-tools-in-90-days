"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { Status } from "@/ui/bits";
import { createUserAction, updateUserAction } from "../actions";

type Person = { id: string; name: string; email: string; role: string; status: string };

export function People({ me, admin, roles, people }: { me: string; admin: boolean; roles: Array<{ key: string; label: string }>; people: Person[] }) {
  const router = useRouter();
  const [temp, setTemp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const label = (k: string) => roles.find((r) => r.key === k)?.label ?? k;
  return (
    <div className="flex flex-col">
      <ul className="divide-y divide-rule">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-table">
            <span>
              <span className="font-medium">{p.name}</span> {p.id === me ? <span className="text-meta text-muted">(you)</span> : null}
              <span className="block text-meta text-muted">{p.email}</span>
            </span>
            {admin && p.id !== me ? (
              <span className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`role-${p.id}`}>
                  Role for {p.name}
                </label>
                <Select
                  id={`role-${p.id}`}
                  defaultValue={p.role}
                  className="h-8 w-56"
                  onChange={(e) =>
                    start(async () => {
                      const r = await updateUserAction(p.id, { role: e.target.value, status: p.status });
                      if (!r.ok) setError(r.error.message);
                      router.refresh();
                    })
                  }
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await updateUserAction(p.id, { role: p.role, status: p.status === "ACTIVE" ? "DEACTIVATED" : "ACTIVE" });
                      if (!r.ok) setError(r.error.message);
                      router.refresh();
                    })
                  }
                >
                  {p.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                </Button>
              </span>
            ) : (
              <span className="flex items-center gap-3">
                <span className="text-muted">{label(p.role)}</span>
                {p.status !== "ACTIVE" ? <Status tone="neutral">Deactivated</Status> : null}
              </span>
            )}
          </li>
        ))}
      </ul>
      {admin ? (
        <form
          className="flex flex-col gap-3 border-t border-rule p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = Object.fromEntries(new FormData(form).entries());
            start(async () => {
              setError(null);
              setFe({});
              const r = await createUserAction(f);
              if (!r.ok) {
                setError(r.error.message);
                setFe(r.error.fieldErrors);
                return;
              }
              setTemp(r.data.temporaryPassword);
              form.reset();
              router.refresh();
            });
          }}
        >
          <p className="text-table font-medium">Add a person</p>
          {error ? (
            <p role="alert" className="text-table text-risk">
              {error}
            </p>
          ) : null}
          {temp ? (
            <p role="status" className="rounded-control bg-won-bg px-3 py-2 text-table text-won">
              Added. Temporary password (shown once): <span>{temp}</span>
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" error={fe.name}>
              {(a) => <Input {...a} name="name" />}
            </Field>
            <Field label="Email" error={fe.email}>
              {(a) => <Input {...a} type="email" name="email" />}
            </Field>
            <Field label="Role" error={fe.role}>
              {(a) => (
                <Select {...a} name="role" defaultValue="CSM">
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div>
            <Button type="submit" variant="primary" disabled={pending}>
              Add person
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
