import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, KanbanSquare, List } from "@/ui/icons";
import { appCtx } from "@/services/app-ctx";
import { allowedTransitions, eventStatusLabels, listEvents, type EventStatus } from "@/services/events";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { ButtonLink, EmptyState, PageHeader, Panel } from "@/ui/page";
import { Table, Td, Th, Tr } from "@/ui/table";
import { Status, eventStatusTone } from "@/ui/status";
import { formatDateRange, relativeDue } from "@/ui/format";
import { cx } from "@/ui/cx";
import { getPortfolio } from "@/services/exposure";
import { listObligations } from "@/services/obligations";
import { actualPenaltiesByEvent } from "@/services/post-event";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { localDateOf } from "@/core/time";
import { Money } from "@/ui/money";
import { Person } from "@/ui/avatar";
import { BoardToolbar } from "@/ui/board-toolbar";
import { MonthCalendar } from "@/ui/month-calendar";
import { stageColors, type StageColor } from "@/ui/kanban";
import { EventBoard, type EventCardView, type StageView } from "./event-board";
import { inArray } from "drizzle-orm";
import { eventMembers } from "@/db/schema";
import { CoverThumb } from "@/ui/photo";
import { findCover } from "@/config/imagery";

export const metadata: Metadata = { title: "Events" };

const listViews = [
  { key: "open", label: "Open", statuses: ["PLANNING", "CONTRACTED", "LIVE", "POSTPONED"] },
  { key: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "closed", label: "Closed", statuses: ["RECONCILED", "CANCELLED"] },
  { key: "all", label: "All", statuses: null },
] as const;

const stageDefs: Array<{ key: string; statuses: EventStatus[]; color: StageColor; drop: EventStatus | null; title?: string }> = [
  { key: "PLANNING", statuses: ["PLANNING"], color: "violet", drop: "PLANNING" },
  { key: "CONTRACTED", statuses: ["CONTRACTED"], color: "blue", drop: "CONTRACTED" },
  { key: "LIVE", statuses: ["LIVE"], color: "teal", drop: "LIVE" },
  { key: "DELIVERED", statuses: ["DELIVERED"], color: "amber", drop: "DELIVERED" },
  { key: "RECONCILED", statuses: ["RECONCILED"], color: "green", drop: "RECONCILED" },
  { key: "CLOSED", statuses: ["CANCELLED", "POSTPONED"], color: "grey", drop: "CANCELLED", title: "Cancelled / postponed" },
];
const OPEN = new Set<EventStatus>(["PLANNING", "CONTRACTED", "LIVE", "POSTPONED"]);

type SP = { layout?: string; view?: string; f?: string; q?: string; month?: string };

