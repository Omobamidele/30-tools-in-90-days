import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { accounts, authAccounts, csqls, signals, users } from "@/db/schema";
import { ROLE_KEYS } from "@/config/schema";
import { OPEN_CSQL } from "@/core/workflow";
import { assertCan, audit, type ServiceCtx } from "./context";
import { conflict, invalidState, notFound, parseInput } from "./errors";

// People and roles (spec §9). Admins create users with a temporary password shown once;
// deactivating someone flags their open work for reassignment (spec edge case 9).

export async function listUsers(ctx: ServiceCtx) {
  return ctx.db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, preferences: users.preferences })
    .from(users)
    .where(eq(users.orgId, ctx.actor.orgId))
    .orderBy(users.name);
}

const createInput = z.object({
  name: z.string().trim().min(2, "Enter their name").max(100),
  email: z.email("Enter a valid email").toLowerCase(),
  role: z.enum(ROLE_KEYS),
});

export async function createUser(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "users.manage");
  const input = parseInput(createInput, raw);
  const [exists] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (exists) throw conflict("Someone with that email already has an account.");
  const password = randomBytes(9).toString("base64url");
  const hash = await hashPassword(password);
  const u = await ctx.db.transaction(async (tx) => {
    const [row] = await tx.insert(users).values({ ...input, orgId: ctx.actor.orgId, emailVerified: true, status: "ACTIVE" }).returning();
    await tx.insert(authAccounts).values({ accountId: row.id, providerId: "credential", userId: row.id, password: hash });
    await audit(tx, ctx, { entityType: "user", entityId: row.id, action: "created", summary: `Added ${input.name} as ${input.role}` });
    return row;
  });
  return { id: u.id, temporaryPassword: password };
}

const updateInput = z.object({ role: z.enum(ROLE_KEYS), status: z.enum(["ACTIVE", "DEACTIVATED"]) });

export async function updateUser(ctx: ServiceCtx, id: string, raw: unknown) {
  assertCan(ctx, "users.manage");
  const input = parseInput(updateInput, raw);
  if (id === ctx.actor.userId && (input.status !== "ACTIVE" || input.role !== "ADMIN")) throw invalidState("You can't remove your own admin access. Ask another admin.");
  const [u] = await ctx.db.select().from(users).where(and(eq(users.id, id), eq(users.orgId, ctx.actor.orgId)));
  if (!u) throw notFound("User");
  await ctx.db.update(users).set(input).where(eq(users.id, id));
  await audit(ctx.db, ctx, { entityType: "user", entityId: id, action: "updated", summary: `${u.name}: ${input.role}, ${input.status.toLowerCase()}` });
  if (input.status === "DEACTIVATED") {
    const [owned, book] = await Promise.all([
      ctx.db.select({ id: csqls.id }).from(csqls).where(and(eq(csqls.ownerId, id), inArray(csqls.status, OPEN_CSQL))),
      ctx.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.csmId, id)),
    ]);
    return { openCsqls: owned.length, accounts: book.length };
  }
  return { openCsqls: 0, accounts: 0 };
}

/** Work that needs a new owner because its owner left (spec edge case 9). */
export async function orphanedWork(ctx: ServiceCtx) {
  const inactive = await ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "DEACTIVATED")));
  if (!inactive.length) return { csqls: [], signals: [] };
  const ids = inactive.map((u) => u.id);
  const [c, s] = await Promise.all([
    ctx.db.select({ id: csqls.id, number: csqls.number, ownerId: csqls.ownerId }).from(csqls).where(and(eq(csqls.orgId, ctx.actor.orgId), inArray(csqls.ownerId, ids), inArray(csqls.status, OPEN_CSQL))),
    ctx.db.select({ id: signals.id }).from(signals).where(and(eq(signals.orgId, ctx.actor.orgId), inArray(signals.assigneeId, ids), inArray(signals.status, ["NEW", "SNOOZED"]))),
  ]);
  return { csqls: c, signals: s };
}

const prefsInput = z.object({ emailNotifications: z.boolean(), digest: z.boolean() });

export async function updatePreferences(ctx: ServiceCtx, raw: unknown) {
  const input = parseInput(prefsInput, raw);
  await ctx.db.update(users).set({ preferences: input }).where(eq(users.id, ctx.actor.userId));
}
