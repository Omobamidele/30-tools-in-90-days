import type { VercelConfig } from "@vercel/config/v1";

// Production schedules for the monitoring jobs (docs/05 §9). Vercel Cron runs in UTC and
// calls these routes with `Authorization: Bearer $CRON_SECRET`.
// Daily: 10:00 UTC = 06:00 New York (EDT). Set it to 06:00 in the client's timezone per deployment.
// Both jobs are idempotent, so an extra or late run is harmless.
export const config: VercelConfig = {
  framework: "nextjs",
  crons: [
    { path: "/api/cron/daily", schedule: "0 10 * * *" },
    { path: "/api/cron/hourly", schedule: "5 * * * *" },
  ],
};
