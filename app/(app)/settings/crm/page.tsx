import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listApiKeys } from "@/services/keys";
import { listEndpoints, WEBHOOK_EVENTS } from "@/services/webhooks";
import { env } from "@/env";
import { Panel } from "@/ui/page";
import { KeyManager } from "../keys";
import { Webhooks } from "./webhooks";

export const metadata: Metadata = { title: "CRM and webhooks" };

export default async function CrmSettings() {
  const ctx = await appCtx();
  const [keys, hooks] = await Promise.all([listApiKeys(ctx), listEndpoints(ctx)]);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Webhooks out" id="webhooks" description="Your CRM automation creates and updates the opportunity when these events fire. Each request is signed (X-Signature: sha256=HMAC of the body).">
        <div className="p-4">
          <Webhooks
            events={[...WEBHOOK_EVENTS]}
            endpoints={hooks.endpoints.map((e) => ({ id: e.id, url: e.url, events: e.events, secretHint: e.secretHint }))}
            deliveries={hooks.deliveries.map((d) => ({ id: d.id, event: d.event, status: d.status, attempts: d.attempts, responseCode: d.responseCode, lastError: d.lastError, createdAt: d.createdAt.toISOString() }))}
            tz={ctx.actor.timezone}
          />
        </div>
      </Panel>
      <Panel title="CRM updates in" id="crm-keys" description="Your CRM reports amounts and outcomes back, so sellers don't enter them twice.">
        <div className="flex flex-col gap-3 p-4">
          <pre className="overflow-x-auto rounded-control bg-sunken/60 px-3 py-2 font-mono text-meta leading-5">{`POST ${env().APP_URL}/api/crm/opportunity-update
Authorization: Bearer esd_crm_…
{"csql": 12, "amount": 18000}              ← records or updates the opportunity
{"crmRef": "OPP-24518", "outcome": "WON"}   ← closes it as won`}</pre>
          <KeyManager kind="CRM" tz={ctx.actor.timezone} keys={keys.filter((k) => k.kind === "CRM").map((k) => ({ ...k, lastUsedAt: k.lastUsedAt?.toISOString() ?? null, createdAt: k.createdAt.toISOString() }))} />
        </div>
      </Panel>
      <p className="text-meta text-muted">Native Salesforce and HubSpot connectors aren&apos;t built yet. These webhooks and the update endpoint are the bridge most CRMs can call today.</p>
    </div>
  );
}
