import type { Metadata } from "next";
import Link from "next/link";
import { KanbanSquare, List, Users } from "@/ui/icons";
import { appCtx } from "@/services/app-ctx";
import { listChanges } from "@/services/changes";
import { loadFx } from "@/services/fx";
import { canApproveInternally } from "@/auth/policy";
import { term } from "@/config/terms";
import { changeStatusLabels, type ChangeStatus } from "@/core/changes/state";
import { convertMinor, formatMoney } from "@/core/money";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { BoardToolbar } from "@/ui/board-toolbar";
import { Board, CardShell, ColumnShell, EmptyColumn, StageHeader, type StageColor } from "@/ui/kanban";
import { Avatar } from "@/ui/avatar";
import { Status } from "@/ui/status";
import { cx } from "@/ui/cx";
import { ChangeTable } from "./change-table";

export const metadata: Metadata = { title: "Change requests" };

const OPEN = ["DRAFT", "INTERNAL_REVIEW", "SENT_TO_CLIENT", "APPROVED", "EXPIRED"];
const CLOSED = ["APPLIED", "REJECTED", "WITHDRAWN"];

const stages: Array<{ key: string; statuses: ChangeStatus[]; color: StageColor; title?: string }> = [
  { key: "DRAFT", statuses: ["DRAFT"], color: "grey" },
  { key: "INTERNAL_REVIEW", statuses: ["INTERNAL_REVIEW"], color: "violet" },
  { key: "SENT_TO_CLIENT", statuses: ["SENT_TO_CLIENT", "EXPIRED"], color: "blue", title: "With the client" },
  { key: "APPROVED", statuses: ["APPROVED"], color: "teal" },
  { key: "APPLIED", statuses: ["APPLIED"], color: "green" },
  { key: "CLOSED", statuses: ["REJECTED", "WITHDRAWN"], color: "red", title: "Declined / withdrawn" },
];

type SP = { view?: string; layout?: string; f?: string; q?: string };

