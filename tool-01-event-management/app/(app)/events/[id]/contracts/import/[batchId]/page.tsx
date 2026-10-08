import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { can } from "@/auth/policy";
import { getImportBatch, type BatchRow } from "@/services/contract-import";
import { drainExtractionQueue } from "@/services/documents";
import { isNotFound } from "@/services/errors";
import { getDb } from "@/db/client";
import { ButtonLink, Panel } from "@/ui/page";
import { Status } from "@/ui/status";
import { loadEvent } from "../../../load";
import { AutoRefresh, RetryButton } from "./live";

export const metadata: Metadata = { title: "Contract import" };

function statusOf(r: BatchRow): { tone: "neutral" | "active" | "settled" | "watch" | "risk" | "muted"; text: string } {
  if (!r.run) return { tone: "muted", text: "Added" };
  switch (r.run.status) {
    case "QUEUED":
      return r.run.attempts > 0 ? { tone: "watch", text: "Service busy, trying again" } : { tone: "neutral", text: "Waiting to be read" };
    case "RUNNING":
      return { tone: "active", text: "Reading terms…" };
    case "SUCCEEDED":
      if (r.contractStatus === "IN_REVIEW") return { tone: "watch", text: `${r.run.proposed} term${r.run.proposed === 1 ? "" : "s"} to check` };
      return { tone: "settled", text: r.run.proposed ? "Checked" : "No terms found" };
    case "NOT_APPLICABLE":
      return { tone: "watch", text: r.scan ? "Scan: enter terms by hand" : "Enter terms by hand" };
    case "FAILED":
      return { tone: "risk", text: "Couldn't read" };
  }
}

export default async function ImportBatchPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const { id, batchId } = await params;
  const { ctx, scope } = await loadEvent(id);
  let data;
  try {
    data = await getImportBatch(ctx, batchId);
  } catch (e) {
    if (isNotFound(e)) notFound();
    throw e;
  }
  const { rows, summary } = data;
  if (data.event.id !== id) notFound();
  const canEdit = can(ctx.actor, "contract.edit", scope);
  // Each refresh also restarts the queue if its worker stopped (claims are exclusive, so this is safe).
  if (summary.reading) after(() => drainExtractionQueue(getDb(), { orgId: ctx.actor.orgId }));
  const next = rows.find((r) => r.contractStatus === "IN_REVIEW");
  const reviewed = summary.confirmed + summary.edited + summary.rejected;

  const parts = [
    summary.toReview ? `${summary.toReview} read and waiting for you to check` : null,
    summary.readingOff ? `${summary.readingOff} to enter by hand because automatic reading is off` : null,
    summary.scans ? `${summary.scans} ${summary.scans === 1 ? "is a scan" : "are scans"} to enter by hand` : null,
    summary.reading ? `${summary.reading} still being read` : null,
    summary.failed ? `${summary.failed} couldn't be read` : null,
  ].filter(Boolean);

  return (
    <Panel
      title="Contract import"
      description={`${summary.files} contract${summary.files === 1 ? "" : "s"} imported${parts.length ? `: ${parts.join(", ")}.` : "."}`}
      actions={
        next && canEdit ? (
          <ButtonLink href={`/contracts/${next.contractId}/review`} variant="primary" size="sm">
            Check the next one
          </ButtonLink>
        ) : (
          <ButtonLink href={`/events/${id}/contracts`} size="sm">
            All contracts
          </ButtonLink>
        )
      }
    >
      {summary.reading ? <AutoRefresh /> : null}
      <p role="status" aria-live="polite" className="sr-only">
        {parts.join(", ")}
      </p>
      {reviewed ? (
        <p data-surface className="border-b border-rule bg-sunken/60 px-5 py-2.5 text-table text-muted">
          Of {reviewed} term{reviewed === 1 ? "" : "s"} checked so far, <span className="font-medium text-ink">{summary.confirmed} were right as read</span>,{" "}
          {summary.edited} needed an edit and {summary.rejected} {summary.rejected === 1 ? "was" : "were"} rejected.
        </p>
      ) : null}
      <ul className="divide-y divide-rule">
        {rows.map((r) => {
          const s = statusOf(r);
          return (
            <li key={r.contractId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <Link href={`/contracts/${r.contractId}`} className="block truncate font-medium hover:underline">
                  {r.supplierName}: {r.title}
                </Link>
                <p className="truncate text-meta text-faint">{r.filename ?? "No file"}</p>
                {r.run?.status === "FAILED" || r.run?.status === "NOT_APPLICABLE" ? <p className="mt-0.5 text-meta text-muted">{r.run.reason}</p> : null}
              </div>
              <Status tone={s.tone}>{s.text}</Status>
              <div className="w-32 text-right">
                {r.contractStatus === "IN_REVIEW" && canEdit ? (
                  <ButtonLink href={`/contracts/${r.contractId}/review`} size="sm">
                    Check terms
                  </ButtonLink>
                ) : r.run?.status === "NOT_APPLICABLE" && canEdit ? (
                  <ButtonLink href={`/contracts/${r.contractId}`} size="sm">
                    Enter terms
                  </ButtonLink>
                ) : r.run?.status === "FAILED" && canEdit ? (
                  <RetryButton eventId={id} batchId={batchId} contractId={r.contractId} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
