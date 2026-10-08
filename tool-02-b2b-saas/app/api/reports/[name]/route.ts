import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import type { ServiceCtx } from "@/services/context";
import { getResults, type Period } from "@/services/results";
import { listCsqls, csqlLabel, type Opportunity } from "@/services/csqls";

const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote fields with separators, and neutralise spreadsheet formulas (CSV injection).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const m = (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : (minor / 100).toFixed(2));

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in to export.", { status: 401 });
  const ctx: ServiceCtx = {
    db: getDb(),
    now: () => new Date(),
    actor: { userId: actor.userId, name: actor.name, role: actor.role, orgId: actor.org.id, timezone: actor.org.timezone, currency: actor.org.currency, config: actor.org.config },
  };
  const { name } = await params;
  const period = (new URL(req.url).searchParams.get("period") ?? "90d") as Period;
  if (name !== "results") return new Response("Unknown report.", { status: 404 });
  const [r, rows] = await Promise.all([getResults(ctx, ["90d", "quarter", "year", "all"].includes(period) ? period : "90d"), listCsqls(ctx, {})]);
  const lines = [
    [`Results for ${r.label}`, `Currency ${r.currency}`],
    [],
    ["Signals raised", "Accepted", "Dismissed", "CSQLs routed", "Opportunities", "Pipeline", "Won", "Won ARR"],
    [r.funnel.raised, r.funnel.accepted, r.funnel.dismissed, r.funnel.routed, r.funnel.opportunities, m(r.funnel.pipelineMinor), r.funnel.won, m(r.funnel.wonMinor)],
    [],
    ["CSQL", "Account", "Status", "Sourced by", "Seller", "Estimate", "Opportunity", "CRM reference", "Won ARR", "Outcome reason", "Created", "Closed"],
    ...rows.map(({ csql: c, account, ownerName, sourcedByName }) => {
      const o = c.opportunity as Opportunity | null;
      return [csqlLabel(actor.org.config.terminology.csql, c.number), account.name, c.status, sourcedByName, ownerName ?? "", m(c.adjustedValueMinor ?? c.estValueMinor), m(o?.amountMinor), o?.crmRef ?? "", m(c.outcomeAmountMinor), c.outcomeReason ?? "", c.createdAt.toISOString(), c.closedAt?.toISOString() ?? ""];
    }),
  ];
  const csv = lines.map((l) => l.map(esc).join(",")).join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="results-${period}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" },
  });
}
