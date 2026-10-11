import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getCsql, listSellers, type Opportunity } from "@/services/csqls";
import { calendarOf } from "@/services/org";
import { isNotFound } from "@/services/errors";
import { Attributes, RecordLayout, RecordSection, RecordTabs } from "@/ui/page";
import { Money, MoneyShort, Status } from "@/ui/bits";
import { ArrowLeft } from "@/ui/icons";
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

export default async function CsqlPage({ params, searchParams }: PageProps<"/csqls/[id]">) {
  const { id } = await params;
  const { view } = (await searchParams) as { view?: string };
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
  const activity = view === "activity";

  const left = (
    <>
      <Link href="/csqls" className="inline-flex items-center gap-1.5 text-meta font-medium text-brand hover:underline">
        <ArrowLeft size={14} aria-hidden /> {t.csqlPlural}
      </Link>
      <h1 className="mt-4 text-title font-semibold">
        <Link href={`/accounts/${d.account.id}`} className="hover:underline">
          {d.account.name}
        </Link>
      </h1>
      <p className="mt-1 text-body text-muted">{d.label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Status tone={stage.tone}>{stage.label}</Status>
        {due ? <Status tone={due.tone}>{due.text}</Status> : null}
      </div>
      <RecordSection title={`About this ${t.csql}`}>
        <Attributes
          items={[
            { label: "Seller", value: d.owner ?? "Seller queue" },
            { label: "From customer success", value: d.sourcedBy },
            { label: "Created", value: formatDateTime(c.createdAt, ctx.actor.timezone) },
            { label: "Rule estimate", value: <Money minor={c.estValueMinor} currency={currency} /> },
            ...(c.adjustedValueMinor !== null ? [{ label: "CSM's estimate", value: <Money minor={c.adjustedValueMinor} currency={currency} /> }] : []),
            { label: "Opportunity", value: opp ? <Money minor={opp.amountMinor} currency={currency} /> : <span className="text-faint">Not recorded yet</span> },
            ...(opp?.crmRef ? [{ label: "CRM reference", value: <span>{opp.crmRef}</span> }] : []),
            ...(opp?.expectedClose ? [{ label: "Expected close", value: opp.expectedClose }] : []),
            ...(c.status === "WON" ? [{ label: "Won", value: <MoneyShort minor={c.outcomeAmountMinor} currency={currency} /> }] : []),
            ...(c.outcomeReason ? [{ label: c.status === "LOST" ? "Lost because" : "Reason", value: c.outcomeReason }] : []),
            ...(c.closedAt ? [{ label: "Closed", value: formatDate(c.closedAt, ctx.actor.timezone) }] : []),
          ]}
        />
        <p className="text-meta text-muted">Only the seller&apos;s recorded amounts count in Results. Estimates never do.</p>
      </RecordSection>
    </>
  );

  const middle = (
    <>
      <RecordTabs
        items={[
          { href: `/csqls/${c.id}`, label: "Overview", active: !activity },
          { href: `/csqls/${c.id}?view=activity`, label: "Activity", active: activity, count: d.history.length },
        ]}
      />
      {activity ? (
        <ol className="mt-6 border-l border-rule-strong pl-5">
          {d.history.map((h) => (
            <li key={h.id} className="relative pb-5">
              <span aria-hidden className="absolute top-2 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-brand" />
              <p className="text-body">
                <span className="font-medium">{h.actorLabel}</span> <span className="text-muted">{h.summary}</span>
              </p>
              <p className="text-meta text-faint">{formatDateTime(h.at, ctx.actor.timezone)}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex flex-col gap-10 pt-6">
          <figure>
            <figcaption className="text-meta text-muted">
              {d.sourcedBy} wrote, {formatDateTime(c.createdAt, ctx.actor.timezone)}
            </figcaption>
            <blockquote className="mt-2 border-l-[3px] border-brand pl-4 text-story whitespace-pre-line text-balance">{c.handoffNote}</blockquote>
            {d.contact ? (
              <p className="mt-3 text-body text-muted">
                Best contact: <span className="text-text">{d.contact.name}</span>
                {d.contact.title ? `, ${d.contact.title}` : ""}
              </p>
            ) : null}
          </figure>

          {c.status === "RETURNED" && c.returnReason ? (
            <section aria-labelledby="returned" className="rounded-panel bg-watch-bg px-5 py-4">
              <h2 id="returned" className="text-section font-semibold text-watch">
                Why it came back
              </h2>
              <p className="mt-1 text-body">{c.returnReason}</p>
            </section>
          ) : null}

          <CsqlActions
            csql={{ id: c.id, lockVersion: c.lockVersion, status: c.status, estimateMinor: c.adjustedValueMinor ?? c.estValueMinor, oppAmountMinor: opp?.amountMinor ?? null }}
            actions={d.actions}
            sellers={sellers.map((s) => ({ id: s.id, name: s.name }))}
            returnReasons={ctx.actor.config.returnReasons}
            lostReasons={ctx.actor.config.lostReasons}
            currency={currency}
            csqlTerm={ctx.actor.config.terminology.csql}
          />

          <section aria-labelledby="evidence">
            <h2 id="evidence" className="text-section font-semibold">
              What customer success saw
            </h2>
            <ul className="mt-2 divide-y divide-rule">
              {d.evidence.map((s) => (
                <li key={s.id} className="py-5">
                  <Link href={`/signals/${s.id}`} className="font-semibold text-brand hover:underline">
                    {storyHeadline(s.type, s.evidence, t)}
                  </Link>
                  <Evidence type={s.type} evidence={s.evidence} terms={t} size="compact" className="mt-3" />
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );

  const right = (
    <>
      <RecordSection title="Account" first>
        <p className="py-4">
          <Link href={`/accounts/${d.account.id}`} className="font-semibold text-brand hover:underline">
            {d.account.name}
          </Link>
        </p>
      </RecordSection>
      <RecordSection title="How it was routed">
        <p className="py-4 text-body">{c.routedReason}</p>
      </RecordSection>
    </>
  );

  return <RecordLayout left={left} middle={middle} right={right} />;
}
