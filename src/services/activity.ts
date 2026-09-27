import { and, desc, eq, or } from "drizzle-orm";
import { activityLog } from "@/db/schema";
import type { ServiceCtx } from "./context";
import { authorizeEvent } from "./events";

export async function listEventActivity(ctx: ServiceCtx, eventId: string, limit = 100) {
  await authorizeEvent(ctx, eventId, "event.view");
  return ctx.db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.orgId, ctx.actor.orgId), eq(activityLog.eventId, eventId)))
    .orderBy(desc(activityLog.at))
    .limit(limit);
}

export async function listEntityActivity(ctx: ServiceCtx, entityType: string, entityId: string, limit = 100) {
  return ctx.db
    .select()
    .from(activityLog)
    .where(
      and(
        eq(activityLog.orgId, ctx.actor.orgId),
        or(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId))),
      ),
    )
    .orderBy(desc(activityLog.at))
    .limit(limit);
}
