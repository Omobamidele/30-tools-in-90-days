import type { Metadata } from "next";
import { listEventActivity } from "@/services/activity";
import { Panel } from "@/ui/page";
import { ActivityList } from "@/ui/activity-list";
import { loadEvent } from "../load";

export const metadata: Metadata = { title: "Activity" };

export default async function EventActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await loadEvent(id);
  const entries = await listEventActivity(ctx, id, 300);
  return (
    <Panel title="Activity" description="Every change to this event, its contracts, deadlines and decisions.">
      <ActivityList entries={entries} timezone={ctx.actor.orgTimezone} />
    </Panel>
  );
}
