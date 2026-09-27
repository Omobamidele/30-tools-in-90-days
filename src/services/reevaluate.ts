import "server-only";
import { log } from "@/log";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { contracts } from "@/db/schema";
import { evaluateEvent } from "@/jobs/monitor";
import { orgRef } from "./alerts";

/**
 * After a change that moves exposure (pickup, forecasts, terms, activation, applied changes),
 * re-run the threshold and cutoff rules once the response has been sent (spec R4).
 */
export function reevaluateAfterResponse(orgId: string, target: { eventId?: string; contractId?: string }) {
  after(async () => {
    const db = getDb();
    let eventId = target.eventId;
    if (!eventId && target.contractId) {
      const [k] = await db.select({ eventId: contracts.eventId }).from(contracts).where(eq(contracts.id, target.contractId));
      eventId = k?.eventId;
    }
    if (!eventId) return;
    try {
      await evaluateEvent(db, await orgRef(db, orgId), eventId, new Date());
    } catch (err) {
      log.error({ err, eventId }, "re-evaluation failed");
    }
  });
}
