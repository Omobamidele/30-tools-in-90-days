import type { Metadata } from "next";
import Link from "next/link";
import { appCtx } from "@/services/app-ctx";
import { decisionsLog, exposureByClient, paymentSchedule, penaltyVariance } from "@/services/reports";
import { decisionTypeLabels } from "@/services/alerts";
import { formatMoney } from "@/core/money";
import { term } from "@/config/terms";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { Table, Td, Th, Tr } from "@/ui/table";
import { BearerBar } from "@/ui/bearer-bar";
import { formatDateTime, formatDue } from "@/ui/format";
import { cx } from "@/ui/cx";
import { VarianceChart } from "./variance-chart";

export const metadata: Metadata = { title: "Reports" };

const REPORTS = [
  { key: "exposure", label: "Exposure by client" },
  { key: "payments", label: "Payments schedule" },
  { key: "penalties", label: "Projected vs actual penalties" },
  { key: "decisions", label: "Decisions" },
] as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const r = (await searchParams).r ?? "exposure";
  const report = REPORTS.find((x) => x.key === r) ?? REPORTS[0];
  const ctx = await appCtx();
  const cfg = ctx.actor.config;
  const tz = ctx.actor.orgTimezone;
  const csv = (
    <a href={`/api/reports/${report.key}`} className="inline-flex h-8 items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken">
      Export CSV
    </a>
  );

  let body: React.ReactNode = null;
  if (report.key === "exposure") {
    const d = await exposureByClient(ctx);
    body = d.rows.length ? (
      <Table>
        <thead>
          <tr>
            <Th>{term(cfg, "client")}</Th>
            <Th align="right">Open {term(cfg, "event", { plural: true, lower: true })}</Th>
            <Th align="right">Current exposure</Th>
            <Th className="w-40">Carried by</Th>
            <Th align="right">Agency</Th>
            <Th align="right">Client</Th>
            <Th align="right">Unassigned</Th>
            <Th align="right">If cancelled</Th>
          </tr>
        </thead>
        <tbody>
          {d.rows.map((x) => (
            <Tr key={x.client}>
              <Td className="font-medium">
                {x.client}
                {x.incomplete ? <span className="block text-meta font-normal text-watch">{x.incomplete} incomplete</span> : null}
              </Td>
              <Td align="right">{x.events}</Td>
              <Td align="right">{formatMoney(x.current, d.currency)}</Td>
              <Td>{x.current ? <BearerBar compact agencyMinor={x.agency} clientMinor={x.clientShare} unassignedMinor={x.unassigned} currency={d.currency} /> : "–"}</Td>
              <Td align="right">{formatMoney(x.agency, d.currency, { withCode: false })}</Td>
              <Td align="right">{formatMoney(x.clientShare, d.currency, { withCode: false })}</Td>
              <Td align="right">{formatMoney(x.unassigned, d.currency, { withCode: false })}</Td>
              <Td align="right">{formatMoney(x.cancellation, d.currency, { withCode: false })}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    ) : (
      <EmptyState title="No open events with exposure" />
    );
  } else if (report.key === "payments") {
    const d = await paymentSchedule(ctx, 90);
    body = d.rows.length ? (
      <>
        <p className="border-b border-rule px-4 py-2 text-table">
          Outstanding in the next 90 days: <span className="num font-medium">{formatMoney(d.totalMinor, d.currency)}</span>
          {d.missingFx ? <span className="text-watch"> (some amounts excluded: exchange rate missing)</span> : null}
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Due</Th>
              <Th>Payment</Th>
              <Th>{term(cfg, "event")}</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Paid</Th>
              <Th align="right">Outstanding</Th>
              <Th align="right">In {d.currency}</Th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((o) => (
              <Tr key={o.id}>
                <Td className="num whitespace-nowrap">{formatDue(o.dueAt, o.dueTz)}</Td>
                <Td>
                  {o.label} <span className="block text-meta text-muted">{o.supplierName}</span>
                </Td>
                <Td>
                  <Link href={`/events/${o.eventId}/deadlines`} className="hover:underline">
                    {o.eventName}
                  </Link>
                </Td>
                <Td align="right">{o.amountMinor !== null && o.currency ? formatMoney(o.amountMinor, o.currency) : "–"}</Td>
                <Td align="right">{o.currency ? formatMoney(o.paidMinor, o.currency, { withCode: false }) : "–"}</Td>
                <Td align="right">{o.currency ? formatMoney(o.outstandingMinor, o.currency) : "–"}</Td>
                <Td align="right">{o.baseMinor !== null ? formatMoney(o.baseMinor, d.currency, { withCode: false }) : <span className="text-watch">Missing FX</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </>
    ) : (
      <EmptyState title="No payments due in the next 90 days" />
    );
  } else if (report.key === "penalties") {
    const rows = await penaltyVariance(ctx);
    body = rows.length ? (
      <div className="flex flex-col gap-4 p-4">
        <VarianceChart
          rows={rows.map((x) => ({ id: x.eventId, name: x.name, currency: x.currency, projected: x.projectedMinor, actual: x.actualMinor }))}
        />
        <table className="w-full text-table">
          <caption className="mb-1 text-left font-medium">Table view</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">{term(cfg, "event")}</th>
              <th scope="col" className="py-1 text-right font-medium">Projected (7 days before)</th>
              <th scope="col" className="py-1 text-right font-medium">Actually charged</th>
              <th scope="col" className="py-1 text-right font-medium">Removed by decisions</th>
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((x) => (
              <tr key={x.eventId} className="border-t border-rule">
                <td className="py-1.5 font-sans">
                  <Link href={`/events/${x.eventId}/post-event`} className="hover:underline">
                    {x.name}
                  </Link>
                </td>
                <td className="py-1.5 text-right">{x.projectedMinor !== null ? formatMoney(x.projectedMinor, x.currency) : "No snapshot"}</td>
                <td className="py-1.5 text-right">{x.actualMinor !== null ? formatMoney(x.actualMinor, x.currency) : "Not recorded"}</td>
                <td className="py-1.5 text-right">{formatMoney(x.avoidedMinor, x.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <EmptyState title="No finished events yet">Once events are delivered and their actual penalties recorded, they appear here against what was projected.</EmptyState>
    );
  } else {
    const rows = await decisionsLog(ctx);
    const byCcy = new Map<string, number>();
    for (const d of rows) if (d.exposureDeltaMinor && d.currency) byCcy.set(d.currency, (byCcy.get(d.currency) ?? 0) + Math.abs(d.exposureDeltaMinor));
    body = rows.length ? (
      <>
        {byCcy.size ? (
          <p className="border-b border-rule px-4 py-2 text-table">
            Exposure removed by decisions:{" "}
            {[...byCcy].map(([c, m]) => (
              <span key={c} className="num mr-3 font-medium text-settled">
                {formatMoney(m, c)}
              </span>
            ))}
          </p>
        ) : null}
        <Table>
          <thead>
            <tr>
              <Th>Decided</Th>
              <Th>{term(cfg, "event")}</Th>
              <Th>Decision</Th>
              <Th>By</Th>
              <Th align="right">Exposure removed</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <Tr key={d.id}>
                <Td className="num whitespace-nowrap">{formatDateTime(d.createdAt, tz)}</Td>
                <Td>
                  <Link href={`/events/${d.eventId}`} className="hover:underline">
                    {d.eventName}
                  </Link>
                  <span className="block text-meta text-muted">{d.clientName}</span>
                </Td>
                <Td>
                  {decisionTypeLabels[d.type]}
                  {d.note ? <span className="block text-meta text-muted">{d.note}</span> : null}
                </Td>
                <Td className="whitespace-nowrap">{d.byName}</Td>
                <Td align="right">{d.exposureDeltaMinor && d.currency ? formatMoney(Math.abs(d.exposureDeltaMinor), d.currency) : "–"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </>
    ) : (
      <EmptyState title="No decisions recorded yet">Decisions are recorded when someone closes an alert.</EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Reports" actions={csv} />
      <Panel>
        <nav aria-label="Reports" className="flex flex-wrap gap-1 border-b border-rule px-4 py-2">
          {REPORTS.map((x) => (
            <Link
              key={x.key}
              href={`/reports?r=${x.key}`}
              aria-current={x.key === report.key ? "page" : undefined}
              className={cx("rounded-control px-2.5 py-1 text-table", x.key === report.key ? "bg-sunken font-medium" : "text-muted hover:bg-sunken hover:text-ink")}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        {body}
      </Panel>
    </div>
  );
}
