import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { orgConfigSchema } from "@/config/schema";
import { and } from "drizzle-orm";
import type { ServiceCtx } from "./context";

/**
 * Context for work no person does: scheduled jobs and API calls. It acts with admin rights,
 * records activity as SYSTEM, and uses the org's first active admin only as a technical owner.
 */
export async function systemCtxForOrg(db: Db, orgId: string, now: () => Date = () => new Date()): Promise<ServiceCtx> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.role, "ADMIN")));
  return {
    db,
    now,
    actor: { userId: admin?.id ?? "00000000-0000-0000-0000-000000000000", name: "System", role: "ADMIN", orgId, timezone: org.timezone, currency: org.currency, config: orgConfigSchema.parse(org.config) },
  };
}
