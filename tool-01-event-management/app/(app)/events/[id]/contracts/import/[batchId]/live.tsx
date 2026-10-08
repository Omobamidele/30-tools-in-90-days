"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { retryReadingAction } from "../actions";

/** Refreshes the server-rendered progress while terms are still being read. */
export function AutoRefresh({ everyMs = 3000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [router, everyMs]);
  return null;
}

export function RetryButton({ eventId, batchId, contractId }: { eventId: string; batchId: string; contractId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await retryReadingAction(eventId, batchId, contractId);
            if (!res.ok) setError(res.error.message);
            else router.refresh();
          })
        }
      >
        {pending ? "Starting…" : "Try again"}
      </Button>
      {error ? (
        <span role="alert" className="text-meta text-risk">
          {error}
        </span>
      ) : null}
    </span>
  );
}
