"use client";

import { useState, useTransition } from "react";
import { saveWeeklyBriefAction } from "../workspace-actions";

/** On/off for the Monday money brief email. Saved immediately; failures roll the switch back. */
export function BriefToggle({ initial, email }: { initial: boolean; email: string }) {
  const [on, setOn] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    setMessage(null);
    start(async () => {
      const res = await saveWeeklyBriefAction(next);
      if (!res.ok) {
        setOn(!next);
        setMessage({ ok: false, text: res.error.message });
        return;
      }
      setMessage({ ok: true, text: next ? `The brief will go to ${email} on Mondays.` : "You won't get the Monday brief." });
    });
  }

  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-body font-medium">Send me the Monday money brief</span>
          <span className="block text-table text-muted">
            Every Monday at 07:00: what&apos;s at stake across your events, what changed, and what to do this week. Only events you can see are included.
          </span>
        </span>
      </label>
      <p role="status" aria-live="polite" className={message ? (message.ok ? "text-table text-settled" : "text-table text-risk") : "sr-only"}>
        {message?.text}
      </p>
    </div>
  );
}
