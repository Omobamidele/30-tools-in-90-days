import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notifications, users } from "@/db/schema";
import { emailSender, renderEmail } from "@/adapters/email";
import type { OrgConfig, RoleKey } from "@/config/schema";
import { env } from "@/env";
import type { DbLike, ServiceCtx } from "./context";

export type NotificationInput = {
  kind: "reminder" | "escalation" | "alert" | "approval" | "change" | "prompt" | "extraction" | "mention" | "brief" | "pickup";
  title: string;
  body?: string;
  link?: string;
  /** Unique per user: re-running a job never notifies twice (spec §5 reliability). */
  dedupeKey: string;
};

/**
 * Creates in-app notifications (deduplicated) and emails them when email is set up.
 * Returns how many were newly created.
 */
export async function notify(db: DbLike, org: { id: string; config: OrgConfig }, userIds: string[], n: NotificationInput) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return 0;
  const created = await db
    .insert(notifications)
    .values(unique.map((userId) => ({ orgId: org.id, userId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, dedupeKey: n.dedupeKey })))
    .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
    .returning();
  if (!created.length) return 0;

  const sender = emailSender();
  if (sender.driver !== "disabled") {
    const recipients = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, created.map((c) => c.userId)));
    const base = env().APP_URL;
    for (const c of created) {
      const to = recipients.find((r) => r.id === c.userId)?.email;
      if (!to) continue;
      const { text, html } = renderEmail({
        productName: org.config.brand.productName,
        brandColor: org.config.brand.primaryColor,
        heading: c.title,
        lines: c.body ? c.body.split("\n") : [],
        action: c.link ? { label: "Open", url: `${base}${c.link}` } : undefined,
      });
      const res = await sender.send({ to, subject: c.title, text, html, fromName: org.config.email.senderName, replyTo: org.config.email.replyTo });
      await db
        .update(notifications)
        .set(res.sent ? { emailedAt: new Date() } : { emailError: res.reason })
        .where(eq(notifications.id, c.id));
    }
  }
  return created.length;
}

export async function usersWithRoles(db: DbLike, orgId: string, roles: RoleKey[]) {
  if (!roles.length) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.status, "ACTIVE"), inArray(users.role, roles)));
  return rows.map((r) => r.id);
}

export async function listMyNotifications(ctx: ServiceCtx, limit = 30) {
  const rows = await ctx.db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, ctx.actor.userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ unread }] = await ctx.db
    .select({ unread: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, ctx.actor.userId), isNull(notifications.readAt)));
  return { rows, unread };
}

export async function markNotificationsRead(ctx: ServiceCtx, ids?: string[]) {
  await ctx.db
    .update(notifications)
    .set({ readAt: ctx.now() })
    .where(
      and(
        eq(notifications.userId, ctx.actor.userId),
        isNull(notifications.readAt),
        ids?.length ? inArray(notifications.id, ids) : undefined,
      ),
    );
}
