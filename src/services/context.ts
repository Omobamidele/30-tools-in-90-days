import type { Db } from "@/db/client";
import type { OrgConfig, RoleKey } from "@/config/schema";
import { activityLog } from "@/db/schema";
import { can, type Action, type EventScope } from "@/auth/policy";
import { forbidden } from "./errors";

// Everything a service needs about who is acting. Built from the session in the app,
// or directly in tests and jobs. Every query filters by `orgId`.
export type ServiceCtx = {
  db: Db;
  actor: {
    userId: string;
    name: string;
    role: RoleKey;
    orgId: string;
    orgTimezone: string;
    baseCurrency: string;
    config: OrgConfig;
  };
  now: () => Date;
};

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbLike = Db | Tx;

export function assertCan(ctx: ServiceCtx, action: Action, event?: EventScope) {
  if (!can({ ...ctx.actor, internalApproverRoles: ctx.actor.config.rules.internalApproverRoles }, action, event)) {
    throw forbidden();
  }
}

export async function audit(
  db: DbLike,
  ctx: ServiceCtx,
  entry: {
    entityType: string;
    entityId: string;
    eventId?: string | null;
    action: string;
    summary: string;
    diff?: unknown;
    actorType?: "USER" | "CLIENT" | "SYSTEM";
    actorLabel?: string;
  },
) {
  await db.insert(activityLog).values({
    orgId: ctx.actor.orgId,
    actorType: entry.actorType ?? "USER",
    actorId: entry.actorType && entry.actorType !== "USER" ? null : ctx.actor.userId,
    actorLabel: entry.actorLabel ?? ctx.actor.name,
    entityType: entry.entityType,
    entityId: entry.entityId,
    eventId: entry.eventId ?? null,
    action: entry.action,
    summary: entry.summary,
    diff: entry.diff ?? null,
    at: ctx.now(),
  });
}

/** Field-level before → after for the audit log, only for fields that changed. */
export function changes<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (v !== undefined && JSON.stringify(before[k]) !== JSON.stringify(v)) out[k] = { from: before[k], to: v };
  }
  return out;
}
