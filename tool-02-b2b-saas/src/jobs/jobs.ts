import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { localDate } from "@/core/business-time";
import { runDetection, type DetectionSummary } from "@/services/detection";
import { runReminders } from "@/services/reminders";
import { deliverDueWebhooks } from "@/services/webhooks";
import { sendWeeklyDigests } from "@/services/digest";
import { systemCtxForOrg } from "@/services/system-ctx";
import { log } from "@/log";

// Scheduled work (spec §8, architecture §8). Every job is idempotent: detection refreshes rather
// than duplicates, reminders and digests are deduplicated, webhook deliveries are claimed.

async function forEachOrg<T>(db: Db, now: Date, fn: (orgId: string) => Promise<T>) {
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  const out: Record<string, T | { error: string }> = {};
  for (const o of orgs) {
    try {
      out[o.name] = await fn(o.id);
    } catch (err) {
      log.error({ err, org: o.id }, "job failed for organisation");
      out[o.name] = { error: err instanceof Error ? err.message : "failed" };
    }
  }
  return out;
}

export async function runDaily(db: Db, now = new Date()) {
  return forEachOrg<DetectionSummary>(db, now, async (orgId) => runDetection(await systemCtxForOrg(db, orgId, () => now)));
}

export async function runHourly(db: Db, now = new Date()) {
  const reminders = await forEachOrg(db, now, async (orgId) => runReminders(await systemCtxForOrg(db, orgId, () => now)));
  const webhooks = await deliverDueWebhooks(db, now);
  return { reminders, webhooks };
}

export async function runWeekly(db: Db, now = new Date()) {
  return forEachOrg(db, now, async (orgId) => sendWeeklyDigests(await systemCtxForOrg(db, orgId, () => now)));
}

/** Local hour and weekday for an org, so a single hourly tick can trigger 06:00 and Monday 07:00 jobs. */
export async function dueOrgs(db: Db, now: Date) {
  const orgs = await db.select({ id: organizations.id, timezone: organizations.timezone }).from(organizations);
  return orgs.map((o) => {
    const hour = Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: o.timezone }));
    const weekday = new Date(`${localDate(now, o.timezone)}T12:00:00Z`).getUTCDay();
    return { id: o.id, daily: hour === 6, weekly: weekday === 1 && hour === 7 };
  });
}
