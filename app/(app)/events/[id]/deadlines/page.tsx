import type { Metadata } from "next";
import Link from "next/link";
import { listObligations } from "@/services/obligations";
import { EmptyState, Panel } from "@/ui/page";
import { loadEvent } from "../load";
import { DeadlineList } from "../../../deadlines/deadline-list";
import { toDeadlineItems } from "../../../deadlines/to-items";

export const metadata: Metadata = { title: "Deadlines" };

export default async function EventDeadlinesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const { id } = await params;
  const showClosed = (await searchParams).closed === "1";
  const { ctx, event } = await loadEvent(id);
  const rows = await listObligations(ctx, { eventId: id, includeDone: showClosed });
  const items = await toDeadlineItems(ctx, rows);

  return (
    <Panel
      title="Deadlines"
      description={`Shown in the event's timezone (${event.timezone}). Hover a date for your own time.`}
      actions={
        <Link href={`/events/${id}/deadlines${showClosed ? "" : "?closed=1"}`} className="text-table text-brand hover:underline">
          {showClosed ? "Hide closed" : "Show closed"}
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="No open deadlines">
          Deadlines are created from confirmed contract terms when a contract is activated.
        </EmptyState>
      ) : (
        <DeadlineList items={items} showEvent={false} />
      )}
    </Panel>
  );
}
