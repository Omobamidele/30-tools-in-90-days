"use client";

import { useState } from "react";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { daysBetween } from "@/core/time";
import { formatDate } from "./format";
import { cx } from "./cx";

// The signature element (docs/04 §3): today → event end. Top track: dated obligations.
// Bottom track: the combined cancellation liability as a staircase. Colour follows urgency
// of the next step. A table view is always available and is the accessible source of truth.

export type TimelineStep = { date: string; totalMinor: number; contracts: Array<{ title: string; amountMinor: number }> };
export type TimelineMark = { id: string; kind: string; label: string; date: string; dueText: string; amountText: string | null };

const W = 1000;
const H = 196;
const X0 = 16;
const X1 = W - 16;
const MARK_Y = 30;
const AXIS_Y = 64;
const STAIR_TOP = 96;
const STAIR_BOTTOM = 176;

export function CommitmentTimeline({
  today,
  start,
  end,
  steps,
  marks,
  currency,
}: {
  today: string;
  start: string;
  end: string;
  steps: TimelineStep[];
  marks: TimelineMark[];
  currency: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const span = Math.max(1, daysBetween(today, end));
  const x = (date: string) => X0 + (Math.min(Math.max(daysBetween(today, date), 0), span) / span) * (X1 - X0);
  const max = Math.max(1, ...steps.map((s) => s.totalMinor));
  const y = (amount: number) => STAIR_BOTTOM - (amount / max) * (STAIR_BOTTOM - STAIR_TOP);
  const money = (m: number) => formatMoney(m, currency);
  // Summary labels on the drawing are rounded; the table view and tooltips keep exact figures.
  const short = (m: number) => formatMoneyShort(m, currency);

  const tone = (date: string) => {
    const d = daysBetween(today, date);
    return d <= 7 ? "var(--risk-high)" : d <= 21 ? "var(--risk-watch)" : "var(--ink-muted)";
  };

  const eventStartX = x(start);
  const next = steps.find((s) => s.date > today);

  return (
    <section aria-labelledby="timeline-title" className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-3.5">
        <div>
          <h2 id="timeline-title" className="text-section font-semibold">
            What cancelling would cost
            <span className="block text-meta font-normal text-faint">commitment timeline</span>
          </h2>
          <p className="mt-1.5 text-body text-muted">
            Cancelling today costs <span className="num font-semibold text-ink">{short(steps[0]?.totalMinor ?? 0)}</span>.{" "}
            {next ? (
              <>
                That rises to <span className="num font-semibold text-ink">{short(next.totalMinor)}</span> on{" "}
                <span className="whitespace-nowrap">{formatDate(next.date)}</span>{" "}
                <span className={cx("whitespace-nowrap", daysBetween(today, next.date) <= 7 && "font-medium text-risk")}>
                  (in {daysBetween(today, next.date)} day{daysBetween(today, next.date) === 1 ? "" : "s"})
                </span>
                .
              </>
            ) : (
              "It doesn't rise again before the event."
            )}
          </p>
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-table font-medium text-brand hover:underline" aria-pressed={asTable}>
          {asTable ? "View as timeline" : "View as table"}
        </button>
      </div>

      {asTable ? (
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <table className="w-full text-table">
            <caption className="mb-1 text-left font-medium">Cancellation liability</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">From</th>
                <th scope="col" className="py-1 text-right font-medium">If cancelled</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.date} className="border-t border-rule">
                  <td className="py-1">{s.date === today ? "Today" : formatDate(s.date)}</td>
                  <td className="num py-1 text-right">{money(s.totalMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="w-full text-table">
            <caption className="mb-1 text-left font-medium">Upcoming obligations</caption>
            <tbody>
              {marks.length === 0 ? (
                <tr>
                  <td className="py-1 text-muted">None open</td>
                </tr>
              ) : (
                marks.map((m) => (
                  <tr key={m.id} className="border-t border-rule">
                    <td className="py-1">{m.label}</td>
                    <td className="num py-1 text-right text-muted">{m.dueText}</td>
                    <td className="num py-1 pl-3 text-right">{m.amountText}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-2 pb-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Commitment timeline">
            {/* event dates */}
            <rect x={eventStartX} y={AXIS_Y - 7} width={Math.max(4, X1 - eventStartX)} height={14} rx={3} fill="var(--brand)" />
            <line x1={X0} x2={X1} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--rule-strong)" />
            <line x1={X0} x2={X0} y1={MARK_Y - 14} y2={STAIR_BOTTOM} stroke="var(--brand)" strokeWidth={2} />
            <text x={X0 + 4} y={MARK_Y - 10} fontSize={11} fill="var(--brand)">
              Today
            </text>
            <text x={Math.max(X0 + 60, eventStartX - 8)} y={AXIS_Y + 4} fontSize={11} paintOrder="stroke" stroke="var(--surface)" strokeWidth={4} textAnchor="end" fill="var(--ink)">
              Event {formatDate(start)}
            </text>

            {/* obligation marks */}
            {marks.map((m) => {
              const cx_ = x(m.date);
              const color = tone(m.date);
              return (
                <g key={m.id} tabIndex={0} role="img" aria-label={`${m.label}, ${m.dueText}${m.amountText ? `, ${m.amountText}` : ""}`} className="outline-none focus-visible:[&>*]:stroke-[var(--brand)]">
                  <title>{`${m.label}\n${m.dueText}${m.amountText ? `\n${m.amountText}` : ""}`}</title>
                  {m.kind === "PAYMENT" ? (
                    <rect x={cx_ - 5} y={MARK_Y - 5} width={10} height={10} transform={`rotate(45 ${cx_} ${MARK_Y})`} fill="var(--surface)" stroke={color} strokeWidth={2} />
                  ) : (
                    <circle cx={cx_} cy={MARK_Y} r={5} fill={color} />
                  )}
                  <line x1={cx_} x2={cx_} y1={MARK_Y + 6} y2={AXIS_Y - 2} stroke={color} strokeDasharray="2 3" />
                </g>
              );
            })}

            {/* cancellation staircase */}
            {steps.map((s, i) => {
              const xa = x(s.date);
              const xb = i + 1 < steps.length ? x(steps[i + 1].date) : X1;
              const current = i === 0;
              const color = current ? "var(--brand)" : "var(--bearer-unassigned)";
              return (
                <g key={s.date} tabIndex={0} role="img" aria-label={`${current ? "From today" : `From ${formatDate(s.date)}`}: ${money(s.totalMinor)} if cancelled`} className="outline-none">
                  <title>{`${current ? "Today" : formatDate(s.date)}: ${money(s.totalMinor)} if cancelled\n${s.contracts.map((c) => `${c.title}: ${money(c.amountMinor)}`).join("\n")}`}</title>
                  <rect
                    x={xa}
                    y={y(s.totalMinor)}
                    width={Math.max(1, xb - xa)}
                    height={STAIR_BOTTOM - y(s.totalMinor)}
                    fill={color}
                    fillOpacity={current ? 0.12 : 0.04}
                    stroke={color}
                    strokeWidth={current ? 0 : 1}
                    strokeDasharray={current ? undefined : "4 3"}
                  />
                  <line x1={xa} x2={xb} y1={y(s.totalMinor)} y2={y(s.totalMinor)} stroke={color} strokeWidth={2} />
                  <text
                    x={xa + 6}
                    y={y(s.totalMinor) - 7}
                    fontSize={12}
                    fontWeight={600}
                    fill={current ? "var(--ink)" : tone(s.date)}
                    paintOrder="stroke"
                    stroke="var(--surface)"
                    strokeWidth={4}
                    className="num"
                  >
                    {short(s.totalMinor)}
                  </text>
                </g>
              );
            })}
            <line x1={X0} x2={X1} y1={STAIR_BOTTOM} y2={STAIR_BOTTOM} stroke="var(--rule)" />
          </svg>
          <p className="px-3 pb-3 text-meta text-muted">
            <span aria-hidden>◆</span> payment · <span aria-hidden>●</span> deadline · solid gold: cancellation charge if cancelled now; dashed:
            future steps. Hover or focus any mark for details.
          </p>
        </div>
      )}
    </section>
  );
}
