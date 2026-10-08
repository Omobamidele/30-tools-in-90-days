import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ingestBatches, sellerQueues, users } from "@/db/schema";
import { assertCan, audit, type ServiceCtx } from "./context";
import { parseInput, validation } from "./errors";

// Settings data that lives in the database (routing queues, ingest log). Branding, terminology,
// the price book, deadlines and reasons live in the client config (spec §13).

export async function ingestLog(ctx: ServiceCtx) {
  assertCan(ctx, "integrations.manage");
  return ctx.db.select().from(ingestBatches).where(eq(ingestBatches.orgId, ctx.actor.orgId)).orderBy(desc(ingestBatches.receivedAt)).limit(20);
}

export async function listQueues(ctx: ServiceCtx) {
  const queues = await ctx.db.select().from(sellerQueues).where(eq(sellerQueues.orgId, ctx.actor.orgId));
  return queues;
}

const queueInput = z.object({ segment: z.string().min(1), memberIds: z.array(z.uuid()).max(50) });

/** Replace a segment's round-robin members (spec FR-16). Order is the rotation order. */
export async function saveQueue(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "settings.manage");
  const input = parseInput(queueInput, raw);
  const seg = ctx.actor.config.segments.find((s) => s.key === input.segment);
  if (!seg) throw validation("Unknown segment.");
  const members = input.memberIds.length ? await ctx.db.select().from(users).where(and(inArray(users.id, input.memberIds), eq(users.orgId, ctx.actor.orgId))) : [];
  if (members.some((m) => !["SELLER", "SALES_LEAD"].includes(m.role)) || members.length !== input.memberIds.length) throw validation("Only sellers can be in a routing queue.");
  await ctx.db
    .insert(sellerQueues)
    .values({ orgId: ctx.actor.orgId, segment: seg.key, name: seg.name, memberIds: input.memberIds, cursor: 0 })
    .onConflictDoUpdate({ target: [sellerQueues.orgId, sellerQueues.segment], set: { memberIds: input.memberIds, cursor: 0 } });
  await audit(ctx.db, ctx, { entityType: "routing", entityId: ctx.actor.orgId, action: "queue_saved", summary: `${seg.name} queue: ${members.map((m) => m.name).join(", ") || "empty"}` });
}
