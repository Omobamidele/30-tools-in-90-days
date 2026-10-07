import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { IMPORT_COLUMNS, recentImports } from "@/services/accounts";
import { Panel } from "@/ui/page";
import { formatDateTime } from "@/ui/format";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage() {
  const ctx = await appCtx();
  const batches = await recentImports(ctx);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Accounts and subscriptions from a CSV" id="import" description="Export from your CRM or billing system. Rows are matched on crm_id (or domain) and updated in place, so re-importing is safe.">
        <div className="flex flex-col gap-3 p-4">
          <p className="text-table">
            Columns: <span className="font-mono text-meta">{IMPORT_COLUMNS.join(", ")}</span>
          </p>
          <p className="text-meta text-muted">
            Dates as YYYY-MM-DD. csm_email and owner_email must match people in this workspace. Add-ons use their keys ({ctx.actor.config.priceBook.addons.map((a) => a.key).join(", ")}), separated by semicolons. Segment keys:{" "}
            {ctx.actor.config.segments.map((s) => s.key).join(", ")}.
          </p>
          <ImportForm />
        </div>
      </Panel>
      <Panel title="Recent imports" id="recent">
        {batches.length ? (
          <ul className="divide-y divide-rule">
            {batches.map((b) => (
              <li key={b.id} className="px-4 py-2 text-table">
                <span className="font-medium">{b.filename}</span> · {b.created} new, {b.updated} updated, {b.rejected} rejected
                <span className="block text-meta text-muted">{formatDateTime(b.createdAt, ctx.actor.timezone)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-table text-muted">No imports yet. The demo accounts were created by the seed script.</p>
        )}
      </Panel>
    </div>
  );
}
