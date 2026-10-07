"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { createKeyAction, revokeKeyAction } from "./actions";

/** Create, show once, and revoke API keys of one kind (spec NFR-3). */
export function KeyManager({ kind, keys, tz }: { kind: "INGEST" | "CRM"; keys: Array<{ id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string }>; tz: string }) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz }) : "Never");
  return (
    <div className="flex flex-col gap-3">
      {token ? (
        <div role="status" className="rounded-panel border border-won/40 bg-won-bg p-3">
          <p className="text-table font-medium text-won">Copy this key now. It won&apos;t be shown again.</p>
          <code className="mt-1.5 block rounded-[4px] bg-surface px-2 py-1 font-mono text-table break-all">{token}</code>
          <Button size="sm" className="mt-2" onClick={() => navigator.clipboard?.writeText(token)}>
            Copy
          </Button>
        </div>
      ) : null}
      {keys.length ? (
        <ul className="divide-y divide-rule rounded-panel border border-rule">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-table">
              <span>
                <span className="font-medium">{k.name}</span> <span className="font-mono text-muted">{k.prefix}…</span>
                <span className="block text-meta text-muted">Last used: {when(k.lastUsedAt)}</span>
              </span>
              {confirm === k.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-meta text-risk">Anything using this key will stop working.</span>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await revokeKeyAction(k.id);
                        if (!r.ok) setError(r.error.message);
                        setConfirm(null);
                        router.refresh();
                      })
                    }
                  >
                    Revoke
                  </Button>
                  <Button size="sm" onClick={() => setConfirm(null)}>
                    Cancel
                  </Button>
                </span>
              ) : (
                <Button size="sm" onClick={() => setConfirm(k.id)}>
                  Revoke…
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-table text-muted">No active keys.</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = String(new FormData(form).get("name") ?? "");
          start(async () => {
            setError(null);
            const r = await createKeyAction({ kind, name });
            if (!r.ok) return setError(r.error.fieldErrors.name ?? r.error.message);
            setToken(r.data.token);
            form.reset();
            router.refresh();
          });
        }}
      >
        <Field label="New key name" error={error ?? undefined} className="min-w-64 flex-1">
          {(a) => <Input {...a} name="name" placeholder={kind === "INGEST" ? "e.g. Warehouse nightly job" : "e.g. Salesforce flow"} />}
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Create key
        </Button>
      </form>
    </div>
  );
}
