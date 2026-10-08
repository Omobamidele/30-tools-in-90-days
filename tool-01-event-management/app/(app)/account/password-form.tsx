"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/auth/client";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { FormError } from "@/ui/form-error";

const MIN = 10; // matches emailAndPassword.minPasswordLength in src/auth/auth.ts

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    setFormError(null);
    const fe: Record<string, string> = {};
    if (!current) fe.current = "Enter your current password";
    if (next.length < MIN) fe.next = `Use at least ${MIN} characters`;
    else if (next === current) fe.next = "Choose a password different from the current one";
    if (confirm !== next) fe.confirm = "Passwords don't match";
    setErrors(fe);
    if (Object.keys(fe).length) return;

    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      if (error.code === "INVALID_PASSWORD") setErrors({ current: "That isn't your current password" });
      else setFormError("Your password couldn't be changed. Try again.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-sm flex-col gap-3 p-4">
      <FormError message={formError} />
      <Field label="Current password" error={errors.current}>
        {(p) => <Input {...p} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}
      </Field>
      <Field label="New password" help={`At least ${MIN} characters.`} error={errors.next}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <Field label="Confirm new password" error={errors.confirm}>
        {(p) => <Input {...p} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Changing…" : "Change password"}
        </Button>
        {done ? (
          <p role="status" className="text-table text-settled">
            Password changed.
          </p>
        ) : null}
      </div>
    </form>
  );
}
