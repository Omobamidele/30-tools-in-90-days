import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { resolveApiKey } from "@/services/keys";
import { applyCrmUpdate } from "@/services/csqls";
import { systemCtxForOrg } from "@/services/system-ctx";
import { DomainError } from "@/services/errors";
import { clientIp, isRateLimited } from "@/services/rate-limit";
import { log, newRef } from "@/log";

// CRM inbound (spec FR-28): { csql | crmRef, amount?, outcome?: "WON" | "LOST", reason? }.
export async function POST(req: Request) {
  const h = await headers();
  if (isRateLimited(`crm-ip:${clientIp(h)}`, 120, 60_000)) return Response.json({ error: "Too many requests." }, { status: 429 });
  const db = getDb();
  const key = await resolveApiKey(db, req.headers.get("authorization"), "CRM");
  if (!key) return Response.json({ error: "Missing or invalid CRM key (Authorization: Bearer esd_crm_…)." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  try {
    const ctx = await systemCtxForOrg(db, key.orgId);
    ctx.actor.name = "CRM";
    return Response.json(await applyCrmUpdate(ctx, body));
  } catch (err) {
    if (err instanceof DomainError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "VALIDATION_FAILED" ? 400 : 409;
      return Response.json({ error: err.message, fields: err.fieldErrors }, { status });
    }
    const ref = newRef();
    log.error({ err, ref }, "crm update failed");
    return Response.json({ error: `Update failed. Quote reference ${ref}.` }, { status: 500 });
  }
}
