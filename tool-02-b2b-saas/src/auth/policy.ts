import type { RoleKey } from "@/config/schema";

// The permission matrix from spec §9. Role-level checks live here; "own book" scoping
// (a CSM's accounts, a seller's CSQLs) is applied by the services in their queries too.

export type Action =
  | "signal.triage"
  | "signal.reassign"
  | "csql.work"
  | "csql.reassign"
  | "account.edit"
  | "rules.manage"
  | "settings.manage"
  | "integrations.manage"
  | "users.manage"
  | "results.view";

const MATRIX: Record<Action, RoleKey[]> = {
  "signal.triage": ["ADMIN", "CS_LEAD", "CSM"],
  "signal.reassign": ["ADMIN", "CS_LEAD"],
  "csql.work": ["ADMIN", "SALES_LEAD", "SELLER"],
  "csql.reassign": ["ADMIN", "SALES_LEAD"],
  "account.edit": ["ADMIN", "REVOPS", "CS_LEAD", "CSM"],
  "rules.manage": ["ADMIN", "REVOPS"],
  "settings.manage": ["ADMIN", "REVOPS"],
  "integrations.manage": ["ADMIN", "REVOPS"],
  "users.manage": ["ADMIN"],
  "results.view": ["ADMIN", "REVOPS", "CS_LEAD", "CSM", "SALES_LEAD", "SELLER", "EXEC"],
};

export type ActorLike = { userId: string; role: RoleKey };

export function can(actor: ActorLike, action: Action): boolean {
  return MATRIX[action].includes(actor.role);
}

/** Roles that see every account; CSMs see their own book, sellers the accounts they work. */
export const SEES_ALL: RoleKey[] = ["ADMIN", "REVOPS", "CS_LEAD", "SALES_LEAD", "EXEC"];

export function canTriage(actor: ActorLike, account: { csmId: string | null }): boolean {
  if (!can(actor, "signal.triage")) return false;
  if (actor.role === "CSM") return account.csmId === actor.userId;
  return true;
}

export function canWorkCsql(actor: ActorLike, csql: { ownerId: string | null }): boolean {
  if (!can(actor, "csql.work")) return false;
  if (actor.role === "SELLER") return csql.ownerId === actor.userId;
  return true;
}

export function canEditAccount(actor: ActorLike, account: { csmId: string | null }): boolean {
  if (!can(actor, "account.edit")) return false;
  if (actor.role === "CSM") return account.csmId === actor.userId;
  return true;
}

export const ROLE_LABELS: Record<RoleKey, string> = {
  ADMIN: "Admin",
  REVOPS: "RevOps",
  CS_LEAD: "CS leader",
  CSM: "Customer success manager",
  SALES_LEAD: "Sales leader",
  SELLER: "Account manager",
  EXEC: "Executive (read-only)",
};
