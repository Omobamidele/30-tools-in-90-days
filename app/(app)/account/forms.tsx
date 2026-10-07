"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/auth/client";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { Panel } from "@/ui/page";
import { savePreferencesAction } from "./actions";

export function AccountForms({ emailNotifications, digest }: { emailNotifications: boolean; digest: boolean }) {
  const [prefMsg, setPrefMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Email" id="email">
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await savePreferencesAction({ emailNotifications: f.get("emailNotifications") === "on", digest: f.get("digest") === "on" });
              setPrefMsg(r.ok ? "Saved." : r.error.message);
            });
          }}
        >
          <label className="flex items-start gap-2 text-table">
            <input type="checkbox" name="emailNotifications" defaultChecked={emailNotifications} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>
              Email me when work is routed to me, comes back, or is overdue
              <span className="block text-meta text-muted">You&apos;ll still see everything under Notifications.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-table">
            <input type="checkbox" name="digest" defaultChecked={digest} className="mt-0.5 size-4 accent-[var(--brand)]" />
            <span>Monday digest: my open work and last week&apos;s results</span>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              Save
            </Button>
            {prefMsg ? <span role="status" className="text-meta text-muted">{prefMsg}</span> : null}
          </div>
        </form>
      </Panel>
      <Panel title="Password" id="password">
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            const next = String(f.get("next") ?? "");
            if (next.length < 10) return setPwMsg({ ok: false, text: "Use at least 10 characters." });
            if (next !== f.get("confirm")) return setPwMsg({ ok: false, text: "The new passwords don't match." });
            start(async () => {
              const { error } = await authClient.changePassword({ currentPassword: String(f.get("current") ?? ""), newPassword: next, revokeOtherSessions: true });
              setPwMsg(error ? { ok: false, text: error.status === 400 || error.code === "INVALID_PASSWORD" ? "Your current password isn't right." : "Couldn't change it. Try again." } : { ok: true, text: "Changed. Other devices have been signed out." });
              if (!error) form.reset();
            });
          }}
        >
          <Field label="Current password">{(a) => <Input {...a} type="password" name="current" autoComplete="current-password" />}</Field>
          <Field label="New password" help="At least 10 characters.">{(a) => <Input {...a} type="password" name="next" autoComplete="new-password" />}</Field>
          <Field label="New password again">{(a) => <Input {...a} type="password" name="confirm" autoComplete="new-password" />}</Field>
          {pwMsg ? (
            <p role={pwMsg.ok ? "status" : "alert"} className={pwMsg.ok ? "text-table text-won" : "text-table text-risk"}>
              {pwMsg.text}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={pending}>
              Change password
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
