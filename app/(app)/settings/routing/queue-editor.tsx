"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { saveQueueAction } from "../actions";

export function QueueEditor({ segment, members, sellers }: { segment: string; members: string[]; sellers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(members);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = (id: string) => sellers.find((s) => s.id === id)?.name ?? "Unknown";
  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-table">
        Turn order: {chosen.length ? chosen.map((id, i) => <span key={id}>{i ? " → " : ""}{name(id)}</span>) : <span className="text-muted">nobody (falls back to the sales leader)</span>}
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">Sellers in this queue</legend>
        {sellers.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-table">
            <input
              type="checkbox"
              className="size-4 accent-[var(--brand)]"
              checked={chosen.includes(s.id)}
              onChange={(e) => setChosen(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))}
            />
            {s.name}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveQueueAction({ segment, memberIds: chosen });
              setMsg(r.ok ? "Saved. Turns start again from the first person." : r.error.message);
              router.refresh();
            })
          }
        >
          Save queue
        </Button>
        {msg ? <span role="status" className="text-meta text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
