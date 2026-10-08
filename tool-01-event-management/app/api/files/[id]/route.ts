import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadFileForDownload } from "@/services/documents";
import { DomainError, isNotFound } from "@/services/errors";
import type { ServiceCtx } from "@/services/context";

// Private files are only ever served here, after an authorisation check. Never public URLs.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in to view this file.", { status: 401 });
  const ctx: ServiceCtx = {
    db: getDb(),
    now: () => new Date(),
    actor: {
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      orgId: actor.org.id,
      orgTimezone: actor.org.timezone,
      baseCurrency: actor.org.baseCurrency,
      config: actor.org.config,
    },
  };
  const { id } = await params;
  try {
    const { file, data } = await loadFileForDownload(ctx, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(data.length),
        "Content-Disposition": `inline; filename="${file.filename.replace(/[^\w.\- ]/g, "_")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    if (isNotFound(e) || (e instanceof DomainError && e.code === "FORBIDDEN")) {
      return new Response("File not found.", { status: 404 });
    }
    throw e;
  }
}
