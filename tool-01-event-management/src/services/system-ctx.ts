import { and, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { Db } from "@/db/client";
import type { ServiceCtx } from "./context";
import { orgRef, type OrgRef } from "./alerts";

// Work that no signed-in person is doing at that moment (scheduled jobs, queued term
// extraction, inbound hotel reports) runs as the organisation's administrator. Audit entries
// written by these paths set actorType SYSTEM and a label, so the log shows what really acted.

export async function systemCtx(db: Db, org: OrgRef, now: Date): Promise<ServiceCtx> {
  const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, org.id), eq(users.role, "ADMIN"))).limit(1);
  return {
    db,
    now: () => now,
    actor: { userId: admin?.id ?? "", name: "System", role: "ADMIN", orgId: org.id, orgTimezone: org.timezone, baseCurrency: org.baseCurrency, config: org.config },
  };
}

export async function systemCtxForOrg(db: Db, orgId: string, now: Date): Promise<ServiceCtx> {
  return systemCtx(db, await orgRef(db, orgId), now);
}
