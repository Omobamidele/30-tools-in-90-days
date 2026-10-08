import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listQueues } from "@/services/settings";
import { listSellers } from "@/services/csqls";
import { Panel } from "@/ui/page";
import { QueueEditor } from "./queue-editor";

export const metadata: Metadata = { title: "Routing" };

export default async function RoutingPage() {
  const ctx = await appCtx();
  const [queues, sellers] = await Promise.all([listQueues(ctx), listSellers(ctx)]);
  const t = ctx.actor.config.terminology;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Where accepted signals go`} id="order">
        <ol className="list-decimal py-3 pr-4 pl-9 text-table">
          <li>The account&apos;s owner, if they&apos;re active.</li>
          <li>Otherwise the account&apos;s segment queue, taking turns in the order below.</li>
          <li>Otherwise the sales leader.</li>
        </ol>
        <p className="border-t border-rule px-4 py-2 text-meta text-muted">Each {t.csql} records which of these applied, so nobody has to guess why it landed with them.</p>
      </Panel>
      {ctx.actor.config.segments.map((s) => {
        const q = queues.find((x) => x.segment === s.key);
        return (
          <Panel key={s.key} title={`${s.name} queue`} id={`q-${s.key}`}>
            <QueueEditor segment={s.key} members={q?.memberIds ?? []} sellers={sellers.map((x) => ({ id: x.id, name: x.name }))} />
          </Panel>
        );
      })}
    </div>
  );
}
