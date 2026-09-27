import { getDb } from "@/db/client";
import { env } from "@/env";
import { runDaily, runHourly, runWeekly } from "@/jobs/monitor";

// Scheduled jobs (Vercel Cron in production, `npm run jobs` locally). Bearer-protected;
// idempotent, so a retried or duplicated call changes nothing.
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { job } = await params;
  const started = Date.now();
  if (job === "daily") {
    const summary = await runDaily(getDb());
    return Response.json({ job, ms: Date.now() - started, ...summary });
  }
  if (job === "hourly") {
    const summary = await runHourly(getDb());
    return Response.json({ job, ms: Date.now() - started, ...summary });
  }
  if (job === "weekly") {
    const summary = await runWeekly(getDb());
    return Response.json({ job, ms: Date.now() - started, ...summary });
  }
  return new Response("Unknown job", { status: 404 });
}
