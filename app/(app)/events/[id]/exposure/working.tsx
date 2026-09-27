"use client";

import { useState } from "react";
import { formatMoney } from "@/core/money";
import { Dialog } from "@/ui/dialog";
import { Status } from "@/ui/status";
import { formatDate } from "@/ui/format";
import { BearerBar } from "@/ui/bearer-bar";
import { cx } from "@/ui/cx";

// Every figure opens its working: formula, inputs and the rule that allocated it.

type Allocation = { agencyMinor: number; clientMinor: number; unassignedMinor: number; rule: { bearer: string; agencyPct: number } | null };
export type LineView = {
  key: string;
  contractId: string;
  contractTitle: string;
  supplierName: string;
  clauseLabel: string;
  kind: "ATTRITION" | "FB_SHORTFALL" | "CANCELLATION";
  currency: string;
  complete: boolean;
  amountMinor: number | null;
  missing: string[];
  working: Record<string, unknown> | null;
  allocation: Allocation | null;
  baseAmountMinor: number | null;
  rate: string | null;
  scenarioAmountMinor?: number | null;
};

const kindLabels = { ATTRITION: "Room block attrition", FB_SHORTFALL: "F&B shortfall", CANCELLATION: "Cancellation if cancelled" };

function bearerText(a: Allocation | null) {
  if (!a) return "–";
  if (!a.rule) return "Unassigned";
  if (a.rule.bearer === "SPLIT") return `Split ${a.rule.agencyPct}/${100 - a.rule.agencyPct}`;
  return a.rule.bearer === "AGENCY" ? "Agency" : "Client";
}

