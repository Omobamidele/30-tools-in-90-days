import { getDb } from "@/db/client";
import { env } from "@/env";
import { runDaily, runHourly, runWeekly } from "@/jobs/jobs";

// Scheduled jobs (Vercel Cron when hosted, `npm run jobs` locally). Bearer-protected and
// idempotent, so a retried or duplicated call changes nothing.
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const { job } = await params;
  const run = job === "daily" ? runDaily : job === "hourly" ? runHourly : job === "weekly" ? runWeekly : null;
  if (!run) return new Response("Unknown job", { status: 404 });
  const started = Date.now();
  const result = await run(getDb());
  return Response.json({ job, ms: Date.now() - started, result });
}
