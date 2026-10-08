import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import type { ServiceCtx } from "@/services/context";
import { decisionsLog, exposureByClient, paymentSchedule, penaltyVariance, toCsv } from "@/services/reports";
import { getLedger, type LedgerPeriod } from "@/services/ledger";

const m = (minor: number | null) => (minor === null ? null : (minor / 100).toFixed(2));

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Sign in to export reports.", { status: 401 });
  const ctx: ServiceCtx = {
    db: getDb(),
    now: () => new Date(),
    actor: {
      userId: actor.userId,
      name: actor.name,
      role: actor.role,
      orgId: actor.org.id,
      orgTimezone: actor.org.timezone,
      baseCurrency: actor.org.baseCurrency,
      config: actor.org.config,
    },
  };
  const { name } = await params;
  let csv: string;
  if (name === "ledger") {
    const p = new URL(req.url).searchParams.get("period");
    const l = await getLedger(ctx, (p === "year" || p === "all" ? p : "quarter") as LedgerPeriod);
    csv = toCsv(
      ["Kind", "Date", "Event", "What", "Recorded by", "Currency", "Amount", `Amount (${l.currency})`, "Room nights", "Margin"],
      [
        ...l.removed.items.map((d) => [d.type === "RELEASED_INVENTORY" ? "Rooms given back" : "Renegotiated", d.at.toISOString().slice(0, 10), d.eventName, d.what, d.by ?? "", d.currency, m(d.amountMinor), m(d.baseMinor), d.roomNights ?? "", ""]),
        ...l.billed.items.map((c) => ["Client change billed", c.appliedAt.toISOString().slice(0, 10), c.eventName, `CR-${c.number}: ${c.title}`, "", c.currency, m(c.priceMinor), m(c.basePriceMinor), "", m(c.priceMinor - c.costMinor)]),
      ],
    );
  } else if (name === "exposure") {
    const d = await exposureByClient(ctx);
    csv = toCsv(
      ["Client", "Open events", `Current exposure (${d.currency})`, "Agency", "Client share", "Unassigned", "If cancelled", "Incomplete events"],
      d.rows.map((r) => [r.client, r.events, m(r.current), m(r.agency), m(r.clientShare), m(r.unassigned), m(r.cancellation), r.incomplete]),
    );
  } else if (name === "payments") {
    const d = await paymentSchedule(ctx, 90);
    csv = toCsv(
      ["Due (UTC)", "Supplier time zone", "Payment", "Supplier", "Event", "Currency", "Amount", "Paid", "Outstanding", `Outstanding (${d.currency})`],
      d.rows.map((o) => [o.dueAt.toISOString(), o.dueTz, o.label, o.supplierName, o.eventName, o.currency, m(o.amountMinor), m(o.paidMinor), m(o.outstandingMinor), m(o.baseMinor)]),
    );
  } else if (name === "penalties") {
    const rows = await penaltyVariance(ctx);
    csv = toCsv(
      ["Event", "Client", "Status", "Currency", "Projected 7 days before", "Actually charged", "Removed by decisions"],
      rows.map((r) => [r.name, r.clientName, r.status, r.currency, m(r.projectedMinor), m(r.actualMinor), m(r.avoidedMinor)]),
    );
  } else if (name === "decisions") {
    const rows = await decisionsLog(ctx);
    csv = toCsv(
      ["Decided (UTC)", "Event", "Client", "Decision", "Note", "By", "Currency", "Exposure removed"],
      rows.map((d) => [d.createdAt.toISOString(), d.eventName, d.clientName, d.type, d.note, d.byName, d.currency, d.exposureDeltaMinor ? m(Math.abs(d.exposureDeltaMinor)) : null]),
    );
  } else {
    return new Response("Unknown report.", { status: 404 });
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
