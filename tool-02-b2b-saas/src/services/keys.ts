import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { apiKeys } from "@/db/schema";
import { assertCan, audit, type ServiceCtx } from "./context";
import { notFound, parseInput } from "./errors";

// API keys for the ingest and CRM endpoints (NFR-3): only a SHA-256 hash is stored, the full
// key is shown once, and keys can be revoked. The visible prefix identifies a key in lists.

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

const keyInput = z.object({
  kind: z.enum(["INGEST", "CRM"]),
  name: z.string().trim().min(1, "Name the key, for example: Warehouse nightly job").max(80),
});

export async function createApiKey(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "integrations.manage");
  const input = parseInput(keyInput, raw);
  const token = `esd_${input.kind === "INGEST" ? "ingest" : "crm"}_${randomBytes(24).toString("base64url")}`;
  const prefix = token.slice(0, 16);
  const [k] = await ctx.db.insert(apiKeys).values({ orgId: ctx.actor.orgId, kind: input.kind, name: input.name, prefix, hash: hash(token), createdBy: ctx.actor.userId }).returning();
  await audit(ctx.db, ctx, { entityType: "api_key", entityId: k.id, action: "created", summary: `Created ${input.kind.toLowerCase()} key "${input.name}"` });
  return { id: k.id, token, prefix };
}

export async function listApiKeys(ctx: ServiceCtx) {
  assertCan(ctx, "integrations.manage");
  return ctx.db
    .select({ id: apiKeys.id, kind: apiKeys.kind, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.orgId, ctx.actor.orgId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(ctx: ServiceCtx, id: string) {
  assertCan(ctx, "integrations.manage");
  const [k] = await ctx.db
    .update(apiKeys)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, ctx.actor.orgId), isNull(apiKeys.revokedAt)))
    .returning();
  if (!k) throw notFound("Key");
  await audit(ctx.db, ctx, { entityType: "api_key", entityId: id, action: "revoked", summary: `Revoked key "${k.name}"` });
}

/** Resolves a bearer token to its org, or null. Revoked and wrong-kind keys are rejected. */
export async function resolveApiKey(db: Db, header: string | null, kind: "INGEST" | "CRM", now = new Date()) {
  const token = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const [k] = await db.select().from(apiKeys).where(eq(apiKeys.hash, hash(token)));
  if (!k || k.revokedAt || k.kind !== kind) return null;
  await db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, k.id));
  return { keyId: k.id, orgId: k.orgId };
}
