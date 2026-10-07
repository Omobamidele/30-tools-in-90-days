import type { Db } from "@/db/client";
import type { OrgConfig, RoleKey } from "@/config/schema";
import { activityLog } from "@/db/schema";
import { can, type Action } from "@/auth/policy";
import { forbidden } from "./errors";

// Everything a service needs about who is acting. Built from the session in the app, or
// directly in tests and jobs. Every query filters by `orgId`.
export type ServiceCtx = {
  db: Db;
  actor: { userId: string; name: string; role: RoleKey; orgId: string; timezone: string; currency: string; config: OrgConfig };
  now: () => Date;
};

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export function assertCan(ctx: ServiceCtx, action: Action) {
  if (!can(ctx.actor, action)) throw forbidden();
}

export async function audit(
  db: DbLike,
  ctx: ServiceCtx,
  entry: { entityType: string; entityId: string; accountId?: string | null; action: string; summary: string; data?: unknown; actorType?: "USER" | "SYSTEM" | "API"; actorLabel?: string },
) {
  await db.insert(activityLog).values({
    orgId: ctx.actor.orgId,
    actorType: entry.actorType ?? "USER",
    actorId: entry.actorType && entry.actorType !== "USER" ? null : ctx.actor.userId,
    actorLabel: entry.actorLabel ?? ctx.actor.name,
    entityType: entry.entityType,
    entityId: entry.entityId,
    accountId: entry.accountId ?? null,
    action: entry.action,
    summary: entry.summary,
    data: entry.data ?? null,
    at: ctx.now(),
  });
}
