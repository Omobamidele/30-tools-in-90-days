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
import { Attributes, RecordLayout, RecordSection, RecordTabs } from "@/ui/page";
import { MoneyShort, RULE_META, SimulatedTag, Status } from "@/ui/bits";
import { Evidence } from "@/ui/evidence";
import { storyHeadline, worthText } from "@/ui/story";
import { ArrowLeft } from "@/ui/icons";
import { ago, deadlineText, formatDateTime, priorityReason, priorityWord } from "@/ui/format";
import { TriageActions } from "./[id]/triage-actions";

// A signal's record page (docs/09 rev. 5), HubSpot-style: key details on the left, the story
// and the decision in the middle (with an Activity tab), and the associated account, people and
// open CSQL on the right.

export async function SignalStory({ ctx, id, view }: { ctx: ServiceCtx; id: string; view?: string }) {
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
  const reasons = (s.priorityLines as string[]).map(priorityReason).filter((r): r is string => r !== null && !r.startsWith("Worth about"));
  const renewalDays = sub ? daysBetween(today, sub.termEnd) : null;
  const activity = view === "activity";

  const left = (
    <>
      <Link href="/signals" className="inline-flex items-center gap-1.5 text-meta font-medium text-brand hover:underline">
        <ArrowLeft size={14} aria-hidden /> Signals
      </Link>
      <h1 className="mt-4 text-title font-semibold">
        <Link href={`/accounts/${account.id}`} className="hover:underline">
          {account.name}
        </Link>
      </h1>
      <p className="mt-1 text-body text-muted">{RULE_META[s.type].plain}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === "NEW" ? <Status tone={due.tone}>{due.text}</Status> : null}
        {s.status === "SNOOZED" ? <Status tone="neutral">Snoozed until {s.snoozeUntil}</Status> : null}
        {s.status === "ACCEPTED" ? <Status tone="won">Accepted{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
        {s.status === "DISMISSED" ? <Status tone="neutral">Dismissed{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
        {s.status === "EXPIRED" ? <Status tone="neutral">Expired</Status> : null}
        {priority.tone === "brand" ? <Status tone="brand">{priority.text}</Status> : null}
      </div>
      <RecordSection title="About this signal">
        <Attributes
          items={[
            { label: "Spotted", value: `${ago(s.detectedAt, now)} (${formatDateTime(s.detectedAt, ctx.actor.timezone)})` },
            { label: "Review by", value: formatDateTime(s.triageDueAt, ctx.actor.timezone) },
            { label: "Priority", value: priority.text },
            { label: "Estimated value", value: s.estValueMinor === null ? "Not estimated" : `${formatMoneyShort(s.estValueMinor, currency)} a year` },
            { label: "Rule", value: `${rule.name} (version ${s.ruleVersion})` },
          ]}
        />
      </RecordSection>
    </>
  );

  const middle = (
    <>
      <RecordTabs
        items={[
          { href: `/signals/${s.id}`, label: "Overview", active: !activity },
          { href: `/signals/${s.id}?view=activity`, label: "Activity", active: activity, count: data.history.length },
        ]}
      />
      {activity ? (
        <ol className="mt-6 border-l border-rule-strong pl-5">
          {data.history.map((h) => (
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
          <section aria-labelledby="story">
            <h2 id="story" className="text-title font-semibold text-balance">
              {storyHeadline(s.type, s.evidence, terms)}
            </h2>
            <div className="mt-5">
              <Evidence type={s.type} evidence={s.evidence} terms={terms} size="full" />
            </div>
            {data.dataAgeDays !== null && data.dataAgeDays > ctx.actor.config.detection.staleAfterDays ? (
              <p className="mt-4 rounded-control bg-watch-bg px-3 py-2 text-table text-watch">Usage is {data.dataAgeDays} days old; no new signals until it updates.</p>
            ) : null}
          </section>

          <section aria-labelledby="why">
            <h2 id="why" className="text-section font-semibold">
              Why it&apos;s worth a conversation
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-body">
              <li>
                {worthText(s.estValueMinor === null ? null : formatMoneyShort(s.estValueMinor, currency))}.{" "}
                {s.valueWorking ? <span className="text-muted">{s.valueWorking}</span> : null}
              </li>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>

          {open ? (
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
            <p className="text-body">
              Handed to the seller in{" "}
              <Link href={`/csqls/${s.csqlId}`} className="link">
                the {terms.csql}
              </Link>
              .
            </p>
          ) : s.status === "DISMISSED" ? (
            <p className="text-body">
              Dismissed: {s.dismissReason}
              {s.dismissNote ? <span className="block text-muted">{s.dismissNote}</span> : null}
            </p>
          ) : null}
        </div>
      )}
    </>
  );

  const right = (
    <>
      <RecordSection title="Account" first>
        <p className="pt-4">
          <Link href={`/accounts/${account.id}`} className="font-semibold text-brand hover:underline">
            {account.name}
          </Link>
        </p>
        <Attributes
          items={[
            { label: "Plan", value: sub ? sub.plan : null },
            { label: "Pays", value: sub ? <span><MoneyShort minor={sub.arrMinor} currency={currency} /> a year</span> : null },
            { label: terms.seats, value: sub ? `${data.latestUsage?.activeSeats ?? "–"} in use of ${sub.seatsPurchased}` : null },
            { label: "Renews", value: sub ? `${sub.termEnd}, in ${renewalDays} days` : null },
            ...(data.latestUsage?.source === "SIMULATED" ? [{ label: "Usage source", value: <SimulatedTag /> }] : []),
          ]}
        />
      </RecordSection>
      <RecordSection title="People">
        <Attributes
          items={[
            { label: "Customer success", value: data.csmName },
            { label: "Account owner", value: data.ownerName ?? <span className="text-muted">None: accepting sends it to the seller queue</span> },
            ...(data.assigneeName ? [{ label: "Assigned to", value: data.assigneeName }] : []),
          ]}
        />
      </RecordSection>
      {data.openCsql ? (
        <RecordSection title={`Open ${terms.csql}`}>
          <p className="py-4 text-body">
            <Link href={`/csqls/${data.openCsql.id}`} className="font-semibold text-brand hover:underline">
              {csqlLabel(terms.csql, data.openCsql.number)}
            </Link>{" "}
            is already open on this account. Accepting adds this signal to it.
          </p>
        </RecordSection>
      ) : null}
    </>
  );

  return <RecordLayout left={left} middle={middle} right={right} />;
}
