import "server-only";
import type { ServiceCtx } from "@/services/context";
import { listClients } from "@/services/clients";
import { listOrgUsers } from "@/services/events";

export function timezones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

export async function eventFormOptions(ctx: ServiceCtx) {
  const [clients, users] = await Promise.all([listClients(ctx), listOrgUsers(ctx)]);
  return {
    clients: clients.map((c) => ({ id: c.id, name: c.name })),
    users: users.map((u) => ({ id: u.id, name: u.name })),
    eventTypes: ctx.actor.config.workflow.eventTypes,
    currencies: ctx.actor.config.finance.enabledCurrencies,
    timezones: timezones(),
  };
}
