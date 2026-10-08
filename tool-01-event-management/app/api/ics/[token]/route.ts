import { getDb } from "@/db/client";
import { env } from "@/env";
import { calendarFeed } from "@/services/calendar";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await calendarFeed(getDb(), token.replace(/\.ics$/, ""), env().APP_URL);
  if (body === null) return new Response("Calendar not found.", { status: 404 });
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
}
