import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, KanbanSquare, List } from "@/ui/icons";
import { appCtx } from "@/services/app-ctx";
import { listObligations } from "@/services/obligations";
import { loadFx } from "@/services/fx";
import { convertMinor, formatMoney } from "@/core/money";
import { localDateOf } from "@/core/time";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { BoardToolbar } from "@/ui/board-toolbar";
import { MonthCalendar } from "@/ui/month-calendar";
import { stageColors } from "@/ui/kanban";
import { DeadlineList } from "./deadline-list";
import { DeadlineBoard } from "./deadline-board";
import { deadlineStages, stageFor } from "./board-groups";
import { toDeadlineItems } from "./to-items";
import { CalendarSubscribe } from "./calendar";
import { hasCalendarToken } from "@/services/calendar";
import { env } from "@/env";

export const metadata: Metadata = { title: "Deadlines" };

type SP = { who?: string; closed?: string; layout?: string; q?: string; month?: string };

export default async function DeadlinesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await appCtx();
  const layout = sp.layout === "board" || sp.layout === "calendar" ? sp.layout : "list";
  const showClosed = sp.closed === "1" && layout === "list";
  const q = (sp.q ?? "").trim().toLowerCase();
  // Default to "Mine"; someone who owns no deadlines (e.g. an ops director overseeing the team)
  // lands on everyone's instead of an empty page. An explicit ?who= always wins.
  const [own, fx] = await Promise.all([listObligations(ctx, { ownerId: ctx.actor.userId, includeDone: showClosed }), loadFx(ctx.db, ctx.actor.orgId)]);
  const mine = sp.who ? sp.who !== "all" : own.some((o) => o.status === "OPEN");
  const rows = mine ? own : await listObligations(ctx, { includeDone: showClosed });
  const matching = rows.filter((r) => !q || [r.label, r.eventName, r.supplierName].some((s) => s.toLowerCase().includes(q)));
  const items = await toDeadlineItems(ctx, matching);
  const orgCcy = ctx.actor.baseCurrency;

  const url = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged: SP = { layout: layout === "list" ? undefined : layout, who: sp.who, closed: showClosed ? "1" : undefined, q: sp.q, month: sp.month, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/deadlines${s ? `?${s}` : ""}`;
  };

  const totals: Record<string, string> = {};
  for (const s of deadlineStages) {
    let sum = 0;
    for (const i of items) {
      if (i.status !== "OPEN" || stageFor(i) !== s.key || i.kind !== "PAYMENT" || i.amountMinor === null || !i.currency) continue;
      const rate = fx.rate(i.currency, orgCcy);
      if (rate !== null) sum += convertMinor(Math.max(0, i.amountMinor - i.paidMinor), rate);
    }
    totals[s.key] = formatMoney(sum, orgCcy);
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Deadlines"
        meta="Supplier deadlines are shown in each event's timezone."
        actions={<CalendarSubscribe appUrl={env().APP_URL} hasToken={await hasCalendarToken(ctx)} />}
      />
      <BoardToolbar
        layouts={[
          { key: "list", label: "List", href: url({ layout: undefined }), icon: List, active: layout === "list" },
          { key: "board", label: "Board", href: url({ layout: "board", closed: undefined }), icon: KanbanSquare, active: layout === "board" },
          { key: "calendar", label: "Calendar", href: url({ layout: "calendar", closed: undefined }), icon: CalendarDays, active: layout === "calendar" },
        ]}
        chips={[
          { label: "Mine", href: url({ who: "mine" }), active: mine },
          { label: "Everyone's", href: url({ who: "all" }), active: !mine },
          ...(layout === "list" ? [{ label: showClosed ? "Hide closed" : "Show closed", href: url({ closed: showClosed ? undefined : "1" }), active: showClosed }] : []),
        ]}
        search={{ value: sp.q ?? "", placeholder: "Search deadlines, events, suppliers", hidden: { ...(layout !== "list" ? { layout } : {}), ...(sp.who ? { who: sp.who } : {}) } }}
        clearHref={url({ q: undefined })}
      />

      {layout === "board" ? (
        <DeadlineBoard items={items} totals={totals} />
      ) : layout === "calendar" ? (
        <MonthCalendar
          month={sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : localDateOf(ctx.now(), ctx.actor.orgTimezone).slice(0, 7)}
          today={localDateOf(ctx.now(), ctx.actor.orgTimezone)}
          hrefFor={(m) => url({ month: m })}
          items={matching
            .filter((r) => r.status === "OPEN")
            .map((r) => {
              const it = items.find((i) => i.id === r.id)!;
              const color = it.overdue ? stageColors.red : it.days <= 7 ? stageColors.amber : r.kind === "PAYMENT" ? stageColors.blue : stageColors.violet;
              return { id: r.id, start: localDateOf(r.dueAt, r.dueTz), label: r.label, sub: `${r.eventName} · ${r.supplierName}`, href: `/events/${r.eventId}/deadlines`, color };
            })}
        />
      ) : (
        <Panel>
          {items.length === 0 ? (
            <EmptyState title={mine ? "Nothing due that you own" : "No open deadlines"}>
              {mine ? (
                <>
                  <Link href={url({ who: "all" })} className="text-brand hover:underline">
                    See everyone&apos;s deadlines
                  </Link>{" "}
                  or activate a contract to create deadlines from its terms.
                </>
              ) : (
                "Deadlines are created from confirmed contract terms when a contract is activated."
              )}
            </EmptyState>
          ) : (
            <DeadlineList items={items} showEvent />
          )}
        </Panel>
      )}
    </div>
  );
}
