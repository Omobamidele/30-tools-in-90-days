import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { RULE_TYPES, type RuleType } from "@/config/schema";
import type { SignalStatus } from "@/core/workflow";
import { Chips, EmptyState, PageHeader, Tabs } from "@/ui/page";
import { CompanyLogo, RULE_META, Status } from "@/ui/bits";
import { storyHeadline } from "@/ui/story";
import { ago, deadlineText } from "@/ui/format";
import { ArrowLeft, CheckCircle, Clock, Target, XCircle, type IconType } from "@/ui/icons";
import { cx } from "@/ui/cx";
import { SignalStory } from "./signal-story";

export const metadata: Metadata = { title: "Signals" };

type Search = { who?: string; type?: string; tab?: string; due?: string; q?: string; open?: string };

const TABS: Array<{ key: string; label: string; statuses: SignalStatus[]; icon: IconType }> = [
  { key: "review", label: "To review", statuses: ["NEW"], icon: Target },
  { key: "snoozed", label: "Snoozed", statuses: ["SNOOZED"], icon: Clock },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"], icon: CheckCircle },
  { key: "dismissed", label: "Dismissed", statuses: ["DISMISSED"], icon: XCircle },
];

// The signal inbox (docs/09 rev. 3): a list on the left and the selected signal's story on the
// right, so a CSM decides without losing their place (the Linear triage / Front pattern). On
// phones the list and the story are separate screens.

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
  const openId = sp.open ?? shown[0]?.signal.id;
  const waiting = rows.filter((r) => r.signal.status === "NEW").length;

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as Array<[string, string]>);
    return `/signals${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader
        className={sp.open ? "hidden lg:block" : ""}
        title="Signals"
        meta={waiting ? `${waiting} ${waiting === 1 ? "customer" : "customers"} to review. Hand each one to a seller, or say why not.` : "Nothing to review right now. New signals arrive after each morning's detection run."}
        tabs={
          <Tabs
            label="Signal status"
            items={TABS.map((t) => ({ href: link({ tab: t.key === "review" ? undefined : t.key, open: undefined }), label: t.label, icon: t.icon, active: t.key === tab.key, count: rows.filter((r) => t.statuses.includes(r.signal.status) && recent(r.signal)).length }))}
          />
        }
        toolbar={
          <>
            <Chips
              items={[
                ...(isCsm || ctx.actor.role === "CS_LEAD" || ctx.actor.role === "ADMIN" ? [{ href: link({ who: "mine", open: undefined }), label: "Mine", active: who === "mine" }] : []),
                { href: link({ who: "all", open: undefined }), label: isCsm ? "All my accounts" : "Everyone", active: who === "all" },
                { href: link({ due: sp.due === "overdue" ? undefined : "overdue", open: undefined }), label: "Overdue", active: sp.due === "overdue" },
              ]}
            />
            <span aria-hidden className="mx-1 h-6 w-px bg-rule" />
            <Chips
              items={[
                { href: link({ type: undefined, open: undefined }), label: "All kinds", active: !type },
                ...RULE_TYPES.map((t) => ({ href: link({ type: t, open: undefined }), label: RULE_META[t].plain, icon: RULE_META[t].icon, active: type === t })),
              ]}
            />
          </>
        }
      />

      {shown.length ? (
        <div className={cx("grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[380px_minmax(0,1fr)]", sp.open ? "pt-4 lg:pt-0" : "")}>
          <nav aria-label={`${tab.label} signals`} className={cx("panel overflow-hidden lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto", sp.open ? "hidden lg:block" : "")}>
            <ul className="divide-y divide-rule">
              {shown.map(({ signal: s, account, triagerName, ownerName }) => {
                const active = s.id === openId;
                const due = s.status === "NEW" ? deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal) : null;
                return (
                  <li key={s.id}>
                    <Link
                      href={link({ open: s.id })}
                      aria-current={active ? "true" : undefined}
                      className={cx("relative flex gap-3 px-5 py-4", active ? "bg-brand-tint/60" : "hover:bg-hover/60")}
                    >
                      {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-brand" /> : null}
                      <CompanyLogo name={account.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{account.name}</span>
                          {due ? (
                            <Status tone={due.tone} className="shrink-0">
                              {due.text}
                            </Status>
                          ) : s.status === "SNOOZED" ? (
                            <span className="shrink-0 text-meta text-muted">Back {s.snoozeUntil}</span>
                          ) : (
                            <span className="shrink-0 text-meta text-muted">{ago(s.triagedAt ?? s.lastEvaluatedAt, now)}</span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-table text-text">{storyHeadline(s.type, s.evidence, terms)}</span>
                        <span className="mt-1.5 flex items-center gap-1.5 text-meta text-muted">
                          <RuleIcon type={s.type} />
                          {RULE_META[s.type].plain}, {triagerName?.split(" ")[0] ?? "no CSM"}
                          {ownerName ? ` to ${ownerName.split(" ")[0]}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label="Selected signal" className={cx("panel min-w-0 p-6 sm:p-8", sp.open ? "" : "hidden lg:block")}>
            {sp.open ? (
              <Link href={link({ open: undefined })} className="mb-4 inline-flex items-center gap-1.5 text-table font-medium text-brand lg:hidden">
                <ArrowLeft size={16} aria-hidden /> All signals
              </Link>
            ) : null}
            {openId ? <SignalStory key={openId} ctx={ctx} id={openId} layout="pane" /> : null}
          </section>
        </div>
      ) : (
        <div className="panel">
          <EmptyState icon={tab.icon} title={tab.key === "review" ? "You're all caught up" : `Nothing ${tab.label.toLowerCase()}`}>
            {tab.key === "review" ? "New signals appear when a customer's usage crosses one of your rules. Detection runs every morning and after each usage upload." : "Signals from the last 30 days show here."}
          </EmptyState>
        </div>
      )}
    </>
  );
}

function RuleIcon({ type }: { type: RuleType }) {
  const Icon = RULE_META[type].icon;
  return <Icon size={14} aria-hidden />;
}
