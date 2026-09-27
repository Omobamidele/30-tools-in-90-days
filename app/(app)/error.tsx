"use client";

import { useEffect } from "react";
import { Button } from "@/ui/button";
import { ButtonLink } from "@/ui/page";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="panel px-6 py-8">
        <h1 className="text-section font-semibold">This page couldn&apos;t be loaded</h1>
        <p className="mt-1 text-table text-muted">
          Nothing you entered has been lost: changes are only saved when a save completes. Try again, and if the problem continues,
          send the reference below to your administrator.
        </p>
        {error.digest ? (
          <p className="mt-3 text-meta text-muted">
            Reference <code className="rounded-control bg-sunken px-1.5 py-0.5 font-mono">{error.digest}</code>
          </p>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button variant="primary" onClick={() => retry()}>
            Try again
          </Button>
          <ButtonLink href="/">Go to overview</ButtonLink>
        </div>
      </div>
    </div>
  );
}
