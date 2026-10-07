import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { notifications, users } from "@/db/schema";
import { emailSender, renderEmail } from "@/adapters/email";
import { env } from "@/env";
import { log } from "@/log";
import type { DbLike, ServiceCtx } from "./context";

export type NotificationKind = "routed" | "returned" | "reassigned" | "deadline" | "escalation" | "won" | "signal" | "ingest";

type Prefs = { emailNotifications?: boolean; digest?: boolean };

/**
 * In-app notification plus email (spec FR-25). A dedupe key makes reminders idempotent: the
 * hourly job can run twice without sending twice. Email failures never fail the action;
 * the status is stored on the notification.
 */
export async function notify(
  db: DbLike,
  ctx: ServiceCtx,
  n: { userId: string; kind: NotificationKind; title: string; body?: string; link?: string; dedupeKey?: string; email?: boolean },
): Promise<boolean> {
  const [row] = await db
    .insert(notifications)
    .values({ orgId: ctx.actor.orgId, userId: n.userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null, createdAt: ctx.now() })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  if (!row) return false;
  if (n.email === false) return true;
  const [u] = await db.select({ email: users.email, name: users.name, preferences: users.preferences, status: users.status }).from(users).where(eq(users.id, n.userId));
  if (!u || u.status !== "ACTIVE" || (u.preferences as Prefs).emailNotifications === false) return true;
  const brand = ctx.actor.config.brand;
  const { text, html } = renderEmail({
    productName: brand.productName,
    brandColor: brand.primaryColor,
    heading: n.title,
    lines: n.body ? [n.body] : [],
    action: n.link ? { label: "Open", url: `${env().APP_URL}${n.link}` } : undefined,
    footer: `You get these because you work in ${brand.productName}. Turn email off under Your account.`,
  });
  // Sent after the transaction commits would be ideal; a failed send is recorded, not thrown.
  emailSender()
    .send({ to: u.email, subject: n.title, text, html, fromName: brand.productName })
    .then((r) => db.update(notifications).set({ emailStatus: r.sent ? "sent" : `failed: ${r.reason}` }).where(eq(notifications.id, row.id)))
    .catch((err) => log.warn({ err }, "notification email failed"));
  return true;
}

export async function listNotifications(ctx: ServiceCtx, limit = 30) {
  return ctx.db.select().from(notifications).where(eq(notifications.userId, ctx.actor.userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(ctx: ServiceCtx) {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.actor.userId), isNull(notifications.readAt)));
  return r.n;
}

export async function markAllRead(ctx: ServiceCtx) {
  await ctx.db.update(notifications).set({ readAt: ctx.now() }).where(and(eq(notifications.userId, ctx.actor.userId), isNull(notifications.readAt)));
}
