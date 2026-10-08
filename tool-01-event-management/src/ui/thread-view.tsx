"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { AtSign, SendHorizontal } from "@/ui/icons";
import { loadMessagesAction, postMessageAction } from "../../app/(app)/workspace-actions";
import { Avatar } from "./avatar";
import { cx } from "./cx";

export type MessageView = { id: string; body: string; createdAt: string; authorId: string; authorName: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** Renders "@Full Name" of known colleagues as highlighted mentions. */
function Body({ text, people }: { text: string; people: string[] }) {
  if (!people.length) return <>{text}</>;
  const pattern = new RegExp(`(@(?:${people.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`, "gi");
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-medium text-brand-strong">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** One event's discussion: message history plus composer. Loads and marks read on open. */
export function ThreadView({
  eventId,
  me,
  people,
  initial,
  onSent,
  className,
}: {
  eventId: string;
  me: string;
  people: string[];
  initial?: MessageView[];
  onSent?: () => void;
  className?: string;
}) {
  const [messages, setMessages] = useState<MessageView[] | null>(initial ?? null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let live = true;
    loadMessagesAction(eventId).then((r) => {
      if (live && r.ok) setMessages(r.data);
    });
    return () => {
      live = false;
    };
  }, [eventId]);
  useEffect(() => {
    // Braces matter: newer browsers return a Promise from scrollIntoView, which must not
    // become the effect's cleanup value.
    end.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    start(async () => {
      const r = await postMessageAction(eventId, body);
      if (!r.ok) {
        setError(r.error.fieldErrors.body ?? r.error.message);
        return;
      }
      setDraft("");
      setNotice(r.data.mentioned.length ? `Notified ${r.data.mentioned.join(", ")}` : null);
      const fresh = await loadMessagesAction(eventId);
      if (fresh.ok) setMessages(fresh.data);
      onSent?.();
    });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function mention(name: string) {
    setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}@${name} `);
    input.current?.focus();
  }

  return (
    <div className={cx("flex min-h-0 flex-col", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas px-4 py-4" role="log" aria-live="polite" aria-label="Messages" tabIndex={0}>
        {messages === null ? (
          <p className="py-10 text-center text-table text-muted">Loading the discussion…</p>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-section font-semibold">No messages yet</p>
            <p className="mx-auto mt-1 max-w-xs text-table text-muted">Start the discussion for this event. Mention a colleague with @ to notify them.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m, i) => {
              const mine = m.authorId === me;
              const d = day(m.createdAt);
              const divider = i === 0 || day(messages[i - 1].createdAt) !== d;
              return (
                <li key={m.id}>
                  {divider ? (
                    <p className="my-2 text-center">
                      <span className="text-meta text-faint">{d}</span>
                    </p>
                  ) : null}
                  <div className={cx("flex items-end gap-2.5", mine && "flex-row-reverse")}>
                    <Avatar name={m.authorName} size={28} />
                    <div
                      className={cx(
                        "max-w-[78%] rounded-[10px] border px-3 py-2 text-body",
                        mine ? "border-brand/15 bg-brand-tint text-ink" : "border-rule bg-surface text-ink",
                      )}
                    >
                      {!mine ? <p className="mb-0.5 text-meta font-medium text-ink">{m.authorName}</p> : null}
                      <p className="break-words whitespace-pre-wrap">
                        <Body text={m.body} people={people} />
                      </p>
                      <p className={cx("mt-0.5 text-right text-[11px]", mine ? "text-muted" : "text-faint")}>{time(m.createdAt)}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-rule bg-surface p-3">
        {people.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-meta text-muted">
              <AtSign size={13} aria-hidden /> Mention
            </span>
            {people.map((p) => (
              <button key={p} type="button" onClick={() => mention(p)} className="rounded-[5px] px-1.5 py-0.5 text-meta text-muted hover:bg-sunken hover:text-ink">
                {p}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`composer-${eventId}`}>
            Message
          </label>
          <textarea
            id={`composer-${eventId}`}
            ref={input}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
            className="min-h-9 flex-1 resize-none rounded-control border border-rule-strong bg-surface px-3 py-2 text-body focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !draft.trim()}
            aria-label="Send message"
            className="inline-flex size-9 items-center justify-center rounded-control bg-brand text-white hover:bg-brand-strong disabled:opacity-40"
          >
            <SendHorizontal size={16} aria-hidden />
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-1.5 text-meta text-risk">
            {error}
          </p>
        ) : notice ? (
          <p role="status" className="mt-1.5 text-meta text-settled">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
