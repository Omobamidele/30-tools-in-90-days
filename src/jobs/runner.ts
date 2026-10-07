import "dotenv/config";
import cron from "node-cron";
import { getDb } from "@/db/client";
import { log } from "@/log";
import { dueOrgs, runDaily, runHourly, runWeekly } from "./jobs";

// Local scheduler (`npm run jobs`). Hosted deployments call /api/cron/* from Vercel Cron instead.
// One tick at the top of every hour: reminders and webhooks always; detection at 06:00 and the
// digest at 07:00 on Mondays, each in the organisation's own time zone.
cron.schedule("0 * * * *", async () => {
  const db = getDb();
  const now = new Date();
  try {
    const due = await dueOrgs(db, now);
    if (due.some((d) => d.daily)) log.info({ daily: await runDaily(db, now) }, "daily detection");
    if (due.some((d) => d.weekly)) log.info({ weekly: await runWeekly(db, now) }, "weekly digest");
    log.info({ hourly: await runHourly(db, now) }, "hourly jobs");
  } catch (err) {
    log.error({ err }, "scheduled run failed");
  }
});
log.info("Job runner started: hourly tick (detection 06:00, digest Mondays 07:00, org time)");
