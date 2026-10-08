import type { RoleKey } from "@/config/schema";

// Permission matrix (spec §9). Used by services (enforcement) and UI (visibility),
// so what a user sees and what the server allows can't drift apart.

export type Action =
  | "portfolio.view"
  | "event.create"
  | "event.view"
  | "event.edit"
  | "contract.edit"
  | "pickup.edit"
  | "payment.record"
  | "penalty.record"
  | "change.raise"
  | "decision.record"
  | "client.view"
  | "client.edit"
  | "client.share"
  | "supplier.edit"
  | "settings.view"
  | "settings.edit";

export type PolicyActor = { userId: string; role: RoleKey; internalApproverRoles?: RoleKey[] };
export type EventScope = { ownerId: string; memberIds: string[] };

const ALL: RoleKey[] = ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER", "FINANCE", "MD"];

// Roles allowed an action on any event. EVENT_MANAGER is handled by event scope.
const matrix: Record<Action, RoleKey[]> = {
  "portfolio.view": ["ADMIN", "OPS_DIRECTOR", "FINANCE", "MD"],
  "event.create": ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER"],
  "event.view": ["ADMIN", "OPS_DIRECTOR", "FINANCE", "MD"],
  "event.edit": ["ADMIN", "OPS_DIRECTOR"],
  "contract.edit": ["ADMIN", "OPS_DIRECTOR"],
  "pickup.edit": ["ADMIN", "OPS_DIRECTOR"],
  "payment.record": ["ADMIN", "OPS_DIRECTOR", "FINANCE"],
  "penalty.record": ["ADMIN", "OPS_DIRECTOR", "FINANCE"],
  "change.raise": ["ADMIN", "OPS_DIRECTOR", "MD"],
  "decision.record": ["ADMIN", "OPS_DIRECTOR", "FINANCE", "MD"],
  "client.view": ALL,
  "client.edit": ["ADMIN", "OPS_DIRECTOR", "FINANCE", "MD"],
  // A client link shows every event for that client, so only roles that see the whole portfolio.
  "client.share": ["ADMIN", "OPS_DIRECTOR", "FINANCE", "MD"],
  "supplier.edit": ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER"],
  "settings.view": ["ADMIN", "MD"],
  "settings.edit": ["ADMIN"],
};

// Actions an EVENT_MANAGER may take on events they own or are a member of.
const eventManagerOnOwnEvents = new Set<Action>([
  "event.view",
  "event.edit",
  "contract.edit",
  "pickup.edit",
  "change.raise",
  "decision.record",
]);

export function can(actor: PolicyActor, action: Action, event?: EventScope): boolean {
  if (matrix[action].includes(actor.role)) return true;
  if (actor.role === "EVENT_MANAGER" && event && eventManagerOnOwnEvents.has(action)) {
    return event.ownerId === actor.userId || event.memberIds.includes(actor.userId);
  }
  return false;
}

export function canApproveInternally(actor: PolicyActor): boolean {
  return (actor.internalApproverRoles ?? ["MD", "OPS_DIRECTOR"]).includes(actor.role);
}

/** Whether list queries must be restricted to the actor's own/team events. */
export function restrictedToOwnEvents(actor: PolicyActor): boolean {
  return !can(actor, "event.view");
}
