"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Select } from "@/ui/field";
import { Attributes, Panel } from "@/ui/page";
import { updateTeamAction } from "../actions";

export function TeamEditor(p: {
  accountId: string;
  canEdit: boolean;
  canChangeCsm: boolean;
  csmId: string | null;
  ownerId: string | null;
  segment: string | null;
  csmName: string | null;
  ownerName: string | null;
  segments: Array<{ key: string; name: string }>;
  csms: Array<{ id: string; name: string }>;
  sellers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Panel
      title="Team"
      id="team"
      actions={p.canEdit && !editing ? (
        <Button size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      ) : null}
    >
      {!editing ? (
        <Attributes
          items={[
            { label: "CSM", value: p.csmName },
            { label: "Account owner", value: p.ownerName ?? <span className="text-muted">None: routes to the segment queue</span> },
            { label: "Segment", value: p.segments.find((s) => s.key === p.segment)?.name ?? null },
          ]}
        />
      ) : (
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const v = (k: string) => (String(f.get(k) ?? "") || null) as string | null;
            start(async () => {
              const res = await updateTeamAction(p.accountId, { csmId: v("csmId"), ownerId: v("ownerId"), segment: v("segment") });
              if (!res.ok) return setError(res.error.message);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          {error ? (
            <p role="alert" className="text-table text-risk">
              {error}
            </p>
          ) : null}
          <Field label="CSM" help={p.canChangeCsm ? undefined : "Ask a CS leader to move the account."}>
            {(a) => (
              <Select {...a} name="csmId" defaultValue={p.csmId ?? ""} disabled={!p.canChangeCsm}>
                <option value="">No CSM</option>
                {p.csms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {!p.canChangeCsm ? <input type="hidden" name="csmId" value={p.csmId ?? ""} /> : null}
          <Field label="Account owner">
            {(a) => (
              <Select {...a} name="ownerId" defaultValue={p.ownerId ?? ""}>
                <option value="">No owner (segment queue)</option>
                {p.sellers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Segment">
            {(a) => (
              <Select {...a} name="segment" defaultValue={p.segment ?? ""}>
                <option value="">No segment</option>
                {p.segments.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
