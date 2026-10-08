import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { exportConfig } from "@/services/settings";
import { DomainError } from "@/services/errors";

// Exports the organisation configuration as a config/clients/<slug>.json file (white-label).
export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response("Sign in first.", { status: 401 });
  try {
    const data = await exportConfig({
      db: getDb(),
      now: () => new Date(),
      actor: { userId: actor.userId, name: actor.name, role: actor.role, orgId: actor.org.id, orgTimezone: actor.org.timezone, baseCurrency: actor.org.baseCurrency, config: actor.org.config },
    });
    // Exported config is for a real deployment: never carry the demo flag across.
    return new Response(JSON.stringify({ ...data, config: { ...data.config, demo: false } }, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${data.slug}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof DomainError && e.code === "FORBIDDEN") return new Response("Only admins and managing directors can export settings.", { status: 403 });
    throw e;
  }
}
