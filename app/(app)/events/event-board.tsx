"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { GripVertical, Plus } from "@/ui/icons";
import type { EventStatus } from "@/services/events";
import { Board, CardShell, ColumnShell, EmptyColumn, StageHeader, type StageColor } from "@/ui/kanban";
import { Avatar } from "@/ui/avatar";
import { Dialog } from "@/ui/dialog";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Photo } from "@/ui/photo";
import { findCover } from "@/config/imagery";
import { setEventStatusAction } from "./actions";

export type EventCardView = {
  id: string;
  name: string;
  clientName: string;
  dates: string;
  destination: string | null;
  /** Cover photo key from the catalogue (src/config/imagery.ts). */
  cover: string | null;
  status: EventStatus;
  ownerName: string;
  amountText: string | null;
  amountLabel: string | null;
  over: boolean;
  incomplete: boolean;
  bearer: { agency: number; client: number; unassigned: number } | null;
  next: { label: string; relText: string; tone: "risk" | "watch" | "muted" } | null;
  allowed: EventStatus[];
  /** Whether this user may change the status (owner/member or a role with edit rights). */
  canMove: boolean;
};

export type StageView = {
  key: string;
  title: string;
  color: StageColor;
  statuses: EventStatus[];
  /** Status an event takes when dropped here; null = not a drop target. */
  dropStatus: EventStatus | null;
  totalText: string;
  totalLabel: string;
};

/** Keyboard dragging jumps a whole column per ←/→ press instead of nudging by pixels. */
const columnJump: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect } }) => {
  const dir = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (!dir || !collisionRect) return undefined;
  event.preventDefault();
  const columns = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.left - b.left);
  const center = collisionRect.left + collisionRect.width / 2;
  const target = dir > 0 ? columns.find((r) => r.left > center) : [...columns].reverse().find((r) => r.left + r.width < center);
  if (!target) return undefined;
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 64 };
};

const confirmCopy: Partial<Record<EventStatus, { title: string; body: string; action: string; danger?: boolean }>> = {
  DELIVERED: {
    title: "Mark as delivered?",
    body: "Remaining cutoffs, guarantees and step-ups are closed as no longer applicable. Payments stay open until they're paid. You can then record actual penalties on the Post-event tab.",
    action: "Mark delivered",
  },
  CANCELLED: {
    title: "Mark as cancelled?",
    body: "Contracts and deadlines stay in place so cancellation charges can be tracked and reconciled.",
    action: "Mark cancelled",
    danger: true,
  },
};

export function EventBoard({ cards, stages, canCreate, statusLabels }: { cards: EventCardView[]; stages: StageView[]; canCreate: boolean; statusLabels: Record<EventStatus, string> }) {
  const router = useRouter();
  const [moved, setMoved] = useState<Record<string, EventStatus>>({});
  const [dragging, setDragging] = useState<EventCardView | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ card: EventCardView; target: EventStatus } | null>(null);
  const [pending, setPending] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: columnJump }));

  const view = useMemo(() => cards.map((c) => (moved[c.id] ? { ...c, status: moved[c.id] } : c)), [cards, moved]);

  async function apply(card: EventCardView, target: EventStatus) {
    setPending(true);
    setMoved((m) => ({ ...m, [card.id]: target }));
    const res = await setEventStatusAction(card.id, target);
    setPending(false);
    setConfirm(null);
    if (!res.ok) {
      setMoved((m) => {
        const next = { ...m };
        delete next[card.id];
        return next;
      });
      setMessage({ tone: "error", text: res.error.message });
      return;
    }
    setMessage({ tone: "ok", text: `${card.name} moved to ${statusLabels[target]}.` });
    router.refresh();
  }

  function onDragStart(e: DragStartEvent) {
    setMessage(null);
    setDragging(view.find((c) => c.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const card = view.find((c) => c.id === e.active.id);
    const stage = stages.find((s) => s.key === e.over?.id);
    if (!card || !stage || stage.statuses.includes(card.status)) return;
    const target = stage.dropStatus;
    if (!target || !card.allowed.includes(target)) {
      setMessage({ tone: "error", text: `${card.name} can't move from ${statusLabels[card.status]} to ${stage.title}.` });
      return;
    }
    if (confirmCopy[target]) setConfirm({ card, target });
    else void apply(card, target);
  }

  const copy = confirm ? confirmCopy[confirm.target]! : null;

  return (
    <>
      <p role="status" aria-live="polite" className={message ? "mb-3" : "sr-only"}>
        {message ? (
          <span className={cx("inline-block rounded-control px-2.5 py-1 text-table", message.tone === "error" ? "bg-risk-bg text-risk" : "bg-settled-bg text-settled")}>
            {message.text}
          </span>
        ) : null}
      </p>
      <DndContext
        id="event-pipeline"
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable: "To move an event to another stage, press space or enter, use the left and right arrow keys to choose a stage, then press space or enter to drop. Press escape to cancel.",
          },
        }}
      >
        <Board label="Event pipeline">
          {stages.map((stage) => {
            const inStage = view.filter((c) => stage.statuses.includes(c.status));
            const canDrop = !!dragging && !!stage.dropStatus && dragging.allowed.includes(stage.dropStatus) && !stage.statuses.includes(dragging.status);
            return (
              <Column key={stage.key} stage={stage} count={inStage.length} canDrop={canDrop} dimmed={!!dragging && !canDrop && !stage.statuses.includes(dragging.status)}>
                {stage.key === "PLANNING" && canCreate ? (
                  <Link
                    href="/events/new"
                    className="flex h-8 items-center justify-center gap-1.5 rounded-control text-table text-on-canvas-muted hover:bg-surface hover:text-ink"
                  >
                    <Plus size={14} aria-hidden /> New event
                  </Link>
                ) : null}
                {inStage.length === 0 ? <EmptyColumn>No events</EmptyColumn> : inStage.map((c) => <DraggableCard key={c.id} card={c} disabled={!c.canMove || pending} ghost={dragging?.id === c.id} />)}
              </Column>
            );
          })}
        </Board>
        <DragOverlay dropAnimation={null}>{dragging ? <Card card={dragging} lifted /> : null}</DragOverlay>
      </DndContext>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={copy?.title ?? ""} description={confirm?.card.name}>
        <div className="flex flex-col gap-4">
          <p className="text-body">{copy?.body}</p>
          <div className="flex gap-2">
            <Button variant={copy?.danger ? "danger" : "primary"} disabled={pending} onClick={() => confirm && apply(confirm.card, confirm.target)}>
              {copy?.action}
            </Button>
            <Button onClick={() => setConfirm(null)}>Keep as is</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function Column({ stage, count, canDrop, dimmed, children }: { stage: StageView; count: number; canDrop: boolean; dimmed: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !stage.dropStatus });
  return (
    <div ref={setNodeRef}>
      <ColumnShell highlight={canDrop && isOver} dimmed={dimmed} className={canDrop && !isOver ? "outline-1 outline-dashed outline-brand/30" : undefined}>
        <StageHeader title={stage.title} count={count} color={stage.color} total={stage.totalText} totalLabel={stage.totalLabel} />
        {children}
      </ColumnShell>
    </div>
  );
}

