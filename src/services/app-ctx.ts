import "server-only";
import { requireActor } from "@/auth/session";
import { getDb } from "@/db/client";
import type { ServiceCtx } from "./context";

/** Service context for the signed-in user (pages and server actions). */
export async function appCtx(): Promise<ServiceCtx> {
  const actor = await requireActor();
  return {
    db: getDb(),
    now: () => new Date(),
    actor: { userId: actor.userId, name: actor.name, role: actor.role, orgId: actor.org.id, timezone: actor.org.timezone, currency: actor.org.currency, config: actor.org.config },
  };
}
