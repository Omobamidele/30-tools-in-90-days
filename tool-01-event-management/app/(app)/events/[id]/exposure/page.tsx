import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/auth/policy";
import { getEventExposure } from "@/services/exposure";
import { fbMinimumInputs, fbMinimumTerms, roomBlockInputs, roomBlockTerms } from "@/core/clauses/schemas";
import { formatMoney } from "@/core/money";
import { Panel } from "@/ui/page";
import { Status } from "@/ui/status";
import { BearerBar } from "@/ui/bearer-bar";
import { formatDate } from "@/ui/format";
import { loadEvent } from "../load";
import { ExposureLines, type LineView } from "./working";
import { InputsPanel, type BlockInput, type FbInput } from "./inputs-panel";
import { getInboundForBlocks } from "@/services/inbound-pickup";

export const metadata: Metadata = { title: "Exposure" };

export default async function ExposurePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attendance?: string; cancelOn?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx, event, scope } = await loadEvent(id);

  const attendancePct = sp.attendance !== undefined && sp.attendance !== "" ? Math.max(-100, Math.min(50, Number(sp.attendance))) : undefined;
  const cancelOn = sp.cancelOn && /^\d{4}-\d{2}-\d{2}$/.test(sp.cancelOn) ? sp.cancelOn : undefined;
  const scenarioActive = (attendancePct !== undefined && !Number.isNaN(attendancePct) && attendancePct !== 0) || Boolean(cancelOn);
  const { current, scenario, context } = await getEventExposure(
    ctx,
    id,
    scenarioActive ? { attendanceDeltaPct: attendancePct || undefined, cancelOn } : undefined,
  );
  const ccy = event.baseCurrency;
  const money = (m: number) => formatMoney(m, ccy);

  const scenarioByKey = new Map((scenario?.lines ?? []).map((l) => [`${l.clauseId}:${l.kind}`, l]));
  const lines: LineView[] = current.lines.map((l) => {
    const s = scenarioByKey.get(`${l.clauseId}:${l.kind}`);
    return {
      key: `${l.clauseId}:${l.kind}`,
      contractId: l.contractId,
      contractTitle: l.contractTitle,
      supplierName: l.supplierName,
      clauseLabel: l.clauseLabel,
      kind: l.kind,
      currency: l.currency,
      complete: l.calc.status === "COMPLETE",
      amountMinor: l.calc.status === "COMPLETE" ? l.calc.amountMinor : null,
      missing: l.calc.status === "INCOMPLETE" ? l.calc.missing.map((m) => m.label) : [],
      working: l.calc.status === "COMPLETE" ? (l.calc.working as unknown as Record<string, unknown>) : null,
      allocation: l.allocation,
      baseAmountMinor: l.base?.amountMinor ?? null,
      rate: l.base?.rate ?? null,
      scenarioAmountMinor: scenario ? (s && s.calc.status === "COMPLETE" ? s.calc.amountMinor : null) : undefined,
    };
  });

  const blocks: BlockInput[] = [];
  const fbs: FbInput[] = [];
  for (const k of context.input.contracts) {
    for (const c of k.clauses) {
      if (c.type === "ROOM_BLOCK") {
        const t = roomBlockTerms.parse(c.terms);
        blocks.push({
          clauseId: c.id,
          label: c.label,
          supplierName: k.supplierName,
          nights: t.nights.map((n) => ({ date: n.date, rooms: n.rooms })),
          latest: c.pickup ?? null,
          projection: roomBlockInputs.parse(c.inputs ?? {}).projection,
          inbound: null,
        });
      }
      if (c.type === "FB_MINIMUM") {
        const t = fbMinimumTerms.parse(c.terms);
        const i = fbMinimumInputs.parse(c.inputs ?? {});
        fbs.push({ clauseId: c.id, label: c.label, supplierName: k.supplierName, currency: k.currency, minimumMinor: t.minimumMinor, ...i });
      }
    }
  }

  const figure = (label: string, value: number, sub: React.ReactNode, sValue?: number) => (
    <div className="min-w-0">
      <p className="text-table text-muted">{label}</p>
      <p className="num text-figure font-semibold">{money(value)}</p>
      {scenario && sValue !== undefined ? (
        <p className="num text-table">
          Scenario {money(sValue)}{" "}
          <span className={sValue > value ? "text-risk" : sValue < value ? "text-settled" : "text-muted"}>
            ({sValue - value >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(sValue - value), ccy, { withCode: false })})
          </span>
        </p>
      ) : null}
      <div className="text-meta text-muted">{sub}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            {figure(
              "Current exposure",
              current.current.totalMinor,
              <>
                Room block attrition and F&B shortfalls expected if nothing changes, as of {formatDate(current.asOf)}.
                {current.overThreshold ? (
                  <span className="ml-1">
                    <Status plain tone="risk">Over the {money(current.thresholdMinor)} alert threshold</Status>
                  </span>
                ) : null}
              </>,
              scenario?.current.totalMinor,
            )}
            <BearerBar
              agencyMinor={current.current.agencyMinor}
              clientMinor={current.current.clientMinor}
              unassignedMinor={current.current.unassignedMinor}
              currency={ccy}
            />
          </div>
          {figure(
            "Cancellation exposure",
            current.cancellation.totalMinor,
            <>
              If cancelled {cancelOn ? `on ${formatDate(cancelOn)}` : "today"}. Still owed after deposits:{" "}
              <span className="num">{money(current.cancellation.netOwedMinor)}</span>.
            </>,
            scenario?.cancellation.totalMinor,
          )}
        </div>
        {!current.complete ? (
          <div className="border-t border-rule bg-watch-bg px-4 py-2.5 text-table">
            <p className="font-medium text-watch">Incomplete: these figures leave out what can&apos;t be calculated yet</p>
            <ul className="mt-1 list-disc pl-5">
              {current.missing.map((m) => (
                <li key={m.field + m.label}>{m.label}</li>
              ))}
              {current.unconfirmedClauseCount ? (
                <li>
                  {current.unconfirmedClauseCount} proposed term{current.unconfirmedClauseCount === 1 ? "" : "s"} awaiting review (
                  <Link href={`/events/${id}/contracts`} className="text-brand hover:underline">
                    review contracts
                  </Link>
                  )
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {!current.agreementName ? (
          <p className="border-t border-rule px-4 py-2 text-table text-watch">
            No client agreement is in force for this event, so every penalty is unassigned.{" "}
            <Link href={`/clients/${event.clientId}`} className="text-brand hover:underline">
              Add the agreement
            </Link>
          </p>
        ) : null}
      </Panel>

      <Panel
        title="Scenario"
        description="Test a change before deciding. Nothing is saved."
        actions={
          scenarioActive ? (
            <Link href={`/events/${id}/exposure`} className="text-table text-brand hover:underline">
              Clear scenario
            </Link>
          ) : null
        }
      >
        <form method="get" className="flex flex-wrap items-end gap-3 p-4">
          <label className="flex flex-col gap-1 text-table font-medium">
            Attendance change (%)
            <input
              name="attendance"
              type="number"
              min={-100}
              max={50}
              step={1}
              defaultValue={attendancePct ?? ""}
              placeholder="e.g. -20"
              className="num h-8 w-32 rounded-control border border-rule-strong bg-surface px-2.5 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-table font-medium">
            Cancel on
            <input name="cancelOn" type="date" defaultValue={cancelOn ?? ""} className="h-8 rounded-control border border-rule-strong bg-surface px-2.5 font-normal" />
          </label>
          <button type="submit" className="h-8 rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken">
            Run scenario
          </button>
          <p className="basis-full text-meta text-muted">
            Attendance changes scale projected room pickup and F&B spend. Cancellation uses the tier in force on the chosen date.
            {scenarioActive ? (
              <span className="ml-1 font-medium text-ink">
                Showing: {attendancePct ? `${attendancePct > 0 ? "+" : ""}${attendancePct}% attendance` : ""}
                {attendancePct && cancelOn ? ", " : ""}
                {cancelOn ? `cancelled on ${formatDate(cancelOn)}` : ""}. Not saved.
              </span>
            ) : null}
          </p>
        </form>
      </Panel>

      <Panel title="By contract" description="Select any amount to see how it was calculated.">
        {lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-table text-muted">
            No active contract has room blocks, F&B minimums or cancellation terms yet.
          </p>
        ) : (
          <ExposureLines lines={lines} baseCurrency={ccy} agreementName={current.agreementName} scenario={Boolean(scenario)} />
        )}
      </Panel>

      <InputsPanel eventId={id} blocks={await withInbound(ctx, blocks)} fbs={fbs} attendance={event.forecastAttendance} canEdit={can(ctx.actor, "pickup.edit", scope)} />
    </div>
  );
}

/** Attaches each block's emailed-report settings (milestone 14). */
async function withInbound(ctx: Parameters<typeof getInboundForBlocks>[0], blocks: BlockInput[]): Promise<BlockInput[]> {
  const views = await getInboundForBlocks(ctx, blocks.map((b) => b.clauseId));
  return blocks.map((b) => {
    const v = views.find((x) => x.clauseId === b.clauseId);
    return { ...b, inbound: v ? { address: v.address, allowedSenderDomain: v.allowedSenderDomain, lastReceivedAt: v.lastReceivedAt, lastResult: v.lastResult } : null };
  });
}
