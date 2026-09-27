import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { clientShareLinks, clients, decisions } from "@/db/schema";
import type { Db } from "@/db/client";
import { env } from "@/env";
import { localDateOf } from "@/core/time";
import { assertCan, audit, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput } from "./errors";
import { getPortfolio } from "./exposure";
import { listObligations } from "./obligations";
import { listChanges } from "./changes";
import { orgRef } from "./alerts";
import { systemCtx } from "./system-ctx";

// Client share link (milestone 14): a read-only page the agency sends its client. It shows the
// client's own figures only: their share of penalties, dates that raise their costs, changes
// waiting for their approval, and rooms the agency gave back. Never the agency's share,
// margins, internal notes or other clients. Only the token's hash is stored.

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const shareUrl = (token: string) => `${env().APP_URL}/share/${token}`;

const issueInput = z.object({ expiresInDays: z.coerce.number().int().min(1).max(365).optional().default(90) });

export async function issueShareLink(ctx: ServiceCtx, clientId: string, raw: unknown = {}) {
  assertCan(ctx, "client.share");
  const input = parseInput(issueInput, raw);
  const [client] = await ctx.db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.orgId, ctx.actor.orgId)));
  if (!client) throw notFound("Client");
  const token = randomBytes(32).toString("base64url");
  const [link] = await ctx.db
    .insert(clientShareLinks)
    .values({
      orgId: ctx.actor.orgId,
      clientId,
      tokenHash: hash(token),
      createdBy: ctx.actor.userId,
      expiresAt: new Date(ctx.now().getTime() + input.expiresInDays * 86_400_000),
    })
    .returning();
  await audit(ctx.db, ctx, {
    entityType: "client",
    entityId: clientId,
    action: "share_link_created",
    summary: `Created a client link for ${client.name} (expires in ${input.expiresInDays} days)`,
  });
  // The URL is only ever returned here: it can't be shown again, only replaced.
  return { id: link.id, url: shareUrl(token), expiresAt: link.expiresAt };
}

export async function listShareLinks(ctx: ServiceCtx, clientId: string) {
  assertCan(ctx, "client.share");
  return ctx.db
    .select({
      id: clientShareLinks.id,
      createdAt: clientShareLinks.createdAt,
      expiresAt: clientShareLinks.expiresAt,
      revokedAt: clientShareLinks.revokedAt,
      lastViewedAt: clientShareLinks.lastViewedAt,
      viewCount: clientShareLinks.viewCount,
    })
    .from(clientShareLinks)
    .where(and(eq(clientShareLinks.clientId, clientId), eq(clientShareLinks.orgId, ctx.actor.orgId), isNull(clientShareLinks.revokedAt), gte(clientShareLinks.expiresAt, ctx.now())))
    .orderBy(desc(clientShareLinks.createdAt));
}

export async function revokeShareLink(ctx: ServiceCtx, linkId: string) {
  assertCan(ctx, "client.share");
  const [link] = await ctx.db.select().from(clientShareLinks).where(and(eq(clientShareLinks.id, linkId), eq(clientShareLinks.orgId, ctx.actor.orgId)));
  if (!link) throw notFound("Link");
  if (link.revokedAt) throw invalidState("This link is already turned off.");
  await ctx.db.update(clientShareLinks).set({ revokedAt: ctx.now() }).where(eq(clientShareLinks.id, linkId));
  await audit(ctx.db, ctx, { entityType: "client", entityId: link.clientId, action: "share_link_revoked", summary: "Turned off a client link" });
}

export type ClientShareEvent = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  destination: string | null;
  coverImage: string | null;
  currency: string;
  complete: boolean;
  /** The client's share of penalties if nothing changes. */
  yourShareMinor: number;
  /** The client's share of cancellation charges if cancelled today. */
  yourCancellationMinor: number;
  nextRise: { date: Date; tz: string } | null;
  roomsGivenBack: Array<{ roomNights: number; at: Date }>;
};

export type ClientShareView =
  | { state: "invalid" | "expired" | "revoked" }
  | {
      state: "open";
      agencyName: string;
      brandColor: string;
      accentColor: string;
      clientName: string;
      asOf: Date;
      timezone: string;
      events: ClientShareEvent[];
      approvals: Array<{ number: number; title: string; eventName: string; priceMinor: number; currency: string }>;
    };

/** The public page's data. Built as the system, then cut down to one client's own figures. */
export async function getClientShareView(db: Db, token: string, now = new Date()): Promise<ClientShareView> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return { state: "invalid" };
  const [link] = await db.select().from(clientShareLinks).where(eq(clientShareLinks.tokenHash, hash(token)));
  if (!link) return { state: "invalid" };
  if (link.revokedAt) return { state: "revoked" };
  if (link.expiresAt < now) return { state: "expired" };

  const org = await orgRef(db, link.orgId);
  const ctx = await systemCtx(db, org, now);
  const [client] = await db.select().from(clients).where(eq(clients.id, link.clientId));
  const [p, deadlines, pending] = await Promise.all([getPortfolio(ctx), listObligations(ctx), listChanges(ctx, { statuses: ["SENT_TO_CLIENT"] })]);
  const rows = p.rows.filter((r) => r.clientId === link.clientId);
  const ids = rows.map((r) => r.eventId);
  const released = ids.length
    ? await db
        .select()
        .from(decisions)
        .where(and(inArray(decisions.eventId, ids), eq(decisions.type, "RELEASED_INVENTORY")))
    : [];

  // Views are counted; the audit log notes the first view each day, not every refresh.
  const firstToday = !link.lastViewedAt || localDateOf(link.lastViewedAt, org.timezone) !== localDateOf(now, org.timezone);
  await db
    .update(clientShareLinks)
    .set({ lastViewedAt: now, viewCount: link.viewCount + 1 })
    .where(eq(clientShareLinks.id, link.id));
  if (firstToday) {
    await audit(db, ctx, {
      entityType: "client",
      entityId: link.clientId,
      action: "share_link_viewed",
      actorType: "CLIENT",
      actorLabel: `${client.name} (client link)`,
      summary: `${client.name} opened their client link`,
    });
  }

  return {
    state: "open",
    agencyName: org.config.email.senderName,
    brandColor: org.config.brand.primaryColor,
    accentColor: org.config.brand.accentColor,
    clientName: client.name,
    asOf: now,
    timezone: org.timezone,
    events: rows
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((r) => {
        const rise = deadlines.find((o) => o.eventId === r.eventId && o.kind === "TIER_CHANGE" && o.dueAt >= now);
        return {
          id: r.eventId,
          name: r.name,
          startDate: r.startDate,
          endDate: r.endDate,
          destination: r.destination,
          coverImage: r.coverImage,
          currency: r.currency,
          complete: r.exposure.complete,
          yourShareMinor: r.exposure.current.clientMinor,
          yourCancellationMinor: r.exposure.cancellation.clientMinor,
          nextRise: rise ? { date: rise.dueAt, tz: rise.dueTz } : null,
          roomsGivenBack: released
            .filter((d) => d.eventId === r.eventId)
            .map((d) => ({ roomNights: ((d.detail ?? {}) as { roomNights?: number }).roomNights ?? 0, at: d.createdAt }))
            .filter((x) => x.roomNights > 0),
        };
      }),
    approvals: pending
      .filter((c) => ids.includes(c.eventId))
      .map((c) => ({ number: c.number, title: c.title, eventName: c.eventName, priceMinor: c.priceDeltaMinor, currency: c.currency })),
  };
}
