import type { Metadata } from "next";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { listChanges } from "@/services/changes";
import { ButtonLink, EmptyState, Panel } from "@/ui/page";
import { loadEvent } from "../load";
import { ChangeTable } from "../../../changes/change-table";

export const metadata: Metadata = { title: "Changes" };

export default async function EventChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, scope } = await loadEvent(id);
  const rows = await listChanges(ctx, { eventId: id });
  const cfg = ctx.actor.config;
  const canRaise = can(ctx.actor, "change.raise", scope);
  const raise = canRaise ? (
    <ButtonLink href={`/events/${id}/changes/new`} variant={rows.length ? "secondary" : "primary"} size={rows.length ? "sm" : "md"}>
      Raise {term(cfg, "changeRequest", { lower: true })}
    </ButtonLink>
  ) : null;
  return (
    <Panel title={term(cfg, "changeRequest", { plural: true })} description="Every priced change, its approvals and what it did to exposure." actions={rows.length ? raise : null}>
      {rows.length ? (
        <ChangeTable rows={rows} showEvent={false} />
      ) : (
        <EmptyState title="No changes yet" actions={raise}>
          When scope or headcount changes, raise it here so it&apos;s priced, approved and reflected in exposure.
        </EmptyState>
      )}
    </Panel>
  );
}