export function ExposureLines({
  lines,
  baseCurrency,
  agreementName,
  scenario,
}: {
  lines: LineView[];
  baseCurrency: string;
  agreementName: string | null;
  scenario: boolean;
}) {
  const [open, setOpen] = useState<LineView | null>(null);
  const groups: Array<{ title: string; kinds: LineView["kind"][] }> = [
    { title: "Current exposure: expected charges if nothing changes", kinds: ["ATTRITION", "FB_SHORTFALL"] },
    { title: "Cancellation exposure: if the event were cancelled", kinds: ["CANCELLATION"] },
  ];

  return (
    <>
      {groups.map((g) => {
        const rows = lines.filter((l) => g.kinds.includes(l.kind));
        if (!rows.length) return null;
        return (
          <div key={g.title} className="overflow-x-auto">
            <table className="w-full text-table">
              <caption className="border-b border-rule bg-sunken px-4 py-1.5 text-left font-medium text-muted">{g.title}</caption>
              <thead>
                <tr className="text-muted">
                  <th scope="col" className="hidden h-8 px-4 text-left font-medium sm:table-cell">Contract</th>
                  <th scope="col" className="h-8 pr-3 pl-4 text-left font-medium sm:pl-3">Term</th>
                  <th scope="col" className="px-3 text-left font-medium whitespace-nowrap">Carried by</th>
                  <th scope="col" className="px-3 text-right font-medium">Amount</th>
                  {scenario ? <th scope="col" className="px-4 text-right font-medium">Scenario</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.key} className="border-t border-rule">
                    <td className="hidden h-9 px-4 sm:table-cell">
                      <span className="font-medium">{l.supplierName}</span>
                      <span className="block text-meta text-muted">{l.contractTitle}</span>
                    </td>
                    <td className="h-9 pr-3 pl-4 sm:pl-3">
                      {l.clauseLabel}
                      <span className="block text-meta text-muted">{kindLabels[l.kind]}</span>
                      <span className="block text-meta text-muted sm:hidden">{l.supplierName}</span>
                    </td>
                    <td className={cx("px-3", l.allocation && !l.allocation.rule ? "text-watch" : undefined)}>{bearerText(l.allocation)}</td>
                    <td className="px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setOpen(l)}
                        className="num text-right font-medium text-brand underline decoration-rule-strong underline-offset-2 hover:decoration-brand"
                        aria-label={`Show working for ${l.supplierName} ${kindLabels[l.kind]}`}
                      >
                        {l.complete && l.amountMinor !== null ? formatMoney(l.amountMinor, l.currency) : "Incomplete"}
                      </button>
                      {l.complete && l.currency !== baseCurrency && l.baseAmountMinor !== null ? (
                        <span className="num block text-meta text-muted">≈ {formatMoney(l.baseAmountMinor, baseCurrency)}</span>
                      ) : null}
                    </td>
                    {scenario ? (
                      <td className="num px-4 text-right">
                        {l.scenarioAmountMinor !== undefined && l.scenarioAmountMinor !== null ? (
                          <>
                            {formatMoney(l.scenarioAmountMinor, l.currency)}
                            {l.amountMinor !== null ? (
                              <span className={cx("block text-meta", l.scenarioAmountMinor > l.amountMinor ? "text-risk" : l.scenarioAmountMinor < l.amountMinor ? "text-settled" : "text-muted")}>
                                {l.scenarioAmountMinor - l.amountMinor >= 0 ? "+" : "−"}
                                {formatMoney(Math.abs(l.scenarioAmountMinor - l.amountMinor), l.currency, { withCode: false })}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "–"
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {open ? (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)} title={`${kindLabels[open.kind]}: ${open.supplierName}`} description={`${open.contractTitle} · ${open.clauseLabel}`} wide>
          <Working line={open} baseCurrency={baseCurrency} agreementName={agreementName} />
        </Dialog>
      ) : null}
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-4 border-b border-rule/70 py-1 text-table", strong && "font-semibold")}>
      <span className="text-muted">{k}</span>
      <span className="num text-right">{v}</span>
    </div>
  );
}

function Working({ line, baseCurrency, agreementName }: { line: LineView; baseCurrency: string; agreementName: string | null }) {
  const m = (v: unknown) => (typeof v === "number" ? formatMoney(v, line.currency) : "–");
  if (!line.complete) {
    return (
      <div className="flex flex-col gap-2 text-body">
        <Status plain tone="watch">Can&apos;t calculate yet</Status>
        <p>This figure needs:</p>
        <ul className="list-disc pl-5 text-table">
          {line.missing.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="text-table text-muted">It is excluded from totals until then. It is never counted as zero.</p>
      </div>
    );
  }
  const w = line.working ?? {};
  return (
    <div className="flex flex-col gap-4">
      {line.kind === "ATTRITION" ? <AttritionWorking w={w} m={m} amount={line.amountMinor} /> : null}
      {line.kind === "FB_SHORTFALL" ? (
        <div>
          <Row k="Minimum spend" v={m(w.minimumMinor)} />
          <Row
            k={w.forecastMethod === "PER_HEAD" ? `Forecast: ${m(w.perHeadMinor)} × ${w.attendance} attendees` : "Forecast spend (entered)"}
            v={m(w.forecastMinor)}
          />
          <Row k="Shortfall" v={m(w.shortfallMinor)} />
          <Row k={`Surcharge ${w.surchargePct}%`} v={m(w.surchargeMinor)} />
          <Row k="Projected charge" v={m(line.amountMinor)} strong />
        </div>
      ) : null}
      {line.kind === "CANCELLATION" ? (
        <div>
          <Row k="As of" v={formatDate(String(w.asOf))} />
          <Row k="Basis" v={w.basisAmountMinor !== null ? m(w.basisAmountMinor) : "Fixed amounts"} />
          <Row
            k="Tier in force"
            v={w.tier ? `From ${formatDate(String((w.tier as { startsOn: string }).startsOn))}: ${(w.tier as { penaltyPct: number | null }).penaltyPct ?? "fixed"}${(w.tier as { penaltyPct: number | null }).penaltyPct !== null ? "%" : ""}` : "None yet (no penalty)"}
          />
          <Row k="Cancellation charge" v={m(w.grossMinor)} strong />
          <Row k="Deposits paid" v={m(w.depositsPaidMinor)} />
          <Row k={w.depositTreatment === "CREDITED" ? "Still owed (deposits credited)" : "Still owed (deposits forfeited in addition)"} v={m(w.netOwedMinor)} />
          {w.nextStep ? (
            <Row
              k={`Next step ${formatDate(String((w.nextStep as { startsOn: string }).startsOn))}`}
              v={m((w.nextStep as { amountMinor: number }).amountMinor)}
            />
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-table font-medium">Who carries it</p>
        {line.allocation ? (
          <>
            <BearerBar
              agencyMinor={line.allocation.agencyMinor}
              clientMinor={line.allocation.clientMinor}
              unassignedMinor={line.allocation.unassignedMinor}
              currency={line.currency}
            />
            <p className="mt-1.5 text-meta text-muted">
              {line.allocation.rule
                ? `Rule from ${agreementName ?? "the client agreement"}.`
                : agreementName
                  ? `${agreementName} doesn't cover this penalty, so it is unassigned.`
                  : "No client agreement is in force for this event, so it is unassigned."}
            </p>
          </>
        ) : null}
      </div>
      {line.currency !== baseCurrency && line.baseAmountMinor !== null ? (
        <p className="text-meta text-muted">
          Converted at 1 {line.currency} = {line.rate} {baseCurrency}: {formatMoney(line.baseAmountMinor, baseCurrency)}
        </p>
      ) : null}
    </div>
  );
}

function AttritionWorking({ w, m, amount }: { w: Record<string, unknown>; m: (v: unknown) => string; amount: number | null }) {
  const rows = (w.rows as Array<{ date: string; rooms: number; committed: number; projected: number; short: number; rateMinor: number; amountMinor: number }>) ?? [];
  const totals = w.totals as { rooms: number; committed: number; projected: number; short: number; averageRateMinor: number } | undefined;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-table text-muted">
        {w.basis === "CUMULATIVE" ? "Measured across all nights" : "Measured per night"} · commitment {String(w.commitmentPct)}% · damages{" "}
        {String(w.damagesPct)}% of rate · projection: {w.projection === "FORECAST" ? "forecast final pickup" : "current pickup"} as of{" "}
        {new Date(String(w.pickupCapturedAt)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        {w.attendanceFactorPct !== null && w.attendanceFactorPct !== undefined ? ` · scaled to ${w.attendanceFactorPct}% for the scenario` : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-table">
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 text-left font-medium">Night</th>
              <th scope="col" className="py-1 text-right font-medium">Block</th>
              <th scope="col" className="py-1 text-right font-medium">Committed</th>
              <th scope="col" className="py-1 text-right font-medium">Projected</th>
              {w.basis === "PER_NIGHT" ? (
                <>
                  <th scope="col" className="py-1 text-right font-medium">Short</th>
                  <th scope="col" className="py-1 text-right font-medium">Rate</th>
                  <th scope="col" className="py-1 text-right font-medium">Charge</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="num">
            {rows.map((r) => (
              <tr key={r.date} className="border-t border-rule">
                <td className="py-1">{formatDate(r.date)}</td>
                <td className="py-1 text-right">{r.rooms}</td>
                <td className="py-1 text-right">{r.committed}</td>
                <td className="py-1 text-right">{r.projected}</td>
                {w.basis === "PER_NIGHT" ? (
                  <>
                    <td className={cx("py-1 text-right", r.short > 0 && "text-risk")}>{r.short}</td>
                    <td className="py-1 text-right">{m(r.rateMinor)}</td>
                    <td className="py-1 text-right">{m(r.amountMinor)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totals ? (
        <div>
          <Row k={`Committed ${totals.committed} of ${totals.rooms} room nights`} v={`${totals.projected} projected`} />
          <Row k="Short" v={totals.short} />
          <Row k="Average contracted rate" v={m(totals.averageRateMinor)} />
        </div>
      ) : null}
      <Row k="Projected charge" v={m(amount)} strong />
    </div>
  );
}
