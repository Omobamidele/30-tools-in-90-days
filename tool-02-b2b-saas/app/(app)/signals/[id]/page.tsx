import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { getSignal } from "@/services/signals";
import { calendarOf } from "@/services/org";
import { isNotFound } from "@/services/errors";
import { listUsers } from "@/services/users";
import type { Trace } from "@/core/rules/types";
import { daysBetween } from "@/core/dates";
import { localDate } from "@/core/business-time";
import { csqlLabel } from "@/services/csqls";
import { Attributes, PageHeader, Panel } from "@/ui/page";
import { CompanyLogo, Money, MoneyShort, RuleTag, SimulatedTag, Status } from "@/ui/bits";
import { SignalTrace } from "@/ui/trace";
import { ago, deadlineText, formatDateTime, priorityReason, priorityWord } from "@/ui/format";
import { TriageActions } from "./triage-actions";

export const metadata: Metadata = { title: "Signal" };

export default async function SignalPage({ params }: PageProps<"/signals/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
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

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/signals", label: "Signals" }, { label: account.name }]}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CompanyLogo name={account.name} size={36} />
            <Link href={`/accounts/${account.id}`} className="hover:underline">
              {account.name}
            </Link>
            <RuleTag type={s.type} />
          </span>
        }
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Detected {ago(s.detectedAt, now)}</span>
            {s.status === "NEW" ? <Status tone={due.tone}>{due.text}</Status> : null}
            {s.status === "SNOOZED" ? <Status tone="neutral">Snoozed until {s.snoozeUntil}</Status> : null}
            {s.status === "ACCEPTED" ? <Status tone="won">Accepted{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
            {s.status === "DISMISSED" ? <Status tone="neutral">Dismissed{data.triagedByName ? ` by ${data.triagedByName}` : ""}</Status> : null}
            {s.status === "EXPIRED" ? <Status tone="neutral">Expired</Status> : null}
            <Status tone={priorityWord(s.priority, ctx.actor.config.detection.highPriorityScore).tone}>{priorityWord(s.priority, ctx.actor.config.detection.highPriorityScore).text}</Status>
          </span>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel>
            <div className="p-4">
              <p className="text-[20px] leading-7 font-medium tracking-[-0.01em]">{s.explanation}</p>
              <p className="mt-1 text-table text-muted">
                Rule: {rule.name} · version {s.ruleVersion}
              </p>
              {s.trace ? (
                <div className="mt-4 overflow-x-auto">
                  <p className="mb-1 text-meta text-muted">{(s.trace as Trace).label}, last 30 days</p>
                  <SignalTrace trace={s.trace as Trace} width={900} height={200} axes fluid />
                </div>
              ) : null}
              {data.dataAgeDays !== null && data.dataAgeDays > ctx.actor.config.detection.staleAfterDays ? (
                <p className="mt-3 rounded-control bg-watch-bg px-3 py-2 text-table text-watch">Usage is {data.dataAgeDays} days old; no new signals until it updates.</p>
              ) : null}
            </div>
          </Panel>

          <Panel title="Estimated value" id="value">
            <div className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-3">
              <Money minor={s.estValueMinor} currency={currency} className="text-figure font-medium" />
              <span className="text-meta text-muted">a year, from the price book</span>
            </div>
            <p className="border-t border-rule px-4 py-3 text-table">{s.valueWorking}</p>
          </Panel>

          <Panel title="Why it's worth a look" id="priority" description="What puts this signal where it is in your queue.">
            <ul className="list-disc space-y-1 py-3 pr-4 pl-9 text-table">
              {(s.priorityLines as string[])
                .map(priorityReason)
                .filter((r): r is string => r !== null)
                .map((r) => (
                  <li key={r}>{r}</li>
                ))}
            </ul>
          </Panel>

        </div>

        <div className="flex flex-col gap-4">
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
            <Panel title="Accepted">
              <p className="px-4 py-3 text-table">
                In{" "}
                <Link href={`/csqls/${s.csqlId}`} className="link">
                  the {terms.csql}
                </Link>
                .
              </p>
            </Panel>
          ) : s.status === "DISMISSED" ? (
            <Panel title="Dismissed">
              <p className="px-4 py-3 text-table">
                {s.dismissReason}
                {s.dismissNote ? <span className="block text-muted">{s.dismissNote}</span> : null}
              </p>
            </Panel>
          ) : null}

          <Panel title="Account" id="account">
            <Attributes
              items={[
                { label: "Plan", value: sub ? `${sub.plan}` : null },
                { label: "ARR", value: sub ? <MoneyShort minor={sub.arrMinor} currency={currency} /> : null },
                { label: terms.seats, value: sub ? <span className="num">{data.latestUsage?.activeSeats ?? "–"} active of {sub.seatsPurchased}</span> : null },
                {
                  label: "Renewal",
                  value: sub ? (
                    <span>
                      {sub.termEnd} <span className="text-muted">({daysBetween(today, sub.termEnd)} days)</span>
                    </span>
                  ) : null,
                },
                { label: "CSM", value: data.csmName },
                { label: "Account owner", value: data.ownerName ?? <span className="text-muted">None: goes to the segment queue</span> },
                { label: "Assigned to", value: data.assigneeName },
                { label: "Usage source", value: data.latestUsage?.source === "SIMULATED" ? <SimulatedTag /> : data.latestUsage?.source ?? null },
              ].filter((x) => x.label !== "Assigned to" || x.value)}
            />
          </Panel>

          {data.openCsql ? (
            <Panel title={`Open ${terms.csql}`}>
              <p className="px-4 py-3 text-table">
                <Link href={`/csqls/${data.openCsql.id}`} className="link">
                  {csqlLabel(terms.csql, data.openCsql.number)}
                </Link>{" "}
                is already open on this account. Accepting adds this signal to it.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
      {data.history.length ? (
        <Panel title="History" id="history" className="mt-4">
          <ol className="divide-y divide-rule">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-table">
                <span>
                  <span className="font-medium">{h.actorLabel}</span> · {h.summary}
                </span>
                <span className="text-meta text-muted">{formatDateTime(h.at, ctx.actor.timezone)}</span>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </>
  );
}
