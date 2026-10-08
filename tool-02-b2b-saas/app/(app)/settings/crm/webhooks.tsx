"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { Status } from "@/ui/bits";
import { createWebhookAction, deleteWebhookAction, testWebhookAction } from "../actions";

type Endpoint = { id: string; url: string; events: string[]; secretHint: string };
type Delivery = { id: string; event: string; status: string; attempts: number; responseCode: number | null; lastError: string | null; createdAt: string };

export function Webhooks({ events, endpoints, deliveries, tz }: { events: string[]; endpoints: Endpoint[]; deliveries: Delivery[]; tz: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {secret ? (
        <div role="status" className="rounded-panel border border-won/40 bg-won-bg p-3">
          <p className="text-table font-medium text-won">Signing secret. Copy it now; it won&apos;t be shown again.</p>
          <code className="mt-1.5 block rounded-[4px] bg-surface px-2 py-1 font-mono text-table break-all">{secret}</code>
        </div>
      ) : null}
      {note ? <p role="status" className="text-table text-muted">{note}</p> : null}
      {endpoints.length ? (
        <ul className="divide-y divide-rule rounded-panel border border-rule">
          {endpoints.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-table">
              <span className="min-w-0">
                <span className="block font-mono break-all">{e.url}</span>
                <span className="text-meta text-muted">
                  {e.events.join(", ")} · secret {e.secretHint}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await testWebhookAction(e.id);
                      setNote(r.ok ? (r.data.delivered ? "Test delivered." : "Test failed. See the delivery log below; it will be retried.") : r.error.message);
                      router.refresh();
                    })
                  }
                >
                  Send test
                </Button>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await deleteWebhookAction(e.id);
                      router.refresh();
                    })
                  }
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-table text-muted">No webhooks yet.</p>
      )}
      <form
        className="flex flex-col gap-3 rounded-panel border border-dashed border-rule-strong p-3"
        onSubmit={(ev) => {
          ev.preventDefault();
          const form = ev.currentTarget;
          const f = new FormData(form);
          start(async () => {
            setError(null);
            const r = await createWebhookAction({ url: String(f.get("url") ?? ""), events: events.filter((x) => f.get(`ev-${x}`)) });
            if (!r.ok) return setError(Object.values(r.error.fieldErrors)[0] ?? r.error.message);
            setSecret(r.data.secret);
            form.reset();
            router.refresh();
          });
        }}
      >
        <Field label="Endpoint URL" error={error ?? undefined}>
          {(a) => <Input {...a} name="url" placeholder="https://hooks.example.com/signal-desk" />}
        </Field>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-table font-medium">Events</legend>
          {events.map((x) => (
            <label key={x} className="flex items-center gap-2 font-mono text-meta">
              <input type="checkbox" name={`ev-${x}`} defaultChecked className="size-4 accent-[var(--brand)]" /> {x}
            </label>
          ))}
        </fieldset>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            Add webhook
          </Button>
        </div>
      </form>
      <div>
        <p className="mb-1 text-table font-medium">Recent deliveries</p>
        {deliveries.length ? (
          <ul className="divide-y divide-rule rounded-panel border border-rule">
            {deliveries.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-table">
                <span className="font-mono">{d.event}</span>
                <span className="flex items-center gap-3 text-meta text-muted">
                  {new Date(d.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz })}
                  {d.responseCode ? <span className="font-mono">HTTP {d.responseCode}</span> : null}
                  <span>attempt {d.attempts}</span>
                  <Status tone={d.status === "DELIVERED" ? "won" : d.status === "FAILED" ? "risk" : "watch"}>{d.status === "PENDING" ? "Retrying" : d.status === "DELIVERED" ? "Delivered" : "Failed"}</Status>
                </span>
                {d.lastError && d.status !== "DELIVERED" ? <span className="w-full text-meta text-risk">{d.lastError}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-table text-muted">No deliveries yet.</p>
        )}
      </div>
    </div>
  );
}
