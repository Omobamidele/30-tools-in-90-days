import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listAccounts } from "@/services/accounts";
import { Chips, EmptyState, PageHeader, Panel } from "@/ui/page";
import { MoneyShort, SimulatedTag, Status } from "@/ui/bits";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const sp = (await searchParams) as { q?: string; segment?: string; signals?: string; stale?: string; page?: string };
  const ctx = await appCtx();
  const cfg = ctx.actor.config;
  const rows = await listAccounts(ctx, { q: sp.q, segment: sp.segment, withSignals: sp.signals === "1", stale: sp.stale === "1" });
  const link = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as Array<[string, string]>);
    return `/accounts${p.toString() ? `?${p}` : ""}`;
  };
  const staleAfter = cfg.detection.staleAfterDays;
  const PAGE = 100;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  return (
    <>
      <PageHeader title="Accounts" meta={`${rows.length} customer${rows.length === 1 ? "" : "s"}${ctx.actor.role === "CSM" ? " in your book" : ""}`}>
        <div className="mt-4 flex flex-col gap-2">
          <form className="max-w-sm" role="search">
            <label htmlFor="acct-q" className="sr-only">
              Search accounts
            </label>
            <input id="acct-q" name="q" defaultValue={sp.q} placeholder="Search by name or domain" className="h-9 w-full rounded-control border border-field bg-surface px-3 text-body" />
          </form>
          <Chips
            items={[
              { href: link({ segment: undefined, page: undefined }), label: "All segments", active: !sp.segment },
              ...cfg.segments.map((s) => ({ href: link({ segment: s.key }), label: s.name, active: sp.segment === s.key })),
              { href: link({ signals: sp.signals === "1" ? undefined : "1" }), label: "Has open signals", active: sp.signals === "1" },
              { href: link({ stale: sp.stale === "1" ? undefined : "1" }), label: "Stale usage", active: sp.stale === "1" },
            ]}
          />
        </div>
      </PageHeader>
      <Panel bodyClassName="overflow-x-auto">
        {rows.length ? (
          <table className="w-full min-w-[980px] text-table">
            <caption className="sr-only">Accounts</caption>
            <thead className="border-b border-rule text-left text-meta text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-2 py-2 text-right font-medium">ARR</th>
                <th className="px-2 py-2 font-medium">{cfg.terminology.seats}</th>
                <th className="px-2 py-2 text-right font-medium">{cfg.terminology.usageMetric} pace</th>
                <th className="px-2 py-2 font-medium">Renewal</th>
                <th className="px-2 py-2 font-medium">CSM</th>
                <th className="px-2 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Open signals</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {shown.map((r) => {
                const pct = r.sub && r.activeSeats !== null && r.sub.seatsPurchased ? Math.round((r.activeSeats / r.sub.seatsPurchased) * 100) : null;
                const stale = r.dataAgeDays === null || r.dataAgeDays > staleAfter;
                return (
                  <tr key={r.account.id} className="hover:bg-sunken/50">
                    <td className="px-4 py-2">
                      <Link href={`/accounts/${r.account.id}`} className="font-medium hover:underline">
                        {r.account.name}
                      </Link>
                      <span className="block text-meta text-muted">
                        {cfg.segments.find((s) => s.key === r.account.segment)?.name ?? "No segment"} · {r.account.industry ?? r.account.domain}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyShort minor={r.sub?.arrMinor} currency={ctx.actor.currency} empty="—" />
                    </td>
                    <td className="px-2 py-2">
                      {pct !== null ? (
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken">
                            <span className={cx("block h-full rounded-full", pct >= 90 ? "bg-signal-ink" : "bg-muted")} style={{ width: `${Math.min(100, pct)}%` }} />
                          </span>
                          <span className="num font-mono">
                            {r.activeSeats}/{r.sub!.seatsPurchased}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cx("px-2 py-2 text-right font-mono num", r.usagePacePct !== null && r.usagePacePct >= 110 ? "font-semibold text-signal-ink" : "")}>{r.usagePacePct !== null ? `${r.usagePacePct}%` : "—"}</td>
                    <td className="px-2 py-2">{r.renewalInDays !== null ? <span className={r.renewalInDays <= 60 ? "text-watch" : ""}>{r.renewalInDays} days</span> : "—"}</td>
                    <td className="px-2 py-2">{r.csmName ?? <span className="text-faint">None</span>}</td>
                    <td className="px-2 py-2">{r.ownerName ?? <span className="text-faint">Queue</span>}</td>
                    <td className="px-4 py-2">
                      {stale ? (
                        <Status tone="watch">{r.dataAgeDays === null ? "No usage yet" : `Usage ${r.dataAgeDays} days old`}</Status>
                      ) : r.openSignals ? (
                        <span>
                          <span className="num font-mono font-semibold">{r.openSignals}</span> <MoneyShort minor={r.openSignalValue} currency={ctx.actor.currency} className="text-muted" />
                        </span>
                      ) : (
                        <span className="text-faint">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No accounts">
            {sp.q || sp.segment || sp.signals || sp.stale ? "Nothing matches these filters." : "RevOps imports accounts from the CRM (Settings → Imports) and pushes usage through the ingest API."}
          </EmptyState>
        )}
      </Panel>
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3 text-table">
          <span className="text-muted">
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, rows.length)} of {rows.length}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link className="link" href={link({ page: String(page - 1) })}>
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="link" href={link({ page: String(page + 1) })}>
                Next
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
      {rows.some((r) => r.source === "SIMULATED") ? (
        <p className="mt-3 flex items-center gap-2 text-meta text-muted">
          <SimulatedTag /> This demo workspace&apos;s usage comes from the simulator, through the same ingest API a real product would use.
        </p>
      ) : null}
    </>
  );
}
