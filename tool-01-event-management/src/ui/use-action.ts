"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/services/errors";

/**
 * Runs a server action that returns an ActionResult and exposes pending state,
 * the top-level error message and per-field errors for forms.
 */
export function useAction<Args extends unknown[], T>(action: (...args: Args) => Promise<ActionResult<T>>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(...args: Args): Promise<ActionResult<T>> {
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await action(...args);
        if (res.ok) {
          setError(null);
          setFieldErrors({});
        } else {
          setError(res.error.message);
          setFieldErrors(res.error.fieldErrors);
        }
        resolve(res);
      });
    });
  }

  return {
    run,
    pending,
    error,
    fieldErrors,
    fe: (name: string) => fieldErrors[name],
    reset: () => {
      setError(null);
      setFieldErrors({});
    },
  };
}
