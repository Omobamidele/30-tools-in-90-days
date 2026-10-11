import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getCsql, listSellers, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { isNotFound } from "@/services/errors";
import { Attributes, Breadcrumbs, Panel } from "@/ui/page";
import { Avatar, CompanyLogo, Money, MoneyShort, Status, TypeBadge } from "@/ui/bits";
import { Evidence } from "@/ui/evidence";
import { storyHeadline } from "@/ui/story";
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

  const t = ctx.actor.config.terminology;

  return (
    <>
      <Breadcrumbs items={[{ href: "/csqls", label: t.csqlPlural }, { label: d.label }]} />
      <header className="mb-8 flex flex-wrap items-start gap-4">
        <CompanyLogo name={d.account.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-display font-semibold">
            <Link href={`/accounts/${d.account.id}`} className="hover:underline">
              {d.account.name}
            </Link>
          </h1>
          <p className="mt-1 text-section text-muted">
            {d.label}, handed from {d.sourcedBy} to {d.owner ?? "the seller queue"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Status tone={stage.tone}>{stage.label}</Status>
            {due ? <Status tone={due.tone}>{due.text}</Status> : null}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-8">
          <figure className="rounded-panel border border-rule bg-surface p-6 shadow-card">
            <figcaption className="flex items-center gap-2.5 text-table text-muted">
              <Avatar name={d.sourcedBy} size={30} className="ring-0" />
              <span>
                <span className="font-medium text-text">{d.sourcedBy}</span> wrote, {formatDateTime(c.createdAt, ctx.actor.timezone)}
              </span>
            </figcaption>
            <blockquote className="font-display mt-4 text-story font-medium whitespace-pre-line text-balance">“{c.handoffNote}”</blockquote>
            {d.contact ? (
              <p className="mt-4 flex items-center gap-2 text-table text-muted">
                <Avatar name={d.contact.name} size={22} className="ring-0" />
                Best contact: <span className="text-text">{d.contact.name}</span>
                {d.contact.title ? `, ${d.contact.title}` : ""}
              </p>
            ) : null}
          </figure>

          {c.status === "RETURNED" && c.returnReason ? (
            <section aria-labelledby="returned" className="rounded-panel border border-watch/30 bg-watch-bg p-5">
              <h2 id="returned" className="text-section font-semibold text-watch">
                Why it came back
              </h2>
              <p className="mt-1 text-body">{c.returnReason}</p>
            </section>
          ) : null}

          <section aria-labelledby="evidence">
            <h2 id="evidence" className="text-section font-semibold">
              What customer success saw
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {d.evidence.map((s) => (
                <li key={s.id} className="rounded-panel border border-rule p-5">
                  <div className="flex items-start gap-3">
                    <TypeBadge type={s.type} size={32} />
                    <Link href={`/signals/${s.id}`} className="min-w-0 font-medium hover:underline">
                      {storyHeadline(s.type, s.evidence, t)}
                    </Link>
                  </div>
                  <Evidence type={s.type} evidence={s.evidence} terms={t} size="compact" className="mt-3" />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="history">
            <h2 id="history" className="text-section font-semibold">
              What happened
            </h2>
            <ol className="mt-3 border-l border-rule-strong pl-4">
              {d.history.map((h) => (
                <li key={h.id} className="relative pb-3 text-table">
                  <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-rule-strong" />
                  <span className="font-medium">{h.actorLabel}</span> <span className="text-muted">{h.summary}</span>
                  <span className="block text-meta text-faint">{formatDateTime(h.at, ctx.actor.timezone)}</span>
                </li>
              ))}
            </ol>
          </section>
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
                ...(c.status === "WON" ? [{ label: "Won", value: <MoneyShort minor={c.outcomeAmountMinor} currency={currency} className="font-semibold" /> }] : []),
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
