import type { Metadata } from "next";
import { can } from "@/auth/policy";
import { eventVariance, penaltyLabels, PENALTY_CATEGORIES } from "@/services/post-event";
import { formatMoney } from "@/core/money";
import { Panel, EmptyState } from "@/ui/page";
import { formatDateTime } from "@/ui/format";
import { loadEvent } from "../load";
import { PenaltyForm, RemovePenalty } from "./penalty-form";

export const metadata: Metadata = { title: "Post-event" };

export default async function PostEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  const v = await eventVariance(ctx, id);
  const open = ["DELIVERED", "RECONCILED", "CANCELLED"].includes(event.status);
  const canRecord = open && can(ctx.actor, "penalty.record", scope);
  const tz = ctx.actor.orgTimezone;
  const ccy = event.baseCurrency;

  const projected = [
    { label: "30 days before", s: v.projected.t30 },
    { label: "7 days before", s: v.projected.t7 },
    { label: "At event start", s: v.projected.start },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!open ? (
        <Panel>
          <EmptyState title="Available after the event">
            Mark the event delivered (or cancelled) to record the penalties suppliers actually charged and compare them with what was projected.
          </EmptyState>
        </Panel>
      ) : null}

      <Panel title="Projected vs actual" description={`What the register projected ahead of the event, against what was charged. Figures in ${ccy}; actual charges are in each contract's currency below.`}>
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          {projected.map((p) => (
            <div key={p.label}>
              <p className="text-table text-muted">Projected {p.label.toLowerCase()}</p>
              <p className="num text-section font-semibold">{p.s ? formatMoney(p.s.minor, p.s.currency) : "No snapshot"}</p>
              {p.s ? <p className="text-meta text-muted">Snapshot {formatDateTime(p.s.at, tz)}</p> : null}
            </div>
          ))}
        </div>
        {v.avoidedMinor ? (
          <p className="border-t border-rule px-4 py-2 text-table">
            Exposure removed by recorded decisions: <span className="num font-medium text-settled">{formatMoney(v.avoidedMinor, ccy)}</span>
          </p>
        ) : null}
      </Panel>

      <Panel title="Actual penalties by contract">
        {v.contracts.length === 0 ? (
          <p className="px-4 py-6 text-center text-table text-muted">No active contracts.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {v.contracts.map((k) => {
              const total = k.penalties.reduce((s, p) => s + p.amountMinor, 0);
              return (
                <li key={k.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-body font-medium">
                      {k.supplierName} <span className="font-normal text-muted">{k.title}</span>
                    </p>
                    <p className="num text-table">
                      Charged <span className="font-medium">{formatMoney(total, k.currency)}</span>
                    </p>
                  </div>
                  {k.penalties.length ? (
                    <table className="mt-1.5 w-full text-table">
                      <tbody>
                        {k.penalties.map((p) => (
                          <tr key={p.id} className="border-t border-rule">
                            <td className="py-1">{penaltyLabels[p.category]}</td>
                            <td className="py-1 text-muted">{p.invoiceRef ? `Invoice ${p.invoiceRef}` : ""}</td>
                            <td className="py-1 text-meta text-muted">
                              {p.byName} · {formatDateTime(p.createdAt, tz)}
                            </td>
                            <td className="num py-1 text-right">{formatMoney(p.amountMinor, k.currency)}</td>
                            <td className="w-10 py-1 text-right">{canRecord ? <RemovePenalty id={p.id} eventId={id} /> : null}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-meta text-muted">{open ? "No penalties recorded. Record zero if the supplier confirmed none." : ""}</p>
                  )}
                  {canRecord ? (
                    <PenaltyForm
                      contractId={k.id}
                      eventId={id}
                      currency={k.currency}
                      categories={PENALTY_CATEGORIES.map((c) => ({ value: c, label: penaltyLabels[c] }))}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
