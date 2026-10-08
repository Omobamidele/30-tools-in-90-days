import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "@/ui/icons";
import { appCtx } from "@/services/app-ctx";
import { changeTypeLabels, getChange, type ChangeImpact } from "@/services/changes";
import { listEntityActivity } from "@/services/activity";
import { isNotFound } from "@/services/errors";
import { can, canApproveInternally } from "@/auth/policy";
import { changeStatusLabels, type ChangeStatus } from "@/core/changes/state";
import { formatMoney } from "@/core/money";
import { term } from "@/config/terms";
import { PageHeader, Panel } from "@/ui/page";
import { Status } from "@/ui/status";
import { ActivityList } from "@/ui/activity-list";
import { formatDateTime } from "@/ui/format";
import { cx } from "@/ui/cx";
import { changeTone } from "../change-table";
import { ImpactPanel } from "../impact-panel";
import { ChangeActions } from "./change-actions";
import { ChangeEditor } from "../change-editor";
import { changeEditorOptions } from "../editor-data";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "Change request" };

function Stepper({ status, internal }: { status: ChangeStatus; internal: boolean }) {
  // A real sequence, so numbered steps are justified.
  const steps = ["Draft", ...(internal ? ["Internal review"] : []), "Sent to client", "Decision", "Applied"];
  const at: Record<ChangeStatus, number> = {
    DRAFT: 0,
    INTERNAL_REVIEW: 1,
    SENT_TO_CLIENT: internal ? 2 : 1,
    EXPIRED: internal ? 2 : 1,
    APPROVED: internal ? 3 : 2,
    REJECTED: internal ? 3 : 2,
    WITHDRAWN: -1,
    APPLIED: internal ? 4 : 3,
  };
  const current = at[status];
  return (
    <ol className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-table">
      {steps.map((s, i) => {
        const done = current > i || (status === "APPLIED" && i === current);
        const active = current === i && status !== "APPLIED";
        return (
          <li key={s} className={cx("flex items-center gap-2", active ? "font-medium text-ink" : done ? "text-settled" : "text-muted")}>
            <span className={cx("num flex size-5 items-center justify-center rounded-full border text-meta", done ? "border-settled bg-settled text-white" : active ? "border-brand text-brand" : "border-rule-strong")}>
              {done ? <Check size={12} weight="bold" /> : i + 1}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

export default async function ChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  const data = await getChange(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { cr, event, clientName, creatorName, lines, links, tasks, scope, approverName } = data;
  const cfg = ctx.actor.config;
  const tz = ctx.actor.orgTimezone;
  const canRaise = can(ctx.actor, "change.raise", scope);
  const canApprove = canApproveInternally({ ...ctx.actor, internalApproverRoles: cfg.rules.internalApproverRoles }) && cr.createdBy !== ctx.actor.userId;
  const activity = await listEntityActivity(ctx, "change_request", id, 50);
  const impact = cr.impact as (ChangeImpact & { recipientEmail?: string }) | null;
  const ccy = event.baseCurrency;

  const header = (
    <PageHeader
      title={
        <>
          <span className="num text-muted">CR-{cr.number}</span> {cr.title}
        </>
      }
      crumbs={[
        { href: "/changes", label: term(cfg, "changeRequest", { plural: true }) },
        { href: `/events/${event.id}/changes`, label: event.name },
        { label: `CR-${cr.number}` },
      ]}
      meta={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Status tone={changeTone[cr.status]}>{changeStatusLabels[cr.status]}</Status>
          <span>{changeTypeLabels[cr.type]}</span>
          <span>
            Raised by {creatorName} on {formatDateTime(cr.createdAt, tz)}
          </span>
          <span>Requested by {cr.requestedByType === "CLIENT" ? clientName : "our team"}</span>
        </span>
      }
    >
      {cr.status !== "WITHDRAWN" ? <Stepper status={cr.status} internal={cr.internalApprovalRequired} /> : null}
    </PageHeader>
  );

  if (cr.status === "DRAFT" && canRaise) {
    const opts = await changeEditorOptions(ctx, event.id);
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        {cr.internalNote ? (
          <p role="status" className="mb-4 rounded-control border border-watch/40 bg-watch-bg px-3 py-2 text-table">
            Sent back: {cr.internalNote}
          </p>
        ) : null}
        <ChangeEditor
          {...opts}
          eventId={event.id}
          changeId={id}
          lockVersion={cr.lockVersion}
          currency={ccy}
          forecastAttendance={event.forecastAttendance}
          initial={{
            title: cr.title,
            type: cr.type,
            reason: cr.reason ?? "",
            attendanceDelta: cr.attendanceDelta ? String(cr.attendanceDelta) : "",
            requestedByType: cr.requestedByType,
            lines: lines.map((l) => ({
              contractId: l.contractId ?? "",
              category: l.category,
              description: l.description,
              costDelta: (l.costDeltaMinor / 100).toFixed(2),
              priceDelta: (l.priceDeltaMinor / 100).toFixed(2),
            })),
          }}
        />
        <Panel title="Submit" className="mt-4 max-w-2xl">
          <ChangeActions id={id} status={cr.status} canRaise={canRaise} canApprove={false} defaultEmail={impact?.recipientEmail ?? ""} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      {header}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="What changes">
            <div className="p-4">
              {cr.reason ? <p className="mb-3 text-body whitespace-pre-line">{cr.reason}</p> : null}
              {cr.attendanceDelta ? (
                <p className="mb-2 text-table">
                  Attendance change: <span className="num font-medium">{cr.attendanceDelta > 0 ? "+" : ""}{cr.attendanceDelta}</span>
                </p>
              ) : null}
              {lines.length ? (
                <table className="w-full text-table">
                  <thead className="text-muted">
                    <tr>
                      <th scope="col" className="py-1 text-left font-medium">Line</th>
                      <th scope="col" className="py-1 text-right font-medium">Cost</th>
                      <th scope="col" className="py-1 text-right font-medium">Client price</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {lines.map((l) => (
                      <tr key={l.id} className="border-t border-rule">
                        <td className="py-1.5 font-sans">
                          {l.description} <span className="text-meta text-muted">{l.category}</span>
                        </td>
                        <td className="py-1.5 text-right">{formatMoney(l.costDeltaMinor, ccy, { withCode: false })}</td>
                        <td className="py-1.5 text-right">{formatMoney(l.priceDeltaMinor, ccy, { withCode: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </Panel>
          {tasks.length ? (
            <Panel title="Supplier updates" description="Created when the change was applied. Suppliers are not contacted automatically.">
              <TaskList tasks={tasks.map((t) => ({ id: t.id, title: t.title, done: t.status === "DONE" }))} canEdit={can(ctx.actor, "event.edit", scope)} />
            </Panel>
          ) : null}
          <Panel title="Approvals">
            <ul className="divide-y divide-rule text-table">
              {cr.internalApprovalRequired ? (
                <li className="px-4 py-2">
                  <span className="font-medium">Internal:</span>{" "}
                  {approverName ? `approved by ${approverName}${cr.internalApprovedAt ? ` on ${formatDateTime(cr.internalApprovedAt, tz)}` : ""}` : `required (${cr.internalApprovalReason})`}
                  {cr.internalNote ? <span className="block text-muted">“{cr.internalNote}”</span> : null}
                </li>
              ) : null}
              {links.map((l) => (
                <li key={l.id} className="px-4 py-2">
                  <span className="font-medium">Client link</span> sent to {l.recipientEmail} on {formatDateTime(l.createdAt, tz)}:{" "}
                  {l.usedAt ? (
                    <>
                      <Status plain tone={l.outcome === "APPROVE" ? "settled" : "muted"}>{l.outcome === "APPROVE" ? "Approved" : "Rejected"}</Status> by {l.approverName} on{" "}
                      {formatDateTime(l.usedAt, tz)}
                      {l.comment ? <span className="block text-muted">“{l.comment}”</span> : null}
                    </>
                  ) : l.revokedAt ? (
                    <span className="text-muted">no longer valid</span>
                  ) : (
                    <span className="text-muted">waiting, expires {formatDateTime(l.expiresAt, tz)}</span>
                  )}
                </li>
              ))}
              {!links.length && !cr.internalApprovalRequired ? <li className="px-4 py-2 text-muted">Not submitted yet.</li> : null}
            </ul>
          </Panel>
          <Panel title="Activity">
            <ActivityList entries={activity} timezone={tz} />
          </Panel>
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">
          {impact ? (
            <Panel>
              <div className="p-4">
                <ImpactPanel impact={impact} currency={ccy} title="Impact at submission" />
              </div>
            </Panel>
          ) : null}
          {["INTERNAL_REVIEW", "SENT_TO_CLIENT", "EXPIRED"].includes(cr.status) ? (
            <Panel title="Next step">
              <ChangeActions id={id} status={cr.status} canRaise={canRaise} canApprove={canApprove} defaultEmail={impact?.recipientEmail ?? ""} />
            </Panel>
          ) : null}
          <p className="text-meta text-muted">
            <Link href={`/events/${event.id}/exposure`} className="text-brand hover:underline">
              See current exposure for {event.name}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