// The whole card drags with a pointer; keyboard dragging uses the grip button, so the card
// itself isn't a control wrapping the event link (no nested interactive elements).
function DraggableCard({ card, disabled, ghost }: { card: EventCardView; disabled: boolean; ghost: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: card.id, disabled });
  return (
    <div ref={setNodeRef} onPointerDown={listeners?.onPointerDown as React.PointerEventHandler<HTMLDivElement> | undefined} className={cx("rounded-panel", ghost && "opacity-40", !disabled && "cursor-grab active:cursor-grabbing")}>
      <Card
        card={card}
        handle={
          disabled ? null : (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-roledescription="Draggable event"
              aria-label={`Move ${card.name}`}
              className="-m-1 shrink-0 rounded-[5px] p-1 text-faint opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100"
            >
              <GripVertical size={14} aria-hidden />
            </button>
          )
        }
      />
    </div>
  );
}

function Card({ card, lifted, handle }: { card: EventCardView; lifted?: boolean; handle?: React.ReactNode }) {
  const b = card.bearer;
  const total = b ? b.agency + b.client + b.unassigned : 0;
  const cover = findCover(card.cover);
  return (
    <CardShell flush className={cx("group photo-card", lifted && "rotate-1 shadow-pop")}>
      {/* Cover strip: where the event happens, at a glance (docs/09 § Layout signatures). */}
      <div className="relative h-[72px] bg-midnight">
        <Photo photo={cover} sizes="280px" />
        <div aria-hidden className="absolute inset-0" style={{ background: "var(--scrim-card)" }} />
        {card.destination ? (
          <p className="absolute right-3 bottom-1.5 left-3 truncate text-meta font-medium text-white [text-shadow:0_1px_2px_rgb(14_23_38/0.6)]">{card.destination}</p>
        ) : null}
      </div>
      <div className="p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/events/${card.id}`} draggable={false} onPointerDown={(e) => e.stopPropagation()} className="font-display text-section leading-5 font-medium text-ink hover:underline">
          {card.name}
        </Link>
        {lifted ? <GripVertical size={14} className="shrink-0 text-faint" aria-hidden /> : handle}
      </div>
      <p className="mt-1 truncate text-meta text-faint">
        {card.clientName} · {card.dates}
      </p>

      {card.amountText ? (
        <div className="mt-3">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-meta text-faint">{card.amountLabel}</span>
            <span className={cx("num text-body font-medium", card.over ? "text-risk" : "text-ink")}>{card.amountText}</span>
          </p>
          {b && total > 0 ? (
            <span aria-hidden className="mt-1.5 flex h-1 gap-px overflow-hidden rounded-full bg-sunken">
              <span style={{ width: `${(b.agency / total) * 100}%` }} className="bg-agency" />
              <span style={{ width: `${(b.client / total) * 100}%` }} className="bg-client" />
              <span style={{ width: `${(b.unassigned / total) * 100}%` }} className="hatch" />
            </span>
          ) : null}
          {card.over || card.incomplete ? (
            <p className="mt-1.5 flex gap-2 text-meta">
              {card.over ? <span className="text-risk">Above your limit</span> : null}
              {card.incomplete ? <span className="text-watch">Figures missing</span> : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-2.5 text-meta">
        {card.next ? (
          <>
            <span className="min-w-0 flex-1 truncate text-faint" title={card.next.label}>
              {card.next.label}
            </span>
            <span className={cx("shrink-0", card.next.tone === "risk" ? "font-medium text-risk" : "text-muted")}>{card.next.relText}</span>
          </>
        ) : (
          <span className="flex-1 text-faint">No open deadlines</span>
        )}
        <Avatar name={card.ownerName} size={22} />
      </div>
      </div>
    </CardShell>
  );
}
