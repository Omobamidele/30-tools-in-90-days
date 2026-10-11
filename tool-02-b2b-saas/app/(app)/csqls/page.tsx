import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { csqlLabel, listCsqls, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { formatMoneyShort } from "@/core/money";
import type { CsqlStatus } from "@/core/workflow";
import { DataTable, EmptyState, PageHeader, PhoneList, Tabs } from "@/ui/page";
import { FilterMenu } from "@/ui/filter-menu";
import { Status } from "@/ui/bits";
import { ago, deadlineText } from "@/ui/format";

export const metadata: Metadata = { title: "CSQLs" };

const COLUMNS: Array<{ key: string; title: string; statuses: CsqlStatus[]; hint: string; recent?: boolean }> = [
  { key: "routed", title: "Routed", statuses: ["ROUTED"], hint: "Seller to accept" },
  { key: "returned", title: "Returned", statuses: ["RETURNED"], hint: "Back with CS" },
  { key: "accepted", title: "Accepted", statuses: ["ACCEPTED"], hint: "Seller is on it" },
  { key: "opportunity", title: "Opportunity", statuses: ["OPPORTUNITY"], hint: "In the CRM" },
  { key: "closed", title: "Closed", statuses: ["WON", "LOST", "CLOSED_NO_OPP"], hint: "Last 30 days", recent: true },
];

export default async function CsqlsPage({ searchParams }: PageProps<"/csqls">) {
  const sp = (await searchParams) as { mine?: string; layout?: string };
  const ctx = await appCtx();
  const t = ctx.actor.config.terminology;
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const mine = sp.mine === "1" || (sp.mine === undefined && ctx.actor.role === "SELLER");
  const layout = sp.layout === "board" ? "board" : "list";
  const rows = await listCsqls(ctx, { mine });
  const value = (c: (typeof rows)[number]["csql"]) => (c.status === "WON" ? c.outcomeAmountMinor : ((c.opportunity as Opportunity | null)?.amountMinor ?? c.adjustedValueMinor ?? c.estValueMinor));
  const recentCut = now.getTime() - 30 * 86_400_000;
  const shown = rows.filter((r) => !["WON", "LOST", "CLOSED_NO_OPP"].includes(r.csql.status) || (r.csql.closedAt?.getTime() ?? 0) >= recentCut);
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v !== undefined) as Array<[string, string]>);
    return `/csqls${p.toString() ? `?${p}` : ""}`;
  };
  const openCount = rows.filter((r) => ["ROUTED", "ACCEPTED", "OPPORTUNITY", "RETURNED"].includes(r.csql.status)).length;

  const card = (r: (typeof rows)[number]) => {
    const c = r.csql;
    const due = (c.status === "ROUTED" || c.status === "RETURNED") && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
    return (
      <Link href={`/csqls/${c.id}`} className="block rounded-panel border border-rule bg-surface p-4 hover:border-brand">
        <span className="block font-semibold text-brand">{r.account.name}</span>
        <span className="block text-meta text-muted">
          {csqlLabel(t.csql, c.number)}, {r.ownerName ?? "seller queue"}
        </span>
        <span className="mt-3 flex items-center justify-between gap-2">
          <span className="text-meta text-muted">{value(c) ? `About ${formatMoneyShort(value(c)!, ctx.actor.currency)} a year` : "No estimate"}</span>
          {due ? <Status tone={due.tone}>{due.text}</Status> : c.status === "WON" ? <Status tone="won">Won</Status> : c.status === "LOST" ? <Status tone="neutral">Lost</Status> : null}
        </span>
      </Link>
    );
  };

  const stageText = (c: (typeof rows)[number]["csql"]) => STAGE_TEXT[c.status] ?? c.status.toLowerCase();

  return (
    <>
      <PageHeader
        title={t.csqlPlural}
        meta={`${openCount} open. Accepted signals handed to sellers, with the CSM's note and the evidence.`}
        tabs={
          <Tabs
            label="View"
            items={[
              { href: link({ layout: undefined }), label: "Table", active: layout === "list" },
              { href: link({ layout: "board" }), label: "Board", active: layout === "board" },
            ]}
          />
        }
        toolbar={
          <FilterMenu
            label="Showing"
            items={[
              { href: link({ mine: "0" }), label: "Everything I can see", active: !mine },
              { href: link({ mine: "1" }), label: ctx.actor.role === "CSM" || ctx.actor.role === "CS_LEAD" ? "Ones I sent" : "Mine", active: mine },
            ]}
          />
        }
      />

      {layout === "board" ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = shown.filter((r) => col.statuses.includes(r.csql.status));
            return (
              <section key={col.key} aria-labelledby={`c-${col.key}`} className="flex min-w-0 flex-col">
                <header className="mb-3 border-b-[3px] border-brand pb-2">
                  <h2 id={`c-${col.key}`} className="text-body font-semibold">
                    {col.title} <span className="num font-normal text-muted">{items.length}</span>
                  </h2>
                  <p className="text-meta text-muted">{col.hint}</p>
                </header>
                <ul className="flex flex-col gap-3">
                  {items.map((r) => (
                    <li key={r.csql.id}>{card(r)}</li>
                  ))}
                  {!items.length ? <li className="py-4 text-meta text-muted">Nothing here.</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : rows.length ? (
        <>
        <PhoneList>
          {rows.map((r) => (
            <li key={r.csql.id} className="py-4">
              <Link href={`/csqls/${r.csql.id}`} className="font-semibold text-brand hover:underline">
                {r.account.name}
              </Link>
              <p className="text-meta text-muted">
                {stageText(r.csql)}, {r.ownerName ?? "seller queue"}
              </p>
            </li>
          ))}
        </PhoneList>
        <DataTable caption={t.csqlPlural} head={[{ label: "Account" }, { label: "Stage" }, { label: "Seller" }, { label: "From customer success" }, { label: "Created", className: "pr-5" }]}>
          {rows.map((r) => {
            const c = r.csql;
            const due = (c.status === "ROUTED" || c.status === "RETURNED") && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
            return (
              <tr key={c.id} className="hover:bg-hover/60">
                <td className="py-4 pr-4 pl-5">
                  <Link href={`/csqls/${c.id}`} className="font-semibold text-brand hover:underline">
                    {r.account.name}
                  </Link>
                  <span className="block text-meta text-muted">{csqlLabel(t.csql, c.number)}</span>
                </td>
                <td className="px-4 py-4">
                  <span className="flex flex-wrap items-center gap-2">
                    {stageText(c)}
                    {due ? <Status tone={due.tone}>{due.text}</Status> : null}
                  </span>
                </td>
                <td className="px-4 py-4">{r.ownerName ?? <span className="text-faint">Seller queue</span>}</td>
                <td className="px-4 py-4">{r.sourcedByName}</td>
                <td className="py-4 pr-5 pl-4 text-muted">{ago(c.createdAt, now)}</td>
              </tr>
            );
          })}
        </DataTable>
        </>
      ) : (
        <EmptyState title={`No ${t.csqlPlural} yet`}>When a CSM accepts a signal, it arrives here routed to a seller.</EmptyState>
      )}
    </>
  );
}

const STAGE_TEXT: Record<string, string> = {
  ROUTED: "Waiting for the seller",
  RETURNED: "Sent back to customer success",
  ACCEPTED: "Seller is on it",
  OPPORTUNITY: "Opportunity in the CRM",
  WON: "Won",
  LOST: "Lost",
  CLOSED_NO_OPP: "Closed, no opportunity",
};
