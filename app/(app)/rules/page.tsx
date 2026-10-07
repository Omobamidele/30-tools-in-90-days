import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listRules } from "@/services/rules";
import { can } from "@/auth/policy";
import { PageHeader, Panel } from "@/ui/page";
import { RuleTag, Status } from "@/ui/bits";
import { describeRule } from "./describe";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage() {
  const ctx = await appCtx();
  if (!can(ctx.actor, "rules.manage")) redirect("/");
  const rules = await listRules(ctx);
  return (
    <>
      <PageHeader title="Signal rules" meta="Each rule is a plain condition on usage. Last 90 days: raised → accepted → won." />
      <Panel bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[860px] text-table">
          <caption className="sr-only">Signal rules</caption>
          <thead className="border-b border-rule text-left text-meta text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Rule</th>
              <th className="px-2 py-2 font-medium">Condition</th>
              <th className="px-2 py-2 text-right font-medium">Raised</th>
              <th className="px-2 py-2 text-right font-medium">Accepted</th>
              <th className="px-2 py-2 text-right font-medium">Dismissed</th>
              <th className="px-2 py-2 text-right font-medium">Won</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rules.map(({ rule: r, funnel: f }) => (
              <tr key={r.id} className="hover:bg-sunken/50">
                <td className="px-4 py-2.5">
                  <Link href={`/rules/${r.id}`} className="font-medium hover:underline">
                    {r.name}
                  </Link>
                  <span className="mt-1 flex items-center gap-2">
                    <RuleTag type={r.type} />
                    <span className="font-mono text-meta text-muted">v{r.version}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-muted">{describeRule(r.type, r.params as Record<string, unknown>, ctx.actor.config.terminology)}</td>
                <td className="num px-2 py-2.5 text-right font-mono">{f.raised}</td>
                <td className="num px-2 py-2.5 text-right font-mono">
                  {f.accepted}
                  {f.raised ? <span className="ml-1 text-meta text-muted">{Math.round((f.accepted / f.raised) * 100)}%</span> : null}
                </td>
                <td className="num px-2 py-2.5 text-right font-mono">{f.dismissed}</td>
                <td className="num px-2 py-2.5 text-right font-mono">{f.won}</td>
                <td className="px-4 py-2.5">{r.enabled ? <Status tone="live">On</Status> : <Status tone="neutral">Off</Status>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
