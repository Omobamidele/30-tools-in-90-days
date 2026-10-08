import type { Metadata } from "next";
import Link from "next/link";
import { appCtx } from "@/services/app-ctx";
import { getLedger, type LedgerPeriod } from "@/services/ledger";
import { formatMoneyShort } from "@/core/money";
import { PageHeader, Panel, EmptyState } from "@/ui/page";
import { MoneyShort } from "@/ui/money";
import { formatDate } from "@/ui/format";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Money protected" };

const PERIODS: Array<[LedgerPeriod, string]> = [
  ["quarter", "This quarter"],
  ["year", "This year"],
  ["all", "All time"],
];

// Money protected (milestone 14): only what people recorded. The answer first, then the records.
export default async function MoneyProtectedPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period: LedgerPeriod = sp.period === "year" || sp.period === "all" ? sp.period : "quarter";
  const ctx = await appCtx();
  const l = await getLedger(ctx, period);
  const short = (m: number) => formatMoneyShort(m, l.currency);
  const nothing = !l.removed.items.length && !l.billed.items.length && !l.finished.items.length;
  const mark = "whitespace-nowrap underline decoration-on-canvas-mark decoration-2 underline-offset-[6px]";
  const Label = l.label[0].toUpperCase() + l.label.slice(1);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Money protected"
        meta="Only what your team recorded counts here. Suggestions from the system don't, until someone records what actually happened."
        actions={
          <>
            <nav aria-label="Period" data-surface className="flex rounded-control bg-sunken p-0.5">
              {PERIODS.map(([key, label]) => (
                <Link
                  key={key}
                  href={key === "quarter" ? "/value" : `/value?period=${key}`}
                  aria-current={period === key ? "page" : undefined}
                  className={cx(
                    "inline-flex h-7 items-center rounded-[5px] px-2.5 text-table transition-colors",
                    period === key ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(14_23_38/0.1)]" : "text-muted hover:text-ink",
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {/* A plain link: a <Link> would prefetch the export on every visit. */}
            <a
              href={`/api/reports/ledger?period=${period}`}
              download
              className="inline-flex h-8 items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken"
            >
              Export CSV
            </a>
          </>
        }
      />

      {nothing ? (
        <Panel>
          <EmptyState title={`Nothing recorded ${l.label} yet`}>
            Figures appear here when your team records what happened: a decision on an alert that gave rooms back or renegotiated a charge, a client change
            that was approved and applied, or the penalties a supplier actually charged after an event.
          </EmptyState>
        </Panel>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="answer" className="max-w-4xl">
            <h2 id="answer" className="font-display text-[26px] leading-[34px] font-medium text-on-canvas md:text-[30px] md:leading-[40px]">
              {l.removed.totalMinor > 0 ? (
                <>
                  {Label}, your team&apos;s recorded decisions removed <span className={mark}>{short(l.removed.totalMinor)}</span> of supplier penalties
                  {l.billed.totalMinor > 0 ? (
                    <>
                      , and <span className={mark}>{short(l.billed.totalMinor)}</span> of client changes were billed instead of absorbed
                    </>
                  ) : null}
                  .
                </>
              ) : l.billed.totalMinor === 0 ? (
                <>{Label}, no decisions that removed penalties and no billed client changes are recorded yet.</>
              ) : (
                <>
                  {Label}, <span className={mark}>{short(l.billed.totalMinor)}</span> of client changes were billed instead of absorbed. No decisions that
                  removed penalties are recorded yet.
                </>
              )}
            </h2>
            <p className="mt-3 text-section text-on-canvas-muted">
              {l.removed.roomNights ? `${l.removed.roomNights.toLocaleString("en-US")} room nights were given back before they became charges. ` : ""}
              {l.billed.marginMinor > 0 ? `Those changes carried ${short(l.billed.marginMinor)} of margin. ` : ""}
              {l.removed.missingFx || l.billed.missingFx ? "Some amounts are left out of the totals because an exchange rate is missing." : ""}
            </p>
          </section>

          <Panel title="Penalties removed by decisions" description="Alerts closed by giving rooms back or renegotiating, with the amount the person recorded.">
            {l.removed.items.length ? (
              <ul className="divide-y divide-rule">
                {l.removed.items.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 px-5 py-3 text-table">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{d.what}</p>
                      <p className="text-meta text-muted">
                        <Link href={`/events/${d.eventId}`} className="hover:text-ink hover:underline">
                          {d.eventName}
                        </Link>{" "}
                        · {d.type === "RELEASED_INVENTORY" ? "Gave rooms back" : "Renegotiated"}
                        {d.roomNights ? ` (${d.roomNights} room nights)` : ""} · {d.by ?? "Someone"}, {formatDate(d.at.toISOString().slice(0, 10))}
                      </p>
                      {d.note ? <p className="mt-0.5 text-meta text-faint">&ldquo;{d.note}&rdquo;</p> : null}
                    </div>
                    <div className="text-right">
                      <MoneyShort minor={d.amountMinor} currency={d.currency} className="font-display text-section font-medium text-settled" />
                      {d.currency !== l.currency && d.baseMinor !== null ? <span className="block text-meta text-faint">≈ {short(d.baseMinor)}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-table text-muted">None recorded {l.label}.</p>
            )}
          </Panel>

          <Panel title="Client changes billed" description="Change requests the client approved and that were applied, so the extra cost was charged rather than absorbed.">
            {l.billed.items.length ? (
              <ul className="divide-y divide-rule">
                {l.billed.items.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 px-5 py-3 text-table">
                    <div className="min-w-0 flex-1">
                      <Link href={`/changes/${c.id}`} className="font-medium hover:underline">
                        CR-{c.number}: {c.title}
                      </Link>
                      <p className="text-meta text-muted">
                        {c.eventName} · applied {formatDate(c.appliedAt.toISOString().slice(0, 10))}
                      </p>
                    </div>
                    <div className="text-right">
                      <MoneyShort minor={c.priceMinor} currency={c.currency} className="font-display text-section font-medium" />
                      <span className="block text-meta text-faint">
                        margin <MoneyShort minor={c.priceMinor - c.costMinor} currency={c.currency} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-table text-muted">None applied {l.label}.</p>
            )}
          </Panel>

          <Panel
            title="Finished events: projected and actually charged"
            description="What the system projected a week before each event, next to what suppliers actually charged. A comparison, not a saving: the difference can come from decisions, negotiation or luck."
          >
            {l.finished.items.length ? (
              <ul className="divide-y divide-rule">
                {l.finished.items.map((f) => {
                  const diff = f.projectedBaseMinor !== null && f.actualBaseMinor !== null ? f.actualBaseMinor - f.projectedBaseMinor : null;
                  return (
                    <li key={f.eventId} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-3 text-table">
                      <div className="min-w-0 flex-1">
                        <Link href={`/events/${f.eventId}/post-event`} className="font-medium hover:underline">
                          {f.name}
                        </Link>
                        <p className="text-meta text-muted">ended {formatDate(f.endDate)}</p>
                      </div>
                      <p className="text-right text-meta text-muted">
                        projected <span className="font-medium text-ink">{f.projectedBaseMinor === null ? "–" : short(f.projectedBaseMinor)}</span> · charged{" "}
                        <span className="font-medium text-ink">{f.actualBaseMinor === null ? "not recorded" : short(f.actualBaseMinor)}</span>
                        {diff !== null && diff !== 0 ? (
                          <span className={cx("block", diff < 0 ? "text-settled" : "text-risk")}>
                            {short(Math.abs(diff))} {diff < 0 ? "less" : "more"} than projected
                          </span>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-6 text-center text-table text-muted">No events finished {l.label}.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
