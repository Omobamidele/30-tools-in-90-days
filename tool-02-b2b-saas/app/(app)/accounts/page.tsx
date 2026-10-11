import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listAccounts } from "@/services/accounts";
import { Chips, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Avatar, CompanyLogo, SimulatedTag, Status } from "@/ui/bits";

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
          <table className="w-full min-w-[760px] text-table">
            <caption className="sr-only">Accounts</caption>
            <thead className="text-left text-meta text-muted">
              <tr>
                <th className="px-5 pt-4 pb-2 font-medium">Customer</th>
                <th className="px-3 pt-4 pb-2 font-medium">Looked after by</th>
                <th className="px-3 pt-4 pb-2 font-medium">What&apos;s happening</th>
                <th className="px-5 pt-4 pb-2 font-medium">Renews</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const pct = r.sub && r.activeSeats !== null && r.sub.seatsPurchased ? Math.round((r.activeSeats / r.sub.seatsPurchased) * 100) : null;
                const stale = r.dataAgeDays === null || r.dataAgeDays > staleAfter;
                return (
                  <tr key={r.account.id} className="border-t border-rule hover:bg-sunken/50">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <CompanyLogo name={r.account.name} size={34} />
                        <span>
                          <Link href={`/accounts/${r.account.id}`} className="font-medium hover:underline">
                            {r.account.name}
                          </Link>
                          <span className="block text-meta text-muted">
                            {cfg.segments.find((s) => s.key === r.account.segment)?.name ?? "No segment"}, {r.account.industry ?? r.account.domain}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span className="flex -space-x-1">
                          <Avatar name={r.csmName} size={24} />
                          {r.ownerName ? <Avatar name={r.ownerName} size={24} /> : null}
                        </span>
                        <span className="text-table">
                          {r.csmName?.split(" ")[0] ?? "No CSM"}
                          <span className="text-muted">{r.ownerName ? ` and ${r.ownerName.split(" ")[0]}` : ", no seller"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {r.openSignals ? (
                        <Status tone="brand">
                          {r.openSignals} {r.openSignals === 1 ? "signal" : "signals"} to review
                        </Status>
                      ) : stale ? (
                        <Status tone="watch">{r.dataAgeDays === null ? "No usage received yet" : `Usage ${r.dataAgeDays} days old`}</Status>
                      ) : pct !== null && pct >= 90 ? (
                        <span>Using {r.activeSeats} of {r.sub!.seatsPurchased} seats</span>
                      ) : r.usagePacePct !== null && r.usagePacePct >= 110 ? (
                        <span>Using more than planned</span>
                      ) : (
                        <span className="text-muted">Steady</span>
                      )}
                    </td>
                    <td className="px-5 py-3">{r.renewalInDays !== null ? <span className={r.renewalInDays <= 60 ? "font-medium text-watch" : "text-muted"}>{renewsIn(r.renewalInDays)}</span> : <span className="text-faint">No term</span>}</td>
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

function renewsIn(days: number) {
  if (days < 0) return "Lapsed";
  if (days <= 45) return `In ${days} days`;
  const months = Math.round(days / 30);
  return `In ${months} month${months === 1 ? "" : "s"}`;
}
