import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { csqlLabel, listCsqls, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { formatMoneyShort } from "@/core/money";
import type { CsqlStatus } from "@/core/workflow";
import { Chips, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Avatar, MoneyShort, Status } from "@/ui/bits";
import { ago, deadlineText } from "@/ui/format";
import { cx } from "@/ui/cx";

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
  const layout = sp.layout === "list" ? "list" : "board";
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
      <Link href={`/csqls/${c.id}`} className="block rounded-panel border border-rule bg-surface p-3 hover:border-field">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="text-meta text-muted">{csqlLabel(t.csql, c.number)}</span>
            <span className="block truncate text-body font-semibold">{r.account.name}</span>
          </span>
          <MoneyShort minor={value(c)} currency={ctx.actor.currency} className="shrink-0 font-medium" empty="—" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-meta text-muted">
          <span className="flex items-center gap-1">
            <Avatar name={r.ownerName} size={16} />
            {r.ownerName ?? "Unassigned"}
          </span>
          {due ? (
            <Status tone={due.tone} className="text-meta">
              {due.text}
            </Status>
          ) : c.status === "WON" ? (
            <Status tone="won" className="text-meta">
              Won
            </Status>
          ) : c.status === "LOST" ? (
            <Status tone="neutral" className="text-meta">
              Lost
            </Status>
          ) : c.status === "CLOSED_NO_OPP" ? (
            <Status tone="neutral" className="text-meta">
              No opportunity
            </Status>
          ) : (
            <span>{ago(c.updatedAt, now)}</span>
          )}
        </div>
        <p className="mt-1 text-meta text-faint">From {r.sourcedByName}</p>
      </Link>
    );
  };

  return (
    <>
      <PageHeader
        title={t.csqlPlural}
        meta={`${openCount} open · accepted signals routed to sellers, with the CSM's note and the evidence`}
        actions={
          <div role="group" aria-label="Layout" className="inline-flex rounded-control border border-field bg-surface p-0.5">
            {(["board", "list"] as const).map((l) => (
              <Link key={l} href={link({ layout: l === "board" ? undefined : "list" })} aria-current={layout === l ? "true" : undefined} className={cx("rounded-[4px] px-3 py-1 text-table capitalize", layout === l ? "bg-ink text-on-ink" : "text-muted hover:text-text")}>
                {l}
              </Link>
            ))}
          </div>
        }
      >
        <div className="mt-4">
          <Chips
            items={[
              { href: link({ mine: "1" }), label: ctx.actor.role === "CSM" || ctx.actor.role === "CS_LEAD" ? "I sent" : "Mine", active: mine },
              { href: link({ mine: "0" }), label: "Everything I can see", active: !mine },
            ]}
          />
        </div>
      </PageHeader>

      {layout === "board" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = shown.filter((r) => col.statuses.includes(r.csql.status));
            const total = items.reduce((n, r) => n + (value(r.csql) ?? 0), 0);
            return (
              <section key={col.key} aria-labelledby={`c-${col.key}`} className="flex min-w-0 flex-col rounded-panel bg-sunken/70 p-2">
                <header className="flex items-baseline justify-between px-2 pt-1 pb-2">
                  <h2 id={`c-${col.key}`} className="text-body font-semibold">
                    {col.title} <span className="num font-normal text-muted">{items.length}</span>
                  </h2>
                  <span className="truncate pl-2 text-meta text-muted">{items.length && total ? formatMoneyShort(total, ctx.actor.currency) : col.hint}</span>
                </header>
                <ul className="flex flex-col gap-2">
                  {items.map((r) => (
                    <li key={r.csql.id}>{card(r)}</li>
                  ))}
                  {!items.length ? <li className="rounded-panel border border-dashed border-rule-strong px-3 py-6 text-center text-meta text-muted">Nothing here.</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Panel bodyClassName="overflow-x-auto">
          {rows.length ? (
            <table className="w-full min-w-[820px] text-table">
              <caption className="sr-only">{t.csqlPlural}</caption>
              <thead className="border-b border-rule text-left text-meta text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t.csql}</th>
                  <th className="px-2 py-2 font-medium">Account</th>
                  <th className="px-2 py-2 font-medium">Stage</th>
                  <th className="px-2 py-2 text-right font-medium">Value a year</th>
                  <th className="px-2 py-2 font-medium">Seller</th>
                  <th className="px-2 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.csql.id} className="hover:bg-sunken/50">
                    <td className="px-4 py-2">
                      <Link href={`/csqls/${r.csql.id}`} className="hover:underline">
                        {csqlLabel(t.csql, r.csql.number)}
                      </Link>
                    </td>
                    <td className="px-2 py-2 font-medium">{r.account.name}</td>
                    <td className="px-2 py-2 capitalize">{r.csql.status.toLowerCase().replace(/_/g, " ")}</td>
                    <td className="px-2 py-2 text-right">
                      <MoneyShort minor={value(r.csql)} currency={ctx.actor.currency} empty="—" />
                    </td>
                    <td className="px-2 py-2">{r.ownerName ?? "Unassigned"}</td>
                    <td className="px-2 py-2 text-muted">{r.sourcedByName}</td>
                    <td className="px-4 py-2 text-muted">{ago(r.csql.createdAt, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title={`No ${t.csqlPlural} yet`}>When a CSM accepts a signal, it arrives here routed to a seller.</EmptyState>
          )}
        </Panel>
      )}
    </>
  );
}
