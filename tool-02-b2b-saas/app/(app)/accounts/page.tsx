import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listAccounts } from "@/services/accounts";
import { DataTable, EmptyState, PageHeader, PhoneList, Tabs } from "@/ui/page";
import { FilterMenu } from "@/ui/filter-menu";
import { SimulatedTag, Status } from "@/ui/bits";

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
      <PageHeader
        title="Accounts"
        meta={`${rows.length} customer${rows.length === 1 ? "" : "s"}${ctx.actor.role === "CSM" ? " in your book" : ""}`}
        tabs={
          <Tabs
            label="Account views"
            items={[
              { href: link({ signals: undefined, stale: undefined, page: undefined }), label: "All accounts", active: !sp.signals && !sp.stale },
              { href: link({ signals: "1", stale: undefined, page: undefined }), label: "With open signals", active: sp.signals === "1" },
              { href: link({ stale: "1", signals: undefined, page: undefined }), label: "Stale usage", active: sp.stale === "1" },
            ]}
          />
        }
        toolbar={
          <>
            <form role="search" className="w-full max-w-xs">
              <label htmlFor="acct-q" className="sr-only">
                Search accounts
              </label>
              <input id="acct-q" name="q" defaultValue={sp.q} placeholder="Search name or domain" className="h-9 w-full rounded-control border border-rule-strong bg-surface px-3 text-table placeholder:text-faint focus:border-brand focus:outline-none" />
              {sp.signals ? <input type="hidden" name="signals" value={sp.signals} /> : null}
              {sp.stale ? <input type="hidden" name="stale" value={sp.stale} /> : null}
            </form>
            <FilterMenu
              label="Segment"
              items={[{ href: link({ segment: undefined, page: undefined }), label: "All segments", active: !sp.segment }, ...cfg.segments.map((s) => ({ href: link({ segment: s.key, page: undefined }), label: s.name, active: sp.segment === s.key }))]}
            />
          </>
        }
      />
      {rows.length ? (
        <>
        <PhoneList>
          {shown.map((r) => (
            <li key={r.account.id} className="py-4">
              <Link href={`/accounts/${r.account.id}`} className="font-semibold text-brand hover:underline">
                {r.account.name}
              </Link>
              <p className="text-meta text-muted">
                {r.csmName ?? "No CSM"}
                {r.ownerName ? ` and ${r.ownerName}` : ""}
                {r.renewalInDays !== null ? `. Renews ${renewsIn(r.renewalInDays).toLowerCase()}` : ""}
              </p>
              {r.openSignals ? (
                <Status tone="brand" className="mt-2">
                  {r.openSignals} {r.openSignals === 1 ? "signal" : "signals"} to review
                </Status>
              ) : null}
            </li>
          ))}
        </PhoneList>
        <DataTable caption="Accounts" head={[{ label: "Account" }, { label: "Customer success" }, { label: "Account owner" }, { label: "What's happening" }, { label: "Renews", className: "pr-5" }]}>
          {shown.map((r) => {
            const pct = r.sub && r.activeSeats !== null && r.sub.seatsPurchased ? Math.round((r.activeSeats / r.sub.seatsPurchased) * 100) : null;
            const stale = r.dataAgeDays === null || r.dataAgeDays > staleAfter;
            return (
              <tr key={r.account.id} className="hover:bg-hover/60">
                <td className="py-4 pr-4 pl-5">
                  <Link href={`/accounts/${r.account.id}`} className="font-semibold text-brand hover:underline">
                    {r.account.name}
                  </Link>
                  <span className="block text-meta text-muted">
                    {cfg.segments.find((s) => s.key === r.account.segment)?.name ?? "No segment"}, {r.account.industry ?? r.account.domain}
                  </span>
                </td>
                <td className="px-4 py-4">{r.csmName ?? <span className="text-faint">No CSM</span>}</td>
                <td className="px-4 py-4">{r.ownerName ?? <span className="text-faint">Seller queue</span>}</td>
                <td className="px-4 py-4">
                  {r.openSignals ? (
                    <Status tone="brand">
                      {r.openSignals} {r.openSignals === 1 ? "signal" : "signals"} to review
                    </Status>
                  ) : stale ? (
                    <Status tone="watch">{r.dataAgeDays === null ? "No usage received yet" : `Usage ${r.dataAgeDays} days old`}</Status>
                  ) : pct !== null && pct >= 90 ? (
                    <span>
                      Using {r.activeSeats} of {r.sub!.seatsPurchased} seats
                    </span>
                  ) : r.usagePacePct !== null && r.usagePacePct >= 110 ? (
                    <span>Using more than planned</span>
                  ) : (
                    <span className="text-muted">Steady</span>
                  )}
                </td>
                <td className="py-4 pr-5 pl-4">{r.renewalInDays !== null ? <span className={r.renewalInDays <= 60 ? "font-medium text-watch" : "text-muted"}>{renewsIn(r.renewalInDays)}</span> : <span className="text-faint">No term</span>}</td>
              </tr>
            );
          })}
        </DataTable>
        </>
      ) : (
        <EmptyState title="No accounts">
          {sp.q || sp.segment || sp.signals || sp.stale ? "Nothing matches these filters." : "RevOps imports accounts from the CRM (Settings, Imports) and pushes usage through the ingest API."}
        </EmptyState>
      )}
      {pages > 1 ? (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-table">
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
        <p className="mt-6 flex items-center gap-2 text-meta text-muted">
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
