import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getCsql, listSellers, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { isNotFound } from "@/services/errors";
import { Attributes, PageHeader, Panel } from "@/ui/page";
import { CompanyLogo, Money, MoneyShort, RuleTag, Status } from "@/ui/bits";
import { deadlineText, formatDate, formatDateTime } from "@/ui/format";
import { CsqlActions } from "./csql-actions";

export const metadata: Metadata = { title: "CSQL" };

const STAGE: Record<string, { label: string; tone: "risk" | "watch" | "won" | "neutral" | "brand" }> = {
  ROUTED: { label: "Routed to seller", tone: "brand" },
  RETURNED: { label: "Returned to customer success", tone: "watch" },
  ACCEPTED: { label: "Accepted by seller", tone: "brand" },
  OPPORTUNITY: { label: "Opportunity in the CRM", tone: "brand" },
  WON: { label: "Won", tone: "won" },
  LOST: { label: "Lost", tone: "neutral" },
  CLOSED_NO_OPP: { label: "Closed, no opportunity", tone: "neutral" },
};

export default async function CsqlPage({ params }: PageProps<"/csqls/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
  const d = await getCsql(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const c = d.csql;
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;
  const opp = c.opportunity as Opportunity | null;
  const due = (c.status === "ROUTED" || c.status === "RETURNED") && c.dueAt && c.clockStartedAt ? deadlineText(c.clockStartedAt, c.dueAt, now, cal) : null;
  const sellers = d.actions.includes("REASSIGN") || d.actions.includes("REROUTE") ? await listSellers(ctx) : [];
  const stage = STAGE[c.status];

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/csqls", label: ctx.actor.config.terminology.csqlPlural }, { label: d.label }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3">
            <CompanyLogo name={d.account.name} size={36} />
            <span className="text-section font-medium text-muted">{d.label}</span>
            <Link href={`/accounts/${d.account.id}`} className="hover:underline">
              {d.account.name}
            </Link>
          </span>
        }
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Status tone={stage.tone}>{stage.label}</Status>
            {due ? <Status tone={due.tone}>{due.text}</Status> : null}
            <span>
              Seller <span className="text-text">{d.owner ?? "Unassigned"}</span> · from <span className="text-text">{d.sourcedBy}</span>
            </span>
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Handoff note" id="note">
            <blockquote className="px-4 py-3 text-body whitespace-pre-line">{c.handoffNote}</blockquote>
            <p className="border-t border-rule px-4 py-2 text-meta text-muted">
              {d.sourcedBy} · {formatDateTime(c.createdAt, ctx.actor.timezone)}
              {d.contact ? (
                <>
                  {" "}
                  · best contact {d.contact.name}
                  {d.contact.title ? `, ${d.contact.title}` : ""}
                </>
              ) : null}
            </p>
          </Panel>

          {c.status === "RETURNED" && c.returnReason ? (
            <Panel title="Why it came back" id="returned">
              <p className="px-4 py-3 text-body">{c.returnReason}</p>
            </Panel>
          ) : null}

          <Panel title={`Evidence (${d.evidence.length} signal${d.evidence.length === 1 ? "" : "s"})`} id="evidence">
            <ul className="divide-y divide-rule">
              {d.evidence.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <RuleTag type={s.type} />
                    <Link href={`/signals/${s.id}`} className="mt-1 block text-table hover:underline">
                      {s.explanation}
                    </Link>
                    <span className="block text-meta text-muted">{s.valueWorking}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="History" id="history">
            <ol className="divide-y divide-rule">
              {d.history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-table">
                  <span>
                    <span className="font-medium">{h.actorLabel}</span> · {h.summary}
                  </span>
                  <span className="text-meta text-muted">{formatDateTime(h.at, ctx.actor.timezone)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <CsqlActions
            csql={{ id: c.id, lockVersion: c.lockVersion, status: c.status, estimateMinor: c.adjustedValueMinor ?? c.estValueMinor, oppAmountMinor: opp?.amountMinor ?? null }}
            actions={d.actions}
            sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
            returnReasons={ctx.actor.config.returnReasons}
            lostReasons={ctx.actor.config.lostReasons}
            currency={currency}
            csqlTerm={ctx.actor.config.terminology.csql}
          />
          <Panel title="Value" id="value">
            <Attributes
              items={[
                { label: "Rule estimate", value: <Money minor={c.estValueMinor} currency={currency} /> },
                ...(c.adjustedValueMinor !== null ? [{ label: "CSM's estimate", value: <Money minor={c.adjustedValueMinor} currency={currency} /> }] : []),
                { label: "Opportunity", value: opp ? <Money minor={opp.amountMinor} currency={currency} /> : <span className="text-faint">Not recorded yet</span> },
                ...(opp?.crmRef ? [{ label: "CRM reference", value: <span>{opp.crmRef}</span> }] : []),
                ...(opp?.expectedClose ? [{ label: "Expected close", value: opp.expectedClose }] : []),
                ...(c.status === "WON" ? [{ label: "Won", value: <MoneyShort minor={c.outcomeAmountMinor} currency={currency} className="font-semibold text-won" /> }] : []),
                ...(c.outcomeReason ? [{ label: c.status === "LOST" ? "Lost because" : "Reason", value: c.outcomeReason }] : []),
                ...(c.closedAt ? [{ label: "Closed", value: formatDate(c.closedAt, ctx.actor.timezone) }] : []),
              ]}
            />
            <p className="border-t border-rule px-4 py-2 text-meta text-muted">Only the seller&apos;s recorded amounts count in Results. Estimates never do.</p>
          </Panel>
          <Panel title="Routing" id="routing">
            <p className="px-4 py-3 text-table">{c.routedReason}</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
