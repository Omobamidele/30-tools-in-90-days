import { formatDateTime } from "./format";

type Entry = { id: string; actorLabel: string | null; actorType: string; summary: string; at: Date };

export function ActivityList({ entries, timezone, compact }: { entries: Entry[]; timezone: string; compact?: boolean }) {
  if (!entries.length) return <p className="px-4 py-6 text-center text-table text-muted">No activity yet.</p>;
  return (
    <ol className="divide-y divide-rule">
      {entries.map((e) => (
        <li key={e.id} className={compact ? "px-4 py-2" : "flex gap-4 px-4 py-2.5"}>
          <time className={compact ? "block text-meta text-muted" : "num w-36 shrink-0 text-meta text-muted"} dateTime={e.at.toISOString()}>
            {formatDateTime(e.at, timezone)}
          </time>
          <p className="min-w-0 text-table">
            <span className="font-medium">{e.actorLabel ?? (e.actorType === "SYSTEM" ? "System" : "Unknown")}</span>{" "}
            <span className="text-muted">·</span> {e.summary}
          </p>
        </li>
      ))}
    </ol>
  );
}
