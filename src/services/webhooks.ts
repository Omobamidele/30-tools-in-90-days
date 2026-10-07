import { createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { log } from "@/log";
import { assertCan, audit, type DbLike, type ServiceCtx } from "./context";
import { notFound, parseInput } from "./errors";

// Outbound webhooks (spec FR-27): the vendor's own automation creates the CRM opportunity.
// Payloads are signed with HMAC-SHA256 over the raw body; deliveries are stored and retried.

export const WEBHOOK_EVENTS = ["csql.routed", "csql.accepted", "csql.opportunity_created", "csql.closed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Retry schedule after a failed attempt (spec A10): 1m, 5m, 30m, 2h, 12h, then failed. */
export const RETRY_MINUTES = [1, 5, 30, 120, 720];

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Called inside the business transaction, so a rolled-back change never sends a webhook. */
export async function enqueueWebhook(db: DbLike, ctx: ServiceCtx, event: WebhookEvent, payload: Record<string, unknown>) {
  const endpoints = await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.orgId, ctx.actor.orgId), eq(webhookEndpoints.enabled, true)));
  const targets = endpoints.filter((e) => e.events.includes(event));
  if (!targets.length) return;
  await db
    .insert(webhookDeliveries)
    .values(targets.map((e) => ({ orgId: ctx.actor.orgId, endpointId: e.id, event, payload: { event, sentAt: ctx.now().toISOString(), data: payload }, nextAttemptAt: ctx.now() })));
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number }>;
const realFetch: Fetcher = (url, init) => fetch(url, init);
let fetcher: Fetcher = realFetch;
export function setWebhookFetcherForTests(f: Fetcher | undefined) {
  fetcher = f ?? realFetch;
}

/** Delivers due webhooks. Safe to run concurrently: each delivery is claimed with SKIP LOCKED. */
export async function deliverDueWebhooks(db: Db, now = new Date(), limit = 50, orgId?: string) {
  let delivered = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const done = await db.transaction(async (tx) => {
      const due = and(eq(webhookDeliveries.status, "PENDING"), lte(webhookDeliveries.nextAttemptAt, now), orgId ? eq(webhookDeliveries.orgId, orgId) : undefined);
      const [d] = await tx.select().from(webhookDeliveries).where(due).orderBy(webhookDeliveries.nextAttemptAt).limit(1).for("update", { skipLocked: true });
      if (!d) return null;
      const [ep] = await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, d.endpointId));
      const body = JSON.stringify(d.payload);
      let code: number | null = null;
      let error: string | null = null;
      try {
        const res = await fetcher(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Signature": sign(ep.secret, body), "X-Event": d.event, "X-Delivery": d.id },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        code = res.status;
        if (res.status >= 300) error = `Endpoint answered ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : "Request failed";
      }
      const attempts = d.attempts + 1;
      if (!error) {
        await tx.update(webhookDeliveries).set({ status: "DELIVERED", attempts, responseCode: code, lastError: null, nextAttemptAt: null }).where(eq(webhookDeliveries.id, d.id));
        return "ok" as const;
      }
      const wait = RETRY_MINUTES[attempts - 1];
      await tx
        .update(webhookDeliveries)
        .set({ status: wait === undefined ? "FAILED" : "PENDING", attempts, responseCode: code, lastError: error, nextAttemptAt: wait === undefined ? null : new Date(now.getTime() + wait * 60_000) })
        .where(eq(webhookDeliveries.id, d.id));
      if (wait === undefined) log.warn({ delivery: d.id, error }, "webhook delivery failed permanently");
      return "fail" as const;
    });
    if (done === null) break;
    if (done === "ok") delivered++;
    else failed++;
  }
  return { delivered, failed };
}

const endpointInput = z.object({
  url: z.url("Enter a full URL, starting with https://"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1, "Choose at least one event"),
});

export async function createEndpoint(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "integrations.manage");
  const input = parseInput(endpointInput, raw);
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [ep] = await ctx.db.insert(webhookEndpoints).values({ orgId: ctx.actor.orgId, url: input.url, events: input.events, secret }).returning();
  await audit(ctx.db, ctx, { entityType: "webhook", entityId: ep.id, action: "created", summary: `Added webhook ${input.url}` });
  return { id: ep.id, secret };
}

export async function listEndpoints(ctx: ServiceCtx) {
  assertCan(ctx, "integrations.manage");
  const eps = await ctx.db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, ctx.actor.orgId));
  const deliveries = await ctx.db.select().from(webhookDeliveries).where(eq(webhookDeliveries.orgId, ctx.actor.orgId)).orderBy(desc(webhookDeliveries.createdAt)).limit(30);
  return { endpoints: eps.map(({ secret, ...e }) => ({ ...e, secretHint: `${secret.slice(0, 10)}…` })), deliveries };
}

export async function deleteEndpoint(ctx: ServiceCtx, id: string) {
  assertCan(ctx, "integrations.manage");
  const [ep] = await ctx.db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, ctx.actor.orgId))).returning();
  if (!ep) throw notFound("Webhook");
  await audit(ctx.db, ctx, { entityType: "webhook", entityId: id, action: "deleted", summary: `Removed webhook ${ep.url}` });
}

export async function sendTestWebhook(ctx: ServiceCtx, id: string) {
  assertCan(ctx, "integrations.manage");
  const [ep] = await ctx.db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.orgId, ctx.actor.orgId)));
  if (!ep) throw notFound("Webhook");
  await ctx.db.insert(webhookDeliveries).values({ orgId: ctx.actor.orgId, endpointId: ep.id, event: "test", payload: { event: "test", sentAt: ctx.now().toISOString(), data: { message: "Test delivery" } }, nextAttemptAt: ctx.now() });
  return deliverDueWebhooks(ctx.db, ctx.now(), 5, ctx.actor.orgId);
}
