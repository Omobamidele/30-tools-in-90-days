import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { RULE_TYPES, type RuleType } from "@/config/schema";
import type { SignalStatus } from "@/core/workflow";
import { formatMoneyShort } from "@/core/money";
import { Chips, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Avatar, MoneyShort, RULE_META, RuleTag, Status } from "@/ui/bits";
import { ago, deadlineText, priorityWord } from "@/ui/format";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Signals" };

type Search = { who?: string; type?: string; layout?: string; due?: string; q?: string };

const COLUMNS: Array<{ status: SignalStatus; title: string; hint: string }> = [
  { status: "NEW", title: "New", hint: "Waiting for triage" },
  { status: "SNOOZED", title: "Snoozed", hint: "Back on their date" },
  { status: "ACCEPTED", title: "Accepted", hint: "Last 7 days" },
  { status: "DISMISSED", title: "Dismissed", hint: "Last 7 days" },
];

export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const sp = (await searchParams) as Search;
  const ctx = await appCtx();
  const isCsm = ctx.actor.role === "CSM";
  const who = sp.who ?? (isCsm ? "mine" : "all");
  const type = RULE_TYPES.includes(sp.type as RuleType) ? (sp.type as RuleType) : undefined;
  const layout = sp.layout === "list" ? "list" : "board";
  const rows = await listSignals(ctx, { who, type, overdue: sp.due === "overdue", q: sp.q });
  const now = ctx.now();
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const visible = rows.filter(({ signal: s }) => ["NEW", "SNOOZED"].includes(s.status) || (s.status !== "EXPIRED" && (s.triagedAt ?? s.lastEvaluatedAt).getTime() >= weekAgo));
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as Array<[string, string]>);
    const s = p.toString();
    return `/signals${s ? `?${s}` : ""}`;
  };
  const waiting = visible.filter((r) => r.signal.status === "NEW");
  const waitingValue = waiting.reduce((n, r) => n + (r.signal.estValueMinor ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Signals"
        meta={
          waiting.length
            ? `${waiting.length} waiting for triage · ${formatMoneyShort(waitingValue, currency)} estimated a year`
            : "Nothing waiting for triage"
        }
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
        <div className="mt-4 flex flex-col gap-2">
          <Chips
            items={[
              ...(isCsm || ctx.actor.role === "CS_LEAD" || ctx.actor.role === "ADMIN" ? [{ href: link({ who: "mine" }), label: "Mine", active: who === "mine" }] : []),
              { href: link({ who: "all" }), label: isCsm ? "All my book" : "Everyone", active: who === "all" },
              ...(isCsm ? [] : [{ href: link({ who: "unassigned" }), label: "No CSM", active: who === "unassigned" }]),
              { href: link({ due: sp.due === "overdue" ? undefined : "overdue" }), label: "Overdue", active: sp.due === "overdue", count: rows.filter((r) => r.signal.status === "NEW" && r.signal.triageDueAt < now).length },
            ]}
          />
          <Chips
            items={[
              { href: link({ type: undefined }), label: "All types", active: !type },
              ...RULE_TYPES.map((t) => ({ href: link({ type: t }), label: RULE_META[t].label, active: type === t, count: rows.filter((r) => r.signal.type === t && r.signal.status === "NEW").length })),
            ]}
          />
        </div>
      </PageHeader>

      {isCsm && waiting.length ? (
        <p className="mb-4 text-table text-muted">Accept sends it to a seller with your note. Dismiss, with a reason, tells RevOps what isn&apos;t worth raising.</p>
      ) : null}

      {layout === "board" ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = visible.filter((r) => r.signal.status === col.status);
            const value = items.reduce((n, r) => n + (r.signal.estValueMinor ?? 0), 0);
            return (
              <section key={col.status} aria-labelledby={`col-${col.status}`} className="flex min-w-0 flex-col rounded-panel bg-sunken/70 p-2">
                <header className="flex items-baseline justify-between px-2 pt-1 pb-2">
                  <h2 id={`col-${col.status}`} className="text-body font-semibold">
                    {col.title} <span className="num font-normal text-muted">{items.length}</span>
                  </h2>
                  <span className="text-meta text-muted">{items.length ? formatMoneyShort(value, currency) : col.hint}</span>
                </header>
                <ul className="flex flex-col gap-2">
                  {items.map(({ signal: s, account, triagerName }) => {
                    const due = deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal);
                    return (
                      <li key={s.id}>
                        <Link href={`/signals/${s.id}`} className="block rounded-panel border border-rule bg-surface p-3 hover:border-field focus-visible:border-brand">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="block truncate text-body font-semibold">{account.name}</span>
                              <RuleTag type={s.type} className="mt-1" />
                            </span>
                            <MoneyShort minor={s.estValueMinor} currency={currency} className="shrink-0 text-body font-medium" empty="—" />
                          </div>
                          <p className="mt-2 text-table text-muted">{s.explanation}</p>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            {s.status === "NEW" ? <Status tone={due.tone}>{due.text}</Status> : s.status === "SNOOZED" ? <span className="text-meta text-muted">Until {s.snoozeUntil}</span> : <span className="text-meta text-muted">{ago(s.triagedAt ?? s.lastEvaluatedAt, now)}</span>}
                            <span className="flex items-center gap-1 text-meta text-muted">
                              <Avatar name={triagerName} size={16} />
                              {triagerName ?? "No CSM"}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                  {!items.length ? <li className="rounded-panel border border-dashed border-rule-strong px-3 py-6 text-center text-meta text-muted">{col.status === "NEW" ? "No new signals." : "Nothing here."}</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <Panel bodyClassName="overflow-x-auto">
          {visible.length ? (
            <table className="w-full min-w-[880px] text-table">
              <caption className="sr-only">Signals</caption>
              <thead className="border-b border-rule text-left text-meta text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Priority</th>
                  <th className="px-2 py-2 font-medium">Account</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                  <th className="px-2 py-2 text-right font-medium">Est. a year</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">CSM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {visible.map(({ signal: s, account, triagerName }) => {
                  const due = deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal);
                  return (
                    <tr key={s.id} className="hover:bg-sunken/50">
                      <td className="px-4 py-2 text-muted">{priorityWord(s.priority, ctx.actor.config.detection.highPriorityScore).text.replace(" priority", "")}</td>
                      <td className="px-2 py-2">
                        <Link href={`/signals/${s.id}`} className="font-medium hover:underline">
                          {account.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <RuleTag type={s.type} />
                        <span className="mt-1 block text-muted">{s.explanation}</span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyShort minor={s.estValueMinor} currency={currency} empty="—" />
                      </td>
                      <td className="px-2 py-2">{s.status === "NEW" ? <Status tone={due.tone}>{due.text}</Status> : <span className="text-muted capitalize">{s.status.toLowerCase()}</span>}</td>
                      <td className="px-4 py-2 text-muted">{triagerName ?? "No CSM"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No signals match these filters">Signals appear when an account&apos;s usage crosses one of your rules. Detection runs every morning and after each usage upload.</EmptyState>
          )}
        </Panel>
      )}
    </>
  );
}
