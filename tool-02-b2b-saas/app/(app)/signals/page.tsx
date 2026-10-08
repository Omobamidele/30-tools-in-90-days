import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { RULE_TYPES, type RuleType } from "@/config/schema";
import type { SignalStatus } from "@/core/workflow";
import { formatMoneyShort } from "@/core/money";
import { Chips, EmptyState, PageHeader, Tabs } from "@/ui/page";
import { CompanyLogo, Handoff, MoneyShort, RULE_META, RuleTag, Status } from "@/ui/bits";
import { ago, deadlineText, priorityWord } from "@/ui/format";

export const metadata: Metadata = { title: "Signals" };

type Search = { who?: string; type?: string; tab?: string; due?: string; q?: string };

const TABS: Array<{ key: string; label: string; statuses: SignalStatus[] }> = [
  { key: "review", label: "To review", statuses: ["NEW"] },
  { key: "snoozed", label: "Snoozed", statuses: ["SNOOZED"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "dismissed", label: "Dismissed", statuses: ["DISMISSED"] },
];

export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const sp = (await searchParams) as Search;
  const ctx = await appCtx();
  const isCsm = ctx.actor.role === "CSM";
  const who = sp.who ?? (isCsm ? "mine" : "all");
  const type = RULE_TYPES.includes(sp.type as RuleType) ? (sp.type as RuleType) : undefined;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const rows = await listSignals(ctx, { who, type, overdue: sp.due === "overdue", q: sp.q });
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;
  const high = ctx.actor.config.detection.highPriorityScore;
  const recent = (s: (typeof rows)[number]["signal"]) => ["NEW", "SNOOZED"].includes(s.status) || (s.triagedAt ?? s.lastEvaluatedAt).getTime() >= now.getTime() - 30 * 86_400_000;
  const shown = rows.filter((r) => tab.statuses.includes(r.signal.status) && recent(r.signal));
  const waiting = rows.filter((r) => r.signal.status === "NEW");

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as Array<[string, string]>);
    return `/signals${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Signals"
        meta={waiting.length ? `${waiting.length} customers to review · about ${formatMoneyShort(waiting.reduce((n, r) => n + (r.signal.estValueMinor ?? 0), 0), currency)} a year` : "Nothing to review right now"}
      />
      <Tabs
        label="Signal status"
        items={TABS.map((t) => ({ href: link({ tab: t.key === "review" ? undefined : t.key }), label: t.label, active: t.key === tab.key, count: rows.filter((r) => t.statuses.includes(r.signal.status) && recent(r.signal)).length }))}
      />
      <div className="mt-4 mb-4 flex flex-wrap items-center gap-2">
        <Chips
          items={[
            ...(isCsm || ctx.actor.role === "CS_LEAD" || ctx.actor.role === "ADMIN" ? [{ href: link({ who: "mine" }), label: "Mine", active: who === "mine" }] : []),
            { href: link({ who: "all" }), label: isCsm ? "All my accounts" : "Everyone", active: who === "all" },
            { href: link({ due: sp.due === "overdue" ? undefined : "overdue" }), label: "Overdue", active: sp.due === "overdue" },
          ]}
        />
        <span aria-hidden className="mx-1 h-5 w-px bg-rule-strong" />
        <Chips
          items={[
            { href: link({ type: undefined }), label: "All kinds", active: !type },
            ...RULE_TYPES.map((t) => ({ href: link({ type: t }), label: RULE_META[t].plain, active: type === t })),
          ]}
        />
      </div>

      <section className="panel overflow-hidden" aria-label={tab.label}>
        {shown.length ? (
          <ul className="divide-y divide-rule">
            {shown.map(({ signal: s, account, triagerName, ownerName }) => {
              const due = deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal);
              const p = priorityWord(s.priority, high);
              return (
                <li key={s.id}>
                  <Link href={`/signals/${s.id}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 sm:items-center sm:gap-x-4 gap-y-1 px-5 py-4 hover:bg-hover/60">
                    <CompanyLogo name={account.name} size={40} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-section font-semibold">{account.name}</span>
                        <RuleTag type={s.type} />
                        {s.status === "NEW" && s.priority >= high ? <Status tone="brand">{p.text}</Status> : null}
                      </span>
                      <span className="mt-0.5 block text-table text-muted">{s.explanation}</span>
                      <span className="mt-1.5 block">
                        <Handoff from={triagerName} to={ownerName} />
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5 text-right">
                      <span>
                        <MoneyShort minor={s.estValueMinor} currency={currency} className="text-section font-semibold" empty="—" />
                        {s.estValueMinor !== null ? <span className="block text-meta text-faint">a year</span> : null}
                      </span>
                      {s.status === "NEW" ? (
                        <Status tone={due.tone}>{due.text}</Status>
                      ) : s.status === "SNOOZED" ? (
                        <Status tone="neutral">Back {s.snoozeUntil}</Status>
                      ) : (
                        <span className="text-meta text-faint">{ago(s.triagedAt ?? s.lastEvaluatedAt, now)}</span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title={tab.key === "review" ? "You're all caught up" : `Nothing ${tab.label.toLowerCase()}`}>
            {tab.key === "review" ? "New signals appear when a customer's usage crosses one of your rules. Detection runs every morning and after each usage upload." : "Signals from the last 30 days show here."}
          </EmptyState>
        )}
      </section>
      {isCsm && tab.key === "review" && shown.length ? <p className="mt-3 text-meta text-faint">Accept sends it to a seller with your note. Dismiss, with a reason, tells RevOps what isn&apos;t worth raising.</p> : null}
    </>
  );
}
