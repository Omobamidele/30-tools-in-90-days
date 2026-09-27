"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlarmClock, BadgeDollarSign, BedDouble, ClipboardCheck, Layers, ScrollText } from "@/ui/icons";
import { formatMoney } from "@/core/money";
import { Board, CardShell, ColumnShell, EmptyColumn, StageHeader } from "@/ui/kanban";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";
import { markDoneAction } from "./actions";
import { PaymentDialog, WaiveDialog, type DeadlineItem } from "./deadline-list";
import { deadlineStages, stageFor } from "./board-groups";

const kindIcon: Record<string, typeof AlarmClock> = {
  PAYMENT: BadgeDollarSign,
  CUTOFF: BedDouble,
  REVIEW: ClipboardCheck,
  GUARANTEE: ScrollText,
  TIER_CHANGE: Layers,
  OTHER: AlarmClock,
};

/** Open deadlines as columns by urgency. Actions reuse the list's dialogs and server actions. */
export function DeadlineBoard({ items, totals }: { items: DeadlineItem[]; totals: Record<string, string> }) {
  const router = useRouter();
  const done = useAction(markDoneAction);
  const [paying, setPaying] = useState<DeadlineItem | null>(null);
  const [waiving, setWaiving] = useState<DeadlineItem | null>(null);
  const open = items.filter((i) => i.status === "OPEN");

  return (
    <>
      {done.error ? (
        <div className="mb-3">
          <FormError message={done.error} />
        </div>
      ) : null}
      <Board label="Deadlines">
        {deadlineStages.map((s) => {
          const cards = open.filter((i) => stageFor(i) === s.key);
          return (
            <ColumnShell key={s.key} className="w-[300px]">
              <StageHeader title={s.title} count={cards.length} color={s.color} total={totals[s.key]} totalLabel="Payments outstanding in this column" />
              {cards.length === 0 ? (
                <EmptyColumn>Nothing here</EmptyColumn>
              ) : (
                cards.map((i) => {
                  const Icon = kindIcon[i.kind] ?? AlarmClock;
                  const outstanding = i.amountMinor !== null ? Math.max(0, i.amountMinor - i.paidMinor) : null;
                  return (
                    <CardShell key={i.id}>
                      <p className="flex items-center gap-1.5 text-meta text-faint">
                        <Icon size={13} aria-hidden />
                        {i.kindLabel}
                      </p>
                      <p className="mt-1 text-body leading-5 font-medium">{i.label}</p>
                      <p className="mt-0.5 truncate text-meta text-faint">
                        <Link href={`/contracts/${i.contractId}`} className="hover:text-ink hover:underline">
                          {i.supplierName}
                        </Link>
                        {" · "}
                        <Link href={`/events/${i.eventId}`} className="hover:text-ink hover:underline">
                          {i.eventName}
                        </Link>
                      </p>
                      <div className="mt-3 flex items-baseline justify-between gap-2 text-meta">
                        <span className="min-w-0">
                          <span className={cx("font-medium", i.overdue || i.days <= 7 ? "text-risk" : "text-muted")}>{i.relative}</span>
                          <span className="num text-faint" title={`Your time: ${i.dueOrgText}`}>
                            {" · "}
                            {i.dueText}
                          </span>
                        </span>
                        {outstanding !== null && i.currency ? <span className="num shrink-0 text-table font-medium">{formatMoney(outstanding, i.currency)}</span> : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1 border-t border-rule pt-2.5">
                        {i.kind === "PAYMENT" && i.canPay ? (
                          <Button size="sm" onClick={() => setPaying(i)}>
                            Record payment
                          </Button>
                        ) : null}
                        {i.canEdit && i.kind !== "TIER_CHANGE" ? (
                          <>
                            <Button size="sm" disabled={done.pending} onClick={async () => (await done.run(i.id)).ok && router.refresh()}>
                              Mark done
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setWaiving(i)}>
                              Waive
                            </Button>
                          </>
                        ) : null}
                        {i.kind === "TIER_CHANGE" ? <span className="text-meta text-muted">Takes effect automatically</span> : null}
                      </div>
                    </CardShell>
                  );
                })
              )}
            </ColumnShell>
          );
        })}
      </Board>
      {paying ? <PaymentDialog item={paying} onClose={() => setPaying(null)} /> : null}
      {waiving ? <WaiveDialog item={waiving} onClose={() => setWaiving(null)} /> : null}
    </>
  );
}
