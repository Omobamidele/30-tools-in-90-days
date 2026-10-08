import { AlertTriangle } from "@/ui/icons";
import { formatMoney } from "@/core/money";
import type { ChangeImpact } from "@/services/changes";
import { cx } from "@/ui/cx";

const signed = (m: number, ccy: string) => `${m > 0 ? "+" : m < 0 ? "−" : ""}${formatMoney(Math.abs(m), ccy)}`;

// What the change does to price, margin and commitments (docs/04 §5.8).
export function ImpactPanel({ impact, currency, title = "Impact" }: { impact: ChangeImpact; currency: string; title?: string }) {
  const t = impact.totals;
  const e = impact.exposure;
  const exposureDelta = e.currentAfter - e.currentBefore;
  return (
    <section aria-label={title} className="flex flex-col gap-3 text-table">
      <h3 className="text-section font-semibold">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-muted">Client price</dt>
        <dd className="num text-right font-medium">{signed(t.priceDeltaMinor, currency)}</dd>
        <dt className="text-muted">Cost</dt>
        <dd className="num text-right">{signed(t.costDeltaMinor, currency)}</dd>
        <dt className="text-muted">Margin on this change</dt>
        <dd className="num text-right">{t.marginPct === null ? "–" : `${t.marginPct}%`}</dd>
        {impact.attendance.after !== impact.attendance.before ? (
          <>
            <dt className="text-muted">Forecast attendance</dt>
            <dd className="num text-right">
              {impact.attendance.before} → {impact.attendance.after}
            </dd>
          </>
        ) : null}
      </dl>

      <div>
        <p className="mb-1 font-medium">Exposure on existing contracts</p>
        <p className="num">
          {formatMoney(e.currentBefore, e.currency)} → {formatMoney(e.currentAfter, e.currency)}{" "}
          <span className={cx(exposureDelta > 0 ? "text-risk" : exposureDelta < 0 ? "text-settled" : "text-muted")}>({signed(exposureDelta, e.currency)})</span>
        </p>
        {exposureDelta !== 0 ? (
          <p className="text-meta text-muted">
            Agency {signed(e.agencyDelta, e.currency)} · client {signed(e.clientDelta, e.currency)}
            {e.unassignedDelta ? ` · unassigned ${signed(e.unassignedDelta, e.currency)}` : ""}
          </p>
        ) : null}
        {e.lines.filter((l) => l.deltaMinor).length ? (
          <table className="mt-1.5 w-full text-meta">
            <tbody>
              {e.lines
                .filter((l) => l.deltaMinor)
                .map((l) => (
                  <tr key={`${l.clauseId}:${l.kind}`} className="border-t border-rule">
                    <td className="py-1">
                      {l.contractTitle}: {l.clauseLabel}
                    </td>
                    <td className="num py-1 text-right">
                      {formatMoney(l.beforeMinor ?? 0, l.currency, { withCode: false })} → {formatMoney(l.afterMinor ?? 0, l.currency, { withCode: false })}
                    </td>
                    <td className={cx("num py-1 pl-2 text-right", (l.deltaMinor ?? 0) > 0 ? "text-risk" : "text-settled")}>{signed(l.deltaMinor ?? 0, l.currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : null}
        {!e.complete ? <p className="mt-1 text-meta text-watch">Some exposure figures are incomplete, so this may understate the effect.</p> : null}
      </div>

      {impact.warnings.length ? (
        <ul className="flex flex-col gap-1 rounded-control border border-watch/40 bg-watch-bg px-3 py-2 text-watch">
          {impact.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      <p className={cx("rounded-control px-3 py-2", impact.approvalReason ? "bg-sunken" : "bg-settled-bg text-settled")}>
        {impact.approvalReason ? `Needs internal approval: ${impact.approvalReason}.` : "Goes straight to the client for approval."}
      </p>
    </section>
  );
}