export default async function EventsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await appCtx();
  const cfg = ctx.actor.config;
  const now = ctx.now();
  const orgCcy = ctx.actor.baseCurrency;
  const layout = sp.layout === "list" || sp.layout === "calendar" ? sp.layout : "board";
  const f = sp.f ?? "all";
  const q = (sp.q ?? "").trim().toLowerCase();

  const [all, portfolio, deadlines] = await Promise.all([listEvents(ctx), getPortfolio(ctx), listObligations(ctx)]);
  const closedIds = all.filter((e) => !OPEN.has(e.status)).map((e) => e.id);
  const [penalties, memberRows] = await Promise.all([
    actualPenaltiesByEvent(ctx, closedIds),
    all.length ? ctx.db.select().from(eventMembers).where(inArray(eventMembers.eventId, all.map((e) => e.id))) : Promise.resolve([]),
  ]);
  const canMove = (e: (typeof all)[number]) =>
    can(ctx.actor, "event.edit", { ownerId: e.ownerId, memberIds: memberRows.filter((m) => m.eventId === e.id).map((m) => m.userId) });
  const rowById = new Map(portfolio.rows.map((r) => [r.eventId, r]));
  const nextByEvent = new Map<string, (typeof deadlines)[number]>();
  for (const o of deadlines) if (o.dueAt >= now && !nextByEvent.has(o.eventId)) nextByEvent.set(o.eventId, o);

  const isOver = (id: string) => rowById.get(id)?.exposure.overThreshold ?? false;
  const isIncomplete = (id: string) => rowById.has(id) && !rowById.get(id)!.exposure.complete;
  const matchesQ = (e: (typeof all)[number]) => !q || [e.name, e.clientName, e.destination ?? "", e.ownerName].some((s) => s.toLowerCase().includes(q));
  const byFilter = (e: (typeof all)[number]) =>
    f === "mine" ? e.ownerId === ctx.actor.userId : f === "over" ? isOver(e.id) : f === "incomplete" ? isIncomplete(e.id) : true;
  const filtered = all.filter((e) => matchesQ(e) && byFilter(e));

  const plural = term(cfg, "event", { plural: true });
  const canCreate = can(ctx.actor, "event.create");
  const newButton = canCreate ? (
    <ButtonLink href="/events/new" variant="primary">
      New {term(cfg, "event", { lower: true })}
    </ButtonLink>
  ) : null;

  const url = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { layout, f, q: sp.q, view: sp.view, month: sp.month, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "layout" && v === "board") && !(k === "f" && v === "all")) p.set(k, v);
    const s = p.toString();
    return `/events${s ? `?${s}` : ""}`;
  };
  const count = (pred: (e: (typeof all)[number]) => boolean) => all.filter((e) => matchesQ(e) && pred(e)).length;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title={plural} meta={`${filtered.length} of ${all.length} · money in ${orgCcy}`} actions={newButton} />
      <BoardToolbar
        layouts={[
          { key: "board", label: "Board", href: url({ layout: "board" }), icon: KanbanSquare, active: layout === "board" },
          { key: "list", label: "List", href: url({ layout: "list" }), icon: List, active: layout === "list" },
          { key: "calendar", label: "Calendar", href: url({ layout: "calendar" }), icon: CalendarDays, active: layout === "calendar" },
        ]}
        chips={[
          { label: "All", href: url({ f: "all" }), active: f === "all", count: count(() => true) },
          { label: "Mine", href: url({ f: "mine" }), active: f === "mine", count: count((e) => e.ownerId === ctx.actor.userId) },
          { label: "Above your limit", href: url({ f: "over" }), active: f === "over", count: count((e) => isOver(e.id)), tone: "risk" },
          { label: "Figures missing", href: url({ f: "incomplete" }), active: f === "incomplete", count: count((e) => isIncomplete(e.id)), tone: "watch" },
        ]}
        search={{ value: sp.q ?? "", placeholder: `Search ${plural.toLowerCase()}, clients, owners`, hidden: { ...(layout !== "board" ? { layout } : {}), ...(f !== "all" ? { f } : {}) } }}
        clearHref={url({ q: undefined })}
      />

      {all.length === 0 ? (
        <Panel>
          <EmptyState title={`No ${plural.toLowerCase()} yet`} actions={newButton}>
            Create an {term(cfg, "event", { lower: true })}, then add its supplier contracts.
          </EmptyState>
        </Panel>
      ) : layout === "board" ? (
        <EventBoard
          canCreate={canCreate}
          statusLabels={eventStatusLabels}
          stages={stageDefs.map((s): StageView => {
            const inStage = filtered.filter((e) => s.statuses.includes(e.status));
            const open = s.statuses.some((st) => OPEN.has(st));
            const total = inStage.reduce((sum, e) => sum + (open ? (rowById.get(e.id)?.base?.currentMinor ?? 0) : (penalties.totals.get(e.id) ?? 0)), 0);
            return {
              key: s.key,
              title: s.title ?? eventStatusLabels[s.statuses[0]],
              color: s.color,
              statuses: s.statuses,
              dropStatus: s.drop,
              totalText: formatMoneyShort(total, orgCcy),
              totalLabel: `${open ? "Penalties if nothing changes in this stage" : "Penalties actually paid"}: ${formatMoney(total, orgCcy)}`,
            };
          })}
          cards={filtered.map((e): EventCardView => {
            const row = rowById.get(e.id);
            const next = nextByEvent.get(e.id);
            const rel = next ? relativeDue(next.dueAt, next.dueTz, now) : null;
            const open = OPEN.has(e.status);
            const pen = penalties.totals.get(e.id);
            return {
              id: e.id,
              name: e.name,
              clientName: e.clientName,
              dates: formatDateRange(e.startDate, e.endDate),
              destination: e.destination,
              cover: e.coverImage,
              status: e.status,
              ownerName: e.ownerName,
              amountText: open ? (row?.base ? formatMoneyShort(row.base.currentMinor, orgCcy) : null) : pen !== undefined ? formatMoneyShort(pen, orgCcy) : null,
              amountLabel: open ? "If nothing changes" : "Penalties paid",
              over: row?.exposure.overThreshold ?? false,
              incomplete: row ? !row.exposure.complete : false,
              bearer: open && row?.base ? { agency: row.base.agencyMinor, client: row.base.clientMinor, unassigned: row.base.unassignedMinor } : null,
              next: next && rel ? { label: next.label, relText: rel.text, tone: rel.days <= 7 ? "risk" : rel.days <= 21 ? "watch" : "muted" } : null,
              allowed: allowedTransitions(e.status),
              canMove: canMove(e),
            };
          })}
        />
      ) : layout === "calendar" ? (
        <MonthCalendar
          month={sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : localDateOf(now, ctx.actor.orgTimezone).slice(0, 7)}
          today={localDateOf(now, ctx.actor.orgTimezone)}
          hrefFor={(m) => url({ month: m })}
          items={filtered.map((e) => {
            const stage = stageDefs.find((s) => s.statuses.includes(e.status))!;
            return { id: e.id, start: e.startDate, end: e.endDate, label: e.name, sub: `${e.clientName} · ${eventStatusLabels[e.status]}`, href: `/events/${e.id}`, color: stageColors[stage.color] };
          })}
        />
      ) : (
        <EventList all={filtered} view={sp.view} rowById={rowById} orgCcy={orgCcy} eventTerm={term(cfg, "event")} clientTerm={term(cfg, "client")} url={url} />
      )}
    </div>
  );
}

