import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listAccounts } from "@/services/accounts";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { MoneyShort } from "@/ui/bits";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q = "" } = (await searchParams) as { q?: string };
  const ctx = await appCtx();
  const rows = q.trim() ? await listAccounts(ctx, { q: q.trim() }) : [];
  return (
    <>
      <PageHeader title="Search" meta={q ? `Accounts matching "${q}"` : "Search accounts by name or domain."} />
      <Panel>
        {rows.length ? (
          <ul className="divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.account.id}>
                <Link href={`/accounts/${r.account.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-sunken/60">
                  <span>
                    <span className="font-medium">{r.account.name}</span>
                    <span className="block text-meta text-muted">{r.account.domain}</span>
                  </span>
                  <span className="text-table text-muted">
                    {r.openSignals ? `${r.openSignals} open signal${r.openSignals === 1 ? "" : "s"} · ` : ""}
                    <MoneyShort minor={r.sub?.arrMinor} currency={ctx.actor.currency} empty="—" /> ARR
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title={q ? "No accounts match" : "Type a name or domain"}>{q ? "Check the spelling, or search by part of the domain." : undefined}</EmptyState>
        )}
      </Panel>
    </>
  );
}
