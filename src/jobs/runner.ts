import "dotenv/config";
import cron from "node-cron";
import { getDb } from "@/db/client";
import { runDaily, runHourly, runWeekly } from "./monitor";

// Local scheduler with the same schedules as production (docs/05 §9).
// Daily runs at 06:00 in the organisation timezone of the first org (single-tenant deployments).
const tz = process.env.JOBS_TIMEZONE ?? "America/New_York";

cron.schedule(
  "0 6 * * *",
  async () => {
    console.log(new Date().toISOString(), "daily", await runDaily(getDb()));
  },
  { timezone: tz },
);
// The Monday money brief, 07:00 on Mondays in the same timezone.
cron.schedule(
  "0 7 * * 1",
  async () => {
    console.log(new Date().toISOString(), "weekly", await runWeekly(getDb()));
  },
  { timezone: tz },
);
cron.schedule("5 * * * *", async () => {
  console.log(new Date().toISOString(), "hourly", await runHourly(getDb()));
});

console.log(`Jobs scheduled: daily 06:00, Monday brief 07:00 Mondays (${tz}), hourly at :05. Ctrl+C to stop.`);
