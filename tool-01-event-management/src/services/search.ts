import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { changeRequests, clients, contracts, events, suppliers } from "@/db/schema";
import type { ServiceCtx } from "./context";
import { listEvents } from "./events";

export type SearchHit = { kind: "event" | "client" | "supplier" | "contract" | "change"; id: string; title: string; subtitle: string; href: string };

/** Global search across records the actor can see. */
export async function search(ctx: ServiceCtx, raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const visible = await listEvents(ctx);
  const eventIds = visible.map((e) => e.id);
  const hits: SearchHit[] = [];

  for (const e of visible.filter((e) => [e.name, e.clientName, e.destination ?? ""].some((s) => s.toLowerCase().includes(q.toLowerCase()))).slice(0, 8)) {
    hits.push({ kind: "event", id: e.id, title: e.name, subtitle: `${e.clientName} · ${e.startDate}`, href: `/events/${e.id}` });
  }

  const [clientRows, supplierRows, contractRows, changeRows] = await Promise.all([
    ctx.db.select().from(clients).where(and(eq(clients.orgId, ctx.actor.orgId), ilike(clients.name, like))).limit(5),
    ctx.db.select().from(suppliers).where(and(eq(suppliers.orgId, ctx.actor.orgId), or(ilike(suppliers.name, like), ilike(suppliers.city, like)))).limit(5),
    eventIds.length
      ? ctx.db
          .select({ id: contracts.id, title: contracts.title, reference: contracts.reference, supplierName: suppliers.name, eventName: events.name })
          .from(contracts)
          .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
          .innerJoin(events, eq(events.id, contracts.eventId))
          .where(and(inArray(contracts.eventId, eventIds), or(ilike(contracts.title, like), ilike(contracts.reference, like), ilike(suppliers.name, like))))
          .limit(8)
      : Promise.resolve([]),
    eventIds.length
      ? ctx.db
          .select({ id: changeRequests.id, number: changeRequests.number, title: changeRequests.title, eventName: events.name })
          .from(changeRequests)
          .innerJoin(events, eq(events.id, changeRequests.eventId))
          .where(
            and(
              inArray(changeRequests.eventId, eventIds),
              /^cr-?\d+$/i.test(q) ? eq(changeRequests.number, Number(q.replace(/\D/g, ""))) : ilike(changeRequests.title, like),
            ),
          )
          .limit(5)
      : Promise.resolve([]),
  ]);

  for (const c of clientRows) hits.push({ kind: "client", id: c.id, title: c.name, subtitle: c.industry ?? "Client", href: `/clients/${c.id}` });
  for (const s of supplierRows) hits.push({ kind: "supplier", id: s.id, title: s.name, subtitle: [s.city, s.country].filter(Boolean).join(", ") || "Supplier", href: `/suppliers` });
  for (const k of contractRows) hits.push({ kind: "contract", id: k.id, title: `${k.supplierName}: ${k.title}`, subtitle: `${k.eventName}${k.reference ? ` · ${k.reference}` : ""}`, href: `/contracts/${k.id}` });
  for (const c of changeRows) hits.push({ kind: "change", id: c.id, title: `CR-${c.number} ${c.title}`, subtitle: c.eventName, href: `/changes/${c.id}` });
  return hits;
}
