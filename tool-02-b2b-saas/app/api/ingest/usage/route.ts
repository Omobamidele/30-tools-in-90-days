import { after } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { resolveApiKey } from "@/services/keys";
import { ingestUsage, MAX_ROWS } from "@/services/ingest";
import { runDetection } from "@/services/detection";
import { systemCtxForOrg } from "@/services/system-ctx";
import { clientIp, isRateLimited } from "@/services/rate-limit";
import { log, newRef } from "@/log";

// Usage ingest API (spec FR-2). Bearer INGEST key; JSON { rows: [...] }; up to 5,000 rows.
// One bad row never rejects the batch. Detection runs for the affected accounts afterwards.
export async function POST(req: Request) {
  const h = await headers();
  if (isRateLimited(`ingest-ip:${clientIp(h)}`, 120, 60_000)) return Response.json({ error: "Too many requests; slow down." }, { status: 429 });
  const db = getDb();
  const key = await resolveApiKey(db, req.headers.get("authorization"), "INGEST");
  if (!key) return Response.json({ error: "Missing or invalid ingest key (Authorization: Bearer esd_ingest_…)." }, { status: 401 });
  if (isRateLimited(`ingest-key:${key.keyId}`, 60, 60_000)) return Response.json({ error: "Too many requests for this key; slow down." }, { status: 429 });
  let body: { rows?: unknown; source?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON: { "rows": [ ... ] }' }, { status: 400 });
  }
  if (!Array.isArray(body?.rows)) return Response.json({ error: "Body must have a rows array." }, { status: 400 });
  if (body.rows.length > MAX_ROWS) return Response.json({ error: `Send at most ${MAX_ROWS} rows per request.` }, { status: 413 });
  // The demo simulator marks its rows so the interface can label them; real feeds are API.
  const source = body.source === "SIMULATED" ? "SIMULATED" : "API";
  try {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, key.orgId));
    const result = await ingestUsage(db, { id: org.id, timezone: org.timezone }, body.rows, source, { keyId: key.keyId });
    if (result.accountIds.length) {
      after(async () => {
        try {
          await runDetection(await systemCtxForOrg(db, org.id), { accountIds: result.accountIds });
        } catch (err) {
          log.error({ err }, "detection after ingest failed");
        }
      });
    }
    return Response.json({ batchId: result.batchId, accepted: result.accepted, rejected: result.rejected });
  } catch (err) {
    const ref = newRef();
    log.error({ err, ref }, "ingest failed");
    return Response.json({ error: `Ingest failed. Quote reference ${ref}.` }, { status: 500 });
  }
}
