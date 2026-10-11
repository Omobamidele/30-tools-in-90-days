import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { RULE_TYPES, type RuleType } from "@/config/schema";
import type { SignalStatus } from "@/core/workflow";
import { DataTable, EmptyState, PageHeader, PhoneList, Tabs } from "@/ui/page";
import { FilterMenu } from "@/ui/filter-menu";
import { RULE_META, Status } from "@/ui/bits";
import { storyHeadline } from "@/ui/story";
import { ago, deadlineText } from "@/ui/format";
import { Target } from "@/ui/icons";

export const metadata: Metadata = { title: "Signals" };

type Search = { who?: string; type?: string; tab?: string; due?: string; q?: string };

const TABS: Array<{ key: string; label: string; statuses: SignalStatus[] }> = [
  { key: "review", label: "To review", statuses: ["NEW"] },
  { key: "snoozed", label: "Snoozed", statuses: ["SNOOZED"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "dismissed", label: "Dismissed", statuses: ["DISMISSED"] },
];

// Signals index (docs/09 rev. 5), a HubSpot-style index page: saved-view tabs, quick filters,
// and a table with one calm line per customer. Opening a row goes to the signal's record page.

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
  const terms = ctx.actor.config.terminology;
  const recent = (s: (typeof rows)[number]["signal"]) => ["NEW", "SNOOZED"].includes(s.status) || (s.triagedAt ?? s.lastEvaluatedAt).getTime() >= now.getTime() - 30 * 86_400_000;
  const shown = rows.filter((r) => tab.statuses.includes(r.signal.status) && recent(r.signal));
  const waiting = rows.filter((r) => r.signal.status === "NEW").length;
  const canMine = isCsm || ctx.actor.role === "CS_LEAD" || ctx.actor.role === "ADMIN";

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as Array<[string, string]>);
    return `/signals${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title="Signals"
        meta={waiting ? `${waiting} ${waiting === 1 ? "customer is" : "customers are"} waiting for review.` : "Nothing to review right now. New signals arrive after each morning's detection run."}
        actions={
          shown[0] && tab.key === "review" ? (
            <Link href={`/signals/${shown[0].signal.id}`} className="inline-flex h-10 items-center rounded-control bg-brand px-5 text-body font-medium text-white hover:bg-brand-strong">
              Review the next one
            </Link>
          ) : null
        }
        tabs={<Tabs label="Signal status" items={TABS.map((t) => ({ href: link({ tab: t.key === "review" ? undefined : t.key }), label: t.label, active: t.key === tab.key, count: rows.filter((r) => t.statuses.includes(r.signal.status) && recent(r.signal)).length }))} />}
        toolbar={
          <>
            <FilterMenu
              label="Accounts"
              items={[
                ...(canMine ? [{ href: link({ who: "mine" }), label: "Mine", active: who === "mine" }] : []),
                { href: link({ who: "all" }), label: isCsm ? "All my accounts" : "Everyone's", active: who === "all" },
              ]}
            />
            <FilterMenu
              label="Kind of signal"
              items={[{ href: link({ type: undefined }), label: "Any kind", active: !type }, ...RULE_TYPES.map((t) => ({ href: link({ type: t }), label: RULE_META[t].plain, active: type === t }))]}
            />
            <FilterMenu
              label="Due"
              items={[
                { href: link({ due: undefined }), label: "Any time", active: sp.due !== "overdue" },
                { href: link({ due: "overdue" }), label: "Overdue", active: sp.due === "overdue" },
              ]}
            />
          </>
        }
      />

      {shown.length ? (
        <>
        <PhoneList>
          {shown.map(({ signal: s, account }) => {
            const due = s.status === "NEW" ? deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal) : null;
            return (
              <li key={s.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/signals/${s.id}`} className="font-semibold text-brand hover:underline">
                    {account.name}
                  </Link>
                  {due ? <Status tone={due.tone}>{due.text}</Status> : null}
                </div>
                <p className="mt-1 text-body">{storyHeadline(s.type, s.evidence, terms)}</p>
              </li>
            );
          })}
        </PhoneList>
        <DataTable
          caption={`${tab.label} signals`}
          head={[{ label: "Customer" }, { label: "What happened" }, { label: tab.key === "review" ? "Due" : "When" }, { label: "Customer success" }, { label: "Goes to", className: "pr-5" }]}
          minWidth={900}
        >
          {shown.map(({ signal: s, account, triagerName, ownerName }) => {
            const due = s.status === "NEW" ? deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal) : null;
            return (
              <tr key={s.id} className="hover:bg-hover/60">
                <td className="py-4 pr-4 pl-5 align-top">
                  <Link href={`/signals/${s.id}`} className="font-semibold text-brand hover:underline">
                    {account.name}
                  </Link>
                  <span className="block text-meta text-muted">{RULE_META[s.type].plain}</span>
                </td>
                <td className="max-w-[420px] px-4 py-4 align-top">{storyHeadline(s.type, s.evidence, terms)}</td>
                <td className="px-4 py-4 align-top whitespace-nowrap">
                  {due ? <Status tone={due.tone}>{due.text}</Status> : s.status === "SNOOZED" ? <span className="text-muted">Back {s.snoozeUntil}</span> : <span className="text-muted">{ago(s.triagedAt ?? s.lastEvaluatedAt, now)}</span>}
                </td>
                <td className="px-4 py-4 align-top whitespace-nowrap">{triagerName ?? <span className="text-faint">No CSM</span>}</td>
                <td className="py-4 pr-5 pl-4 align-top whitespace-nowrap">{ownerName ?? <span className="text-faint">Seller queue</span>}</td>
              </tr>
            );
          })}
        </DataTable>
        </>
      ) : (
        <EmptyState icon={Target} title={tab.key === "review" ? "You're all caught up" : `Nothing ${tab.label.toLowerCase()}`}>
          {tab.key === "review" ? "New signals appear when a customer's usage crosses one of your rules. Detection runs every morning and after each usage upload." : "Signals from the last 30 days show here."}
        </EmptyState>
      )}
    </>
  );
}