export default async function ChangesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const layout = sp.layout === "list" || sp.view ? "list" : "board";
  const ctx = await appCtx();
  const cfg = ctx.actor.config;
  const [all, fx] = await Promise.all([listChanges(ctx), loadFx(ctx.db, ctx.actor.orgId)]);
  const approver = canApproveInternally({ ...ctx.actor, internalApproverRoles: cfg.rules.internalApproverRoles });
  const needsMe = (c: (typeof all)[number]) => approver && c.status === "INTERNAL_REVIEW" && c.createdBy !== ctx.actor.userId;
  const q = (sp.q ?? "").trim().toLowerCase();
  const f = sp.f ?? "all";
  const matches = (c: (typeof all)[number]) =>
    (!q || [c.title, c.eventName, `cr-${c.number}`, c.creatorName].some((s) => s.toLowerCase().includes(q))) &&
    (f === "approve" ? needsMe(c) : f === "mine" ? c.createdBy === ctx.actor.userId : true);
  const shown = all.filter(matches);
  const plural = term(cfg, "changeRequest", { plural: true });
  const orgCcy = ctx.actor.baseCurrency;

  const url = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged: SP = { layout: layout === "list" ? "list" : undefined, f, q: sp.q, ...over };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "f" && v === "all") && !(k === "layout" && v === "board")) p.set(k, v);
    const s = p.toString();
    return `/changes${s ? `?${s}` : ""}`;
  };

  // List layout keeps the original status views.
  const views = [
    ...(approver ? [{ key: "approve", label: "Awaiting my approval", rows: shown.filter(needsMe) }] : []),
    { key: "open", label: "Open", rows: shown.filter((c) => OPEN.includes(c.status)) },
    { key: "closed", label: "Closed", rows: shown.filter((c) => CLOSED.includes(c.status)) },
  ];
  const current = views.find((v) => v.key === sp.view) ?? views.find((v) => v.key === "open")!;

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title={plural} meta={`Raise a change from its ${term(cfg, "event", { lower: true })}, so its impact is calculated against the right contracts. Totals in ${orgCcy}.`} />
      <BoardToolbar
        layouts={[
          { key: "board", label: "Board", href: url({ layout: "board", view: undefined }), icon: KanbanSquare, active: layout === "board" },
          { key: "list", label: "List", href: url({ layout: "list" }), icon: List, active: layout === "list" },
        ]}
        chips={[
          { label: "All", href: url({ f: "all" }), active: f === "all", count: all.length },
          ...(approver ? [{ label: "Awaiting my approval", href: url({ f: "approve" }), active: f === "approve", count: all.filter(needsMe).length, tone: "risk" as const }] : []),
          { label: "Raised by me", href: url({ f: "mine" }), active: f === "mine", count: all.filter((c) => c.createdBy === ctx.actor.userId).length },
        ]}
        search={{ value: sp.q ?? "", placeholder: "Search changes, events, CR numbers", hidden: { ...(layout === "list" ? { layout } : {}), ...(f !== "all" ? { f } : {}) } }}
        clearHref={url({ q: undefined })}
      />

      {layout === "board" ? (
        <>
          <p className="mb-3 text-meta text-faint">Changes move through approval, not by dragging. Open a card to submit, approve or apply it.</p>
          <Board label="Change requests">
            {stages.map((s) => {
              const cards = shown.filter((c) => s.statuses.includes(c.status as ChangeStatus));
              let total = 0;
              for (const c of cards) {
                const rate = fx.rate(c.currency, orgCcy);
                if (rate !== null) total += convertMinor(c.priceDeltaMinor, rate);
              }
              return (
                <ColumnShell key={s.key}>
                  <StageHeader title={s.title ?? changeStatusLabels[s.statuses[0]]} count={cards.length} color={s.color} total={formatMoney(total, orgCcy)} totalLabel="Client price impact" />
                  {cards.length === 0 ? (
                    <EmptyColumn>None</EmptyColumn>
                  ) : (
                    cards.map((c) => (
                      <CardShell key={c.id}>
                        <p className="flex items-center justify-between gap-2 text-meta text-faint">
                          <span className="num">CR-{c.number}</span>
                          {needsMe(c) ? <Status plain tone="risk">Needs your approval</Status> : null}
                          {c.status === "EXPIRED" ? <Status plain tone="watch">Link expired</Status> : null}
                        </p>
                        <Link href={`/changes/${c.id}`} className="mt-1 block text-body leading-5 font-medium hover:underline">
                          {c.title}
                        </Link>
                        <p className="mt-0.5 truncate text-meta text-faint">{c.eventName}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-meta">
                          <div>
                            <dt className="text-faint">Client price</dt>
                            <dd className={cx("num text-table font-medium", c.priceDeltaMinor < 0 ? "text-settled" : "text-ink")}>{formatMoney(c.priceDeltaMinor, c.currency)}</dd>
                          </div>
                          <div>
                            <dt className="text-faint">Our cost</dt>
                            <dd className="num text-table font-medium">{formatMoney(c.costDeltaMinor, c.currency)}</dd>
                          </div>
                        </dl>
                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-2.5 text-meta text-faint">
                          <span className="inline-flex items-center gap-1">
                            {c.attendanceDelta ? (
                              <>
                                <Users size={13} aria-hidden />
                                <span className="num">{c.attendanceDelta > 0 ? `+${c.attendanceDelta}` : c.attendanceDelta} attendees</span>
                              </>
                            ) : (
                              <span>{new Date(c.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            )}
                          </span>
                          <Avatar name={c.creatorName} size={22} />
                        </div>
                      </CardShell>
                    ))
                  )}
                </ColumnShell>
              );
            })}
          </Board>
        </>
      ) : (
        <Panel>
          <nav aria-label="Views" className="flex gap-1 border-b border-rule px-4 py-2">
            {views.map((v) => (
              <Link
                key={v.key}
                href={url({ layout: "list", view: v.key })}
                aria-current={v.key === current.key ? "page" : undefined}
                className={cx("rounded-control px-2.5 py-1 text-table", v.key === current.key ? "bg-sunken font-semibold" : "text-muted hover:bg-sunken hover:text-ink")}
              >
                {v.label} <span className="num text-muted">{v.rows.length}</span>
              </Link>
            ))}
          </nav>
          {current.rows.length ? (
            <ChangeTable rows={current.rows} showEvent />
          ) : (
            <EmptyState title={current.key === "approve" ? "Nothing waiting for your approval" : `No ${current.label.toLowerCase()} ${plural.toLowerCase()}`} />
          )}
        </Panel>
      )}
    </div>
  );
}
