import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listSignals } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { RULE_TYPES, type RuleType } from "@/config/schema";
import type { SignalStatus } from "@/core/workflow";
import { Chips, EmptyState, Tabs } from "@/ui/page";
import { Avatar, RULE_META, Status, TypeBadge } from "@/ui/bits";
import { storyHeadline } from "@/ui/story";
import { ago, deadlineText } from "@/ui/format";
import { ArrowLeft } from "@/ui/icons";
import { cx } from "@/ui/cx";
import { SignalStory } from "./signal-story";

export const metadata: Metadata = { title: "Signals" };

type Search = { who?: string; type?: string; tab?: string; due?: string; q?: string; open?: string };

const TABS: Array<{ key: string; label: string; statuses: SignalStatus[] }> = [
  { key: "review", label: "To review", statuses: ["NEW"] },
  { key: "snoozed", label: "Snoozed", statuses: ["SNOOZED"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "dismissed", label: "Dismissed", statuses: ["DISMISSED"] },
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

  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...over }).filter(([, v]) => v) as Array<[string, string]>);
    return `/signals${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <header className={cx("mb-5", sp.open ? "hidden lg:block" : "")}>
        <h1 className="text-display font-semibold">Signals</h1>
        <p className="mt-1 text-body text-muted">
          {rows.filter((r) => r.signal.status === "NEW").length
            ? "Customers whose usage suggests they're ready for more. Review each one, then hand it to a seller or say why not."
            : "Nothing to review right now. New signals arrive after each morning's detection run."}
        </p>
      </header>

      <div className={sp.open ? "hidden lg:block" : ""}>
        <Tabs
          label="Signal status"
          items={TABS.map((t) => ({ href: link({ tab: t.key === "review" ? undefined : t.key, open: undefined }), label: t.label, active: t.key === tab.key, count: rows.filter((r) => t.statuses.includes(r.signal.status) && recent(r.signal)).length }))}
        />
        <div className="mt-4 mb-5 flex flex-wrap items-center gap-2">
          <Chips
            items={[
              ...(isCsm || ctx.actor.role === "CS_LEAD" || ctx.actor.role === "ADMIN" ? [{ href: link({ who: "mine", open: undefined }), label: "Mine", active: who === "mine" }] : []),
              { href: link({ who: "all", open: undefined }), label: isCsm ? "All my accounts" : "Everyone", active: who === "all" },
              { href: link({ due: sp.due === "overdue" ? undefined : "overdue", open: undefined }), label: "Overdue", active: sp.due === "overdue" },
            ]}
          />
          <span aria-hidden className="mx-1 h-5 w-px bg-rule-strong" />
          <Chips
            items={[
              { href: link({ type: undefined, open: undefined }), label: "All kinds", active: !type },
              ...RULE_TYPES.map((t) => ({ href: link({ type: t, open: undefined }), label: RULE_META[t].plain, active: type === t })),
            ]}
          />
        </div>
      </div>

      {shown.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <nav aria-label={`${tab.label} signals`} className={cx("lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto", sp.open ? "hidden lg:block" : "")}>
            <ul className="flex flex-col gap-1.5">
              {shown.map(({ signal: s, account, triagerName, ownerName }) => {
                const active = s.id === openId;
                const due = s.status === "NEW" ? deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal) : null;
                return (
                  <li key={s.id}>
                    <Link
                      href={link({ open: s.id })}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "flex gap-3 rounded-panel border p-3.5 transition-colors",
                        active ? "border-brand/40 bg-brand-tint shadow-card" : "border-transparent hover:border-rule hover:bg-sunken/70",
                      )}
                    >
                      <TypeBadge type={s.type} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-semibold">{account.name}</span>
                          {due ? (
                            <Status tone={due.tone} className="shrink-0">
                              {due.text}
                            </Status>
                          ) : s.status === "SNOOZED" ? (
                            <span className="shrink-0 text-meta text-faint">Back {s.snoozeUntil}</span>
                          ) : (
                            <span className="shrink-0 text-meta text-faint">{ago(s.triagedAt ?? s.lastEvaluatedAt, now)}</span>
                          )}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-table text-muted">{storyHeadline(s.type, s.evidence, terms)}</span>
                        <span className="mt-2 flex items-center gap-1.5 text-meta text-faint">
                          <span className="flex -space-x-1">
                            <Avatar name={triagerName} size={18} />
                            {ownerName ? <Avatar name={ownerName} size={18} /> : null}
                          </span>
                          {triagerName?.split(" ")[0] ?? "No CSM"}
                          {ownerName ? ` to ${ownerName.split(" ")[0]}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <section aria-label="Selected signal" className={cx("min-w-0 rounded-panel border border-rule bg-surface p-5 shadow-card sm:p-7", sp.open ? "" : "hidden lg:block")}>
            {sp.open ? (
              <Link href={link({ open: undefined })} className="mb-4 inline-flex items-center gap-1.5 text-table font-medium text-brand lg:hidden">
                <ArrowLeft size={16} aria-hidden /> All signals
              </Link>
            ) : null}
            {openId ? <SignalStory key={openId} ctx={ctx} id={openId} layout="pane" /> : <p className="text-muted">Pick a signal from the list.</p>}
          </section>
        </div>
      ) : (
        <div className="panel">
          <EmptyState title={tab.key === "review" ? "You're all caught up" : `Nothing ${tab.label.toLowerCase()}`}>
            {tab.key === "review" ? "New signals appear when a customer's usage crosses one of your rules. Detection runs every morning and after each usage upload." : "Signals from the last 30 days show here."}
          </EmptyState>
        </div>
      )}
    </>
  );
}