function EventList({
  all,
  view: viewKey,
  rowById,
  orgCcy,
  eventTerm,
  clientTerm,
  url,
}: {
  all: Awaited<ReturnType<typeof listEvents>>;
  view?: string;
  rowById: Map<string, Awaited<ReturnType<typeof getPortfolio>>["rows"][number]>;
  orgCcy: string;
  eventTerm: string;
  clientTerm: string;
  url: (over: Partial<SP>) => string;
}) {
  const view = listViews.find((v) => v.key === viewKey) ?? listViews[0];
  const rows = all.filter((e) => !view.statuses || (view.statuses as readonly string[]).includes(e.status));
  return (
    <Panel>
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b border-rule px-4 py-2">
        {listViews.map((v) => {
          const n = all.filter((e) => !v.statuses || (v.statuses as readonly string[]).includes(e.status)).length;
          const active = v.key === view.key;
          return (
            <Link
              key={v.key}
              href={url({ view: v.key })}
              aria-current={active ? "page" : undefined}
              className={cx("rounded-control px-2.5 py-1 text-table", active ? "bg-sunken font-semibold text-ink" : "text-muted hover:bg-sunken hover:text-ink")}
            >
              {v.label} <span className="num text-muted">{n}</span>
            </Link>
          );
        })}
      </nav>
      {rows.length === 0 ? (
        <EmptyState title="Nothing matches this view" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{eventTerm}</Th>
              <Th className="hidden md:table-cell">{clientTerm}</Th>
              <Th className="hidden md:table-cell">Dates</Th>
              <Th className="hidden md:table-cell">Status</Th>
              <Th className="hidden md:table-cell">Owner</Th>
              <Th align="right">If nothing changes</Th>
              <Th align="right" className="hidden md:table-cell">Contracts active</Th>
              <Th align="right" className="hidden md:table-cell">Attendance</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const exp = rowById.get(e.id)?.exposure;
              return (
                <Tr key={e.id}>
                  <Td className="max-w-64 font-medium md:max-w-80">
                    <span className="flex items-center gap-3">
                      <CoverThumb photo={findCover(e.coverImage)} />
                      <span className="min-w-0">
                        <Link href={`/events/${e.id}`} className="block truncate font-semibold hover:underline">
                          {e.name}
                        </Link>
                        <span className="block truncate text-meta font-normal text-muted md:hidden">
                          {e.clientName} · {formatDateRange(e.startDate, e.endDate)} · {eventStatusLabels[e.status]}
                        </span>
                        <span className="hidden truncate text-meta font-normal text-muted md:block">
                          {e.type}
                          {e.destination ? ` · ${e.destination}` : ""}
                        </span>
                      </span>
                    </span>
                  </Td>
                  <Td className="hidden md:table-cell">{e.clientName}</Td>
                  <Td className="hidden whitespace-nowrap md:table-cell">{formatDateRange(e.startDate, e.endDate)}</Td>
                  <Td className="hidden md:table-cell">
                    <Status tone={eventStatusTone[e.status]}>{eventStatusLabels[e.status]}</Status>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <Person name={e.ownerName} />
                  </Td>
                  <Td align="right">
                    {exp ? (
                      <>
                        <Money minor={exp.current.totalMinor} currency={e.baseCurrency} contextCurrency={orgCcy} className={cx(exp.overThreshold && "font-semibold text-risk")} />
                        {exp.overThreshold ? <span className="block text-meta text-risk">Above your limit</span> : null}
                        {!exp.complete ? <span className="block text-meta text-watch">Figures missing</span> : null}
                      </>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </Td>
                  <Td align="right" className="hidden md:table-cell">
                    {e.activeContractCount}/{e.contractCount}
                  </Td>
                  <Td align="right" className="hidden md:table-cell">
                    {e.forecastAttendance.toLocaleString("en-US")}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}
