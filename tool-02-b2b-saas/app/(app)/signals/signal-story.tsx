import Link from "next/link";
import { notFound } from "next/navigation";
import type { ServiceCtx } from "@/services/context";
import { getSignal } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { isNotFound } from "@/services/errors";
import { listUsers } from "@/services/users";
import { daysBetween } from "@/core/dates";
import { localDate } from "@/core/business-time";
import { formatMoneyShort } from "@/core/money";
import { csqlLabel } from "@/services/csqls";
import { Attributes, Panel } from "@/ui/page";
import { CompanyLogo, Handoff, MoneyShort, RuleTag, SimulatedTag, Status } from "@/ui/bits";
import { Evidence } from "@/ui/evidence";
import { storyHeadline, worthText } from "@/ui/story";
import { ago, deadlineText, formatDateTime, priorityReason, priorityWord } from "@/ui/format";
import { TriageActions } from "./[id]/triage-actions";

// One signal told as a story (docs/09 rev. 3): the customer, what they did, the evidence
// picture, why it matters, then the decision. Used by the inbox's reading pane and by the
// signal's own page, so both always show the same thing.

export async function SignalStory({ ctx, id, layout }: { ctx: ServiceCtx; id: string; layout: "pane" | "page" }) {
  const data = await getSignal(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { signal: s, account, subscription: sub, rule } = data;
  const now = ctx.now();
  const cal = calendarOf(ctx);
  const currency = ctx.actor.currency;
  const terms = ctx.actor.config.terminology;
  const today = localDate(now, ctx.actor.timezone);
  const due = deadlineText(new Date(s.triageDueAt.getTime() - ctx.actor.config.deadlines.triageBusinessDays * 86_400_000), s.triageDueAt, now, cal);
  const people = data.canReassign ? (await listUsers(ctx)).filter((u) => ["CSM", "CS_LEAD"].includes(u.role) && u.status === "ACTIVE") : [];
  const open = s.status === "NEW" || s.status === "SNOOZED";
  const priority = priorityWord(s.priority, ctx.actor.config.detection.highPriorityScore);
  const reasons = (s.priorityLines as string[]).map(priorityReason).filter((r): r is string => r !== null);
  const renewalDays = sub ? daysBetween(today, sub.termEnd) : null;
  const Headline = layout === "page" ? "h1" : "h2";

  const story = (
    <article className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CompanyLogo name={account.name} size={layout === "page" ? 44 : 40} />
        <span className="min-w-0">
          <Link href={`/accounts/${account.id}`} className="font-display block text-title font-semibold hover:underline">
            {account.name}
          </Link>
          <span className="block text-meta text-muted">
            {sub ? `${sub.plan} plan, renews in ${renewalDays} days` : "No subscription on file"}
          </span>
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <RuleTag type={s.type} />
        {s.status === "NEW" ? <Status tone={due.tone}>{due.text}</Status> : null}
        {s.status === "SNOOZED" ? <Status tone="neutral">Snoozed until {s.snoozeUntil}</Status> : null}
        {s.status === "ACCEPTED" ? <Status tone="won">Accepted{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
        {s.status === "DISMISSED" ? <Status tone="neutral">Dismissed{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
        {s.status === "EXPIRED" ? <Status tone="neutral">Expired</Status> : null}
        {priority.tone === "brand" ? <Status tone="brand">{priority.text}</Status> : null}
        <span className="text-meta text-faint">Spotted {ago(s.detectedAt, now)}</span>
      </div>

      <Headline className="mt-3 text-display font-semibold text-balance">{storyHeadline(s.type, s.evidence, terms)}</Headline>

      <div className="mt-5 rounded-panel border border-rule bg-sunken/60 p-5">
        <Evidence type={s.type} evidence={s.evidence} terms={terms} size="full" />
        {data.dataAgeDays !== null && data.dataAgeDays > ctx.actor.config.detection.staleAfterDays ? (
          <p className="mt-3 rounded-control bg-watch-bg px-3 py-2 text-table text-watch">Usage is {data.dataAgeDays} days old; no new signals until it updates.</p>
        ) : null}
      </div>

      <section aria-labelledby="why" className="mt-6">
        <h2 id="why" className="text-section font-semibold">
          Why it&apos;s worth a conversation
        </h2>
        <ul className="mt-2 space-y-1.5 text-body">
          <li className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
            <span>
              {worthText(s.estValueMinor === null ? null : formatMoneyShort(s.estValueMinor, currency))}
              {s.valueWorking ? <span className="text-muted">: {s.valueWorking}</span> : null}
            </span>
          </li>
          {reasons
            .filter((r) => !r.startsWith("Worth about"))
            .map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                <span>{r}</span>
              </li>
            ))}
        </ul>
        <p className="mt-3 text-meta text-faint">
          Rule: {rule.name}, version {s.ruleVersion}
        </p>
      </section>
    </article>
  );

  const decision = open ? (
    <TriageActions
      signal={{ id: s.id, lockVersion: s.lockVersion, status: s.status }}
      canTriage={data.canTriage}
      canReassign={data.canReassign}
      accountName={account.name}
      routeTo={data.ownerName ? `${data.ownerName} (account owner)` : "the segment's seller queue"}
      contacts={data.contacts.map((c) => ({ id: c.id, label: `${c.name}${c.title ? `, ${c.title}` : ""}` }))}
      otherOpen={data.otherOpen.map((o) => ({ id: o.id, label: o.explanation, type: o.type }))}
      openCsql={data.openCsql ? { id: data.openCsql.id, label: csqlLabel(terms.csql, data.openCsql.number) } : null}
      dismissReasons={ctx.actor.config.dismissReasons}
      cooldownDays={rule.cooldownDays}
      materialPct={ctx.actor.config.detection.materialChangePct}
      today={today}
      people={people.map((p) => ({ id: p.id, name: p.name }))}
      csqlTerm={terms.csql}
    />
  ) : s.status === "ACCEPTED" && s.csqlId ? (
    <Panel title="Accepted">
      <p className="px-5 py-3 text-table">
        Handed to the seller in{" "}
        <Link href={`/csqls/${s.csqlId}`} className="link">
          the {terms.csql}
        </Link>
        .
      </p>
    </Panel>
  ) : s.status === "DISMISSED" ? (
    <Panel title="Dismissed">
      <p className="px-5 py-3 text-table">
        {s.dismissReason}
        {s.dismissNote ? <span className="block text-muted">{s.dismissNote}</span> : null}
      </p>
    </Panel>
  ) : null;

  const people_ = (
    <Panel title="Who's involved" id="account">
      <div className="px-5 py-3">
        <Handoff from={data.csmName} to={data.ownerName} />
        <p className="mt-1 text-meta text-muted">{data.ownerName ? `Accepting hands it to ${data.ownerName}, the account owner.` : "No account owner: accepting sends it to the segment's seller queue."}</p>
      </div>
      <Attributes
        items={[
          { label: "Plan", value: sub ? sub.plan : null },
          { label: "Pays", value: sub ? <span><MoneyShort minor={sub.arrMinor} currency={currency} /> a year</span> : null },
          { label: terms.seats, value: sub ? <span className="num">{data.latestUsage?.activeSeats ?? "–"} active of {sub.seatsPurchased}</span> : null },
          { label: "Renewal", value: sub ? <span>{sub.termEnd} <span className="text-muted">({renewalDays} days)</span></span> : null },
          { label: "Assigned to", value: data.assigneeName },
          { label: "Usage source", value: data.latestUsage?.source === "SIMULATED" ? <SimulatedTag /> : (data.latestUsage?.source ?? null) },
        ].filter((x) => x.label !== "Assigned to" || x.value)}
      />
    </Panel>
  );

  const openCsql = data.openCsql ? (
    <Panel title={`Open ${terms.csql}`}>
      <p className="px-5 py-3 text-table">
        <Link href={`/csqls/${data.openCsql.id}`} className="link">
          {csqlLabel(terms.csql, data.openCsql.number)}
        </Link>{" "}
        is already open on this account. Accepting adds this signal to it.
      </p>
    </Panel>
  ) : null;

  const history = data.history.length ? (
    <section aria-labelledby="history">
      <h2 id="history" className="text-section font-semibold">
        History
      </h2>
      <ol className="mt-2 border-l border-rule-strong pl-4">
        {data.history.map((h) => (
          <li key={h.id} className="relative pb-3 text-table">
            <span aria-hidden className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-surface bg-rule-strong" />
            <span className="font-medium">{h.actorLabel}</span> <span className="text-muted">{h.summary}</span>
            <span className="block text-meta text-faint">{formatDateTime(h.at, ctx.actor.timezone)}</span>
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  if (layout === "pane") {
    return (
      <div className="flex flex-col gap-6">
        {story}
        {decision}
        {openCsql}
        {people_}
        {history}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-8">
        {story}
        {history}
      </div>
      <div className="flex flex-col gap-4">
        {decision}
        {openCsql}
        {people_}
      </div>
    </div>
  );
}
