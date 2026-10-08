import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { getDb } from "@/db/client";
import { organizations, users } from "@/db/schema";
import { orgConfigSchema, type OrgConfig, type RoleKey } from "@/config/schema";

export type Actor = {
  userId: string;
  name: string;
  email: string;
  role: RoleKey;
  org: { id: string; name: string; slug: string; currency: string; timezone: string; config: OrgConfig };
};

// Resolves the signed-in user with their organisation and validated config.
// Cached per request so layouts, pages and actions share one lookup.
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await getDb()
    .select({ user: users, org: organizations })
    .from(users)
    .innerJoin(organizations, eq(users.orgId, organizations.id))
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row || row.user.status !== "ACTIVE") return null;
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.user.role,
    org: { id: row.org.id, name: row.org.name, slug: row.org.slug, currency: row.org.currency, timezone: row.org.timezone, config: orgConfigSchema.parse(row.org.config) },
  };
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  return actor;
}
