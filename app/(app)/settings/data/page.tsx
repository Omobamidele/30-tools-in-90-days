import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listApiKeys } from "@/services/keys";
import { ingestLog } from "@/services/settings";
import { env } from "@/env";
import { Panel } from "@/ui/page";
import { formatDateTime } from "@/ui/format";
import { KeyManager } from "../keys";

export const metadata: Metadata = { title: "Usage feed" };

export default async function DataSettings() {
  const ctx = await appCtx();
  const [keys, log] = await Promise.all([listApiKeys(ctx), ingestLog(ctx)]);
  const example = `curl -X POST ${env().APP_URL}/api/ingest/usage \\
  -H "Authorization: Bearer esd_ingest_…" \\
  -H "Content-Type: application/json" \\
  -d '{"rows":[{"account":{"crmId":"FW-1001"},"date":"2026-10-07",
       "activeSeats":61,"creditsUsedTerm":70120,
       "workspaces":[{"id":"ws-1","name":"Finance","createdOn":"2025-04-02","activeUsers":52}],
       "gatedAttempts":{"ap_automation":2},"openEscalations":0}]}'`;
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Ingest keys" id="keys" description="Your data warehouse or product backend sends daily usage with one of these keys.">
        <div className="p-4">
          <KeyManager kind="INGEST" tz={ctx.actor.timezone} keys={keys.filter((k) => k.kind === "INGEST").map((k) => ({ ...k, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }))} />
        </div>
      </Panel>
      <Panel title="Sending usage" id="api" description="One row per account per day. Re-sending a day replaces it. Up to 5,000 rows per request.">
        <pre className="overflow-x-auto px-4 py-3 font-mono text-meta leading-5">{example}</pre>
        <p className="border-t border-rule px-4 py-2 text-meta text-muted">
          Accounts are matched by <span className="font-mono">crmId</span> or <span className="font-mono">domain</span>. Unknown accounts are rejected, never created. Detection runs for the accounts in each batch as soon as it lands.
        </p>
      </Panel>
      <Panel title="Recent batches" id="log">
        {log.length ? (
          <table className="w-full text-table">
            <thead className="border-b border-rule text-left text-meta text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Received</th>
                <th className="px-2 py-2 font-medium">Source</th>
                <th className="px-2 py-2 text-right font-medium">Accepted</th>
                <th className="px-4 py-2 font-medium">Rejected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {log.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2">{formatDateTime(b.receivedAt, ctx.actor.timezone)}</td>
                  <td className="px-2 py-2">{b.source === "SIMULATED" ? "Simulator" : b.source}</td>
                  <td className="num px-2 py-2 text-right font-mono">{b.accepted}</td>
                  <td className="px-4 py-2">
                    {b.rejected ? (
                      <details>
                        <summary className="cursor-pointer text-risk">{b.rejected} rejected</summary>
                        <ul className="mt-1 text-meta text-muted">
                          {(b.errors as Array<{ index: number; reason: string }>).slice(0, 10).map((e) => (
                            <li key={e.index}>
                              Row {e.index + 1}: {e.reason}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 py-3 text-table text-muted">No usage received yet.</p>
        )}
      </Panel>
    </div>
  );
}
