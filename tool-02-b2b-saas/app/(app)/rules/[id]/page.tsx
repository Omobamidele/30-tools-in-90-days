import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getRule } from "@/services/rules";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { PageHeader, Panel } from "@/ui/page";
import { Money, RuleTag } from "@/ui/bits";
import { formatDateTime } from "@/ui/format";
import { describeRule } from "../describe";
import { RuleEditor } from "./rule-editor";

export const metadata: Metadata = { title: "Rule" };

export default async function RulePage({ params }: PageProps<"/rules/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
  if (!can(ctx.actor, "rules.manage")) redirect("/");
  const d = await getRule(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const r = d.rule;
  return (
    <>
      <PageHeader crumbs={[{ href: "/rules", label: "Rules" }, { label: r.name }]} title={r.name} meta={<span className="flex items-center gap-2"><RuleTag type={r.type} /> version {r.version}</span>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <RuleEditor
          rule={{ id: r.id, type: r.type, name: r.name, params: r.params as Record<string, unknown>, weight: r.weight, minArr: r.minArrMinor ? String(r.minArrMinor / 100) : "", segments: r.segments, cooldownDays: r.cooldownDays, enabled: r.enabled, version: r.version }}
          segments={ctx.actor.config.segments}
          currency={ctx.actor.currency}
          usageUnit={ctx.actor.config.terminology.usageUnit}
          current={describeRule(r.type, r.params as Record<string, unknown>, ctx.actor.config.terminology)}
        />
        <div className="flex flex-col gap-4">
          <Panel title="Why it gets dismissed" id="reasons">
            {d.reasons.length ? (
              <ul className="divide-y divide-rule">
                {d.reasons.map((x) => (
                  <li key={x.reason ?? "none"} className="flex justify-between gap-3 px-4 py-2 text-table">
                    <span>{x.reason ?? "No reason"}</span>
                    <span className="num">{x.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-table text-muted">No dismissals yet.</p>
            )}
          </Panel>
          <Panel title="Estimate vs what sellers recorded" id="calibration" description="Median, for signals that became opportunities.">
            <dl className="divide-y divide-rule text-table">
              <div className="flex justify-between px-4 py-2">
                <dt>Rule estimate</dt>
                <dd>{d.medianEstimatedMinor === null ? "—" : <Money minor={d.medianEstimatedMinor} currency={ctx.actor.currency} />}</dd>
              </div>
              <div className="flex justify-between px-4 py-2">
                <dt>Opportunity recorded</dt>
                <dd>{d.medianOpportunityMinor === null ? "—" : <Money minor={d.medianOpportunityMinor} currency={ctx.actor.currency} />}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Version history" id="versions">
            <ol className="divide-y divide-rule">
              {d.versions.map((v) => (
                <li key={v.id} className="px-4 py-2 text-table">
                  <span>v{v.version}</span> · {v.note}
                  <span className="block text-meta text-muted">{formatDateTime(v.changedAt, ctx.actor.timezone)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
