"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Panel } from "@/ui/page";
import { createShareLinkAction, revokeShareLinkAction } from "./share-actions";

type LinkRow = { id: string; createdAt: string; expiresAt: string; lastViewedAt: string | null; viewCount: number };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Create, copy and turn off the client's read-only link. The URL is shown once, when created. */
export function SharePanel({ clientId, clientName, links }: { clientId: string; clientName: string; links: LinkRow[] }) {
  const router = useRouter();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error?.message ?? "Something went wrong.");
      else {
        after?.();
        router.refresh();
      }
    });

  return (
    <Panel
      title="Share with client"
      description={`A read-only page for ${clientName}: their share of penalties, dates that raise their costs, and changes waiting for their approval. Never your share or margins.`}
    >
      <div className="flex flex-col gap-3 px-5 py-4 text-table">
        {fresh ? (
          <div data-surface className="rounded-control border border-settled/40 bg-settled-bg p-3">
            <p className="font-medium text-settled">Link created. Copy it now: for security it won&apos;t be shown again.</p>
            <code className="mt-1.5 block break-all rounded-[4px] bg-surface px-2 py-1 font-mono text-meta">{fresh}</code>
            <button
              type="button"
              className="mt-1.5 text-meta font-medium text-brand underline decoration-brand/40 underline-offset-2"
              onClick={async () => {
                await navigator.clipboard.writeText(fresh).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        ) : null}

        {links.length ? (
          <ul className="divide-y divide-rule rounded-control border border-rule">
            {links.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <span>
                  <span className="block">Expires {day(l.expiresAt)}</span>
                  <span className="block text-meta text-muted">Created {day(l.createdAt)}</span>
                  <span className="block text-meta text-muted">
                    {l.lastViewedAt ? `Opened ${l.viewCount} time${l.viewCount === 1 ? "" : "s"}, last on ${day(l.lastViewedAt)}` : "Not opened yet"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeShareLinkAction(clientId, l.id))}>
                  Turn off
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">No active links.</p>
        )}

        {error ? (
          <p role="alert" className="text-risk">
            {error}
          </p>
        ) : null}
        <div>
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                setCopied(false);
                const res = await createShareLinkAction(clientId);
                if (!res.ok) setError(res.error.message);
                else {
                  setFresh(res.data.url);
                  router.refresh();
                }
              })
            }
          >
            Create a link
          </Button>
        </div>
      </div>
    </Panel>
  );
}
