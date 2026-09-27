import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { listMessages } from "@/services/threads";
import { Panel } from "@/ui/page";
import { ThreadView } from "@/ui/thread-view";
import { loadEvent } from "../load";

export const metadata: Metadata = { title: "Discussion" };

export default async function EventDiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event } = await loadEvent(id);
  const [messages, people] = await Promise.all([
    listMessages(ctx, id),
    ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE"))),
  ]);
  return (
    <Panel title="Discussion" description={`Everyone who works on ${event.name} can read and post here. Mention a colleague with @ to notify them.`} bodyClassName="flex">
      <ThreadView
        eventId={id}
        me={ctx.actor.userId}
        people={people.filter((p) => p.id !== ctx.actor.userId).map((p) => p.name)}
        initial={messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), authorId: m.authorId, authorName: m.authorName }))}
        className="h-[560px] w-full"
      />
    </Panel>
  );
}
