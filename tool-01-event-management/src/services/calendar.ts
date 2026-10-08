import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createEvents, type EventAttributes } from "ics";
import { contracts, events, obligations, suppliers, users } from "@/db/schema";
import { formatMoney } from "@/core/money";
import { audit, type DbLike, type ServiceCtx } from "./context";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Issues (or reissues) the user's secret calendar feed token. Only the hash is stored. */
export async function issueCalendarToken(ctx: ServiceCtx) {
  const token = randomBytes(32).toString("base64url");
  await ctx.db.update(users).set({ calendarTokenHash: hash(token) }).where(eq(users.id, ctx.actor.userId));
  await audit(ctx.db, ctx, { entityType: "user", entityId: ctx.actor.userId, action: "calendar_token_issued", summary: "Created a new calendar feed link (older links stop working)" });
  return token;
}

export async function hasCalendarToken(ctx: ServiceCtx) {
  const [u] = await ctx.db.select({ h: users.calendarTokenHash }).from(users).where(eq(users.id, ctx.actor.userId));
  return Boolean(u?.h);
}

/** Read-only ICS of the open deadlines a user owns. Returns null for unknown tokens. */
export async function calendarFeed(db: DbLike, token: string, appUrl: string): Promise<string | null> {
  const [user] = await db.select().from(users).where(eq(users.calendarTokenHash, hash(token)));
  if (!user || user.status !== "ACTIVE") return null;
  const rows = await db
    .select({ o: obligations, eventName: events.name, supplierName: suppliers.name })
    .from(obligations)
    .innerJoin(events, eq(events.id, obligations.eventId))
    .innerJoin(contracts, eq(contracts.id, obligations.contractId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(obligations.ownerId, user.id), eq(obligations.status, "OPEN")))
    .orderBy(asc(obligations.dueAt));

  const items: EventAttributes[] = rows.map(({ o, eventName, supplierName }) => {
    const d = o.dueAt;
    return {
      uid: `${o.id}@exposure-register`,
      start: [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()],
      startInputType: "utc",
      startOutputType: "utc",
      duration: { minutes: 30 },
      title: `${o.label}: ${eventName}`,
      description: [
        `${supplierName}`,
        o.amountMinor !== null && o.currency ? `Amount: ${formatMoney(o.amountMinor, o.currency)}` : "",
        `Due in supplier time (${o.dueTz}).`,
        `${appUrl}/events/${o.eventId}/deadlines`,
      ]
        .filter(Boolean)
        .join("\n"),
      alarms: [{ action: "display", description: o.label, trigger: { hours: 24, before: true } }],
    };
  });
  if (!items.length) {
    // An empty but valid calendar, so subscriptions keep working.
    return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:exposure-register\r\nX-WR-CALNAME:My deadlines\r\nEND:VCALENDAR\r\n";
  }
  const { error, value } = createEvents(items, { calName: "My deadlines", productId: "exposure-register" });
  if (error || !value) throw error ?? new Error("Couldn't build the calendar");
  return value;
}
