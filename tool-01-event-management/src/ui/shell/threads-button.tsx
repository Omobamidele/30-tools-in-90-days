"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { MessagesSquare } from "@/ui/icons";
import { loadThreadsAction } from "../../../app/(app)/workspace-actions";
import { Sheet } from "../sheet";
import { ThreadView } from "../thread-view";
import { cx } from "../cx";

type Thread = Extract<Awaited<ReturnType<typeof loadThreadsAction>>, { ok: true }>["data"];

/** Top-bar entry to the team threads: icon with unread count, opening the threads sheet. */
export function ThreadsButton({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread ? `Team threads, ${unread} unread` : "Team threads"}
        title="Team threads"
        className="relative rounded-control p-2 text-on-midnight-muted hover:bg-white/10 hover:text-white"
      >
        <MessagesSquare size={18} aria-hidden />
        {unread ? (
          <span className="num absolute top-0.5 right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-midnight ring-2 ring-midnight">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      <ThreadsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ThreadsSheet({ open, onOpenChange, initialEventId }: { open: boolean; onOpenChange: (o: boolean) => void; initialEventId?: string }) {
  const router = useRouter();
  const [data, setData] = useState<Thread | null>(null);
  const [active, setActive] = useState<string | null>(initialEventId ?? null);
  const [loading, start] = useTransition();

  const refresh = useCallback(() => {
    start(async () => {
      const r = await loadThreadsAction();
      if (r.ok) {
        setData(r.data);
        setActive((a) => a ?? r.data.threads.find((t) => t.lastMessageAt)?.eventId ?? r.data.threads[0]?.eventId ?? null);
      }
    });
  }, []);

  // Radix only reports changes it initiates (closing); opening comes from our own state.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) router.refresh(); // unread badges
      }}
      title="Team threads"
      description="One discussion per event, shared with everyone who works on it"
      size="xl"
      bodyClassName="flex"
    >
      <div className="flex min-h-0 w-full flex-col sm:flex-row">
        <nav aria-label="Threads" className="max-h-56 shrink-0 overflow-y-auto border-b border-rule sm:max-h-none sm:w-80 sm:border-r sm:border-b-0">
          {!data ? (
            <p className="p-5 text-table text-muted">{loading ? "Loading threads…" : ""}</p>
          ) : (
            <ul className="p-2">
              {data.threads.map((t) => (
                <li key={t.eventId}>
                  <button
                    type="button"
                    onClick={() => setActive(t.eventId)}
                    aria-current={active === t.eventId ? "true" : undefined}
                    className={cx("flex w-full flex-col gap-0.5 rounded-control px-3 py-2.5 text-left", active === t.eventId ? "bg-sunken" : "hover:bg-sunken/60")}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cx("truncate text-body", t.unread ? "font-semibold text-ink" : "font-medium text-ink")}>{t.eventName}</span>
                      {t.lastMessageAt ? (
                        <span className="shrink-0 text-meta text-faint">{new Date(t.lastMessageAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      ) : null}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-table text-muted">{t.lastBody ? `${t.lastAuthor}: ${t.lastBody}` : `${t.clientName} · no messages yet`}</span>
                      {t.unread ? <span className="num shrink-0 rounded-full bg-brand px-1.5 text-meta leading-5 font-semibold text-white">{t.unread}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        {data && active ? (
          <ThreadView key={active} eventId={active} me={data.me} people={data.people} onSent={refresh} className="min-h-[420px] flex-1" />
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-table text-muted">Choose a thread</div>
        )}
      </div>
    </Sheet>
  );
}
