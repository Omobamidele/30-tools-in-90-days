import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { clauseTypeLabels, contractStatusLabels, getContract } from "@/services/contracts";
import { listEntityActivity } from "@/services/activity";
import { eventScope, listOrgUsers } from "@/services/events";
import { supplierTypeLabels } from "@/services/suppliers";
import { obligationKindLabels } from "@/services/obligations";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { term } from "@/config/terms";
import { Attributes, ButtonLink, PageHeader, Panel } from "@/ui/page";
import { Status, contractStatusTone } from "@/ui/status";
import { Money } from "@/ui/money";
import { ActivityList } from "@/ui/activity-list";
import { formatDate, formatDateTime, formatDue, relativeDue } from "@/ui/format";
import { summarizeClause } from "@/ui/clause-summary";
import { TermsPanel, type TermRow } from "./terms-panel";
import { ContractActions } from "./contract-actions";
import { DocumentPanel } from "./document-panel";
import { latestExtraction } from "@/services/documents";
import { extractor } from "@/adapters/extraction";
import { files } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Contract" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  const data = await getContract(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { contract, event, supplier } = data;
  const [scope, users, activity, run, docRows] = await Promise.all([
    eventScope(ctx.db, ctx.actor.orgId, event.id),
    listOrgUsers(ctx),
    listEntityActivity(ctx, "contract", id, 50),
    latestExtraction(ctx, id),
    contract.documentFileId ? ctx.db.select().from(files).where(eq(files.id, contract.documentFileId)) : Promise.resolve([]),
  ]);
  const doc = docRows[0] ?? null;
  const x = extractor(ctx.actor.config.extraction.enabled);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const cfg = ctx.actor.config;
  const tz = ctx.actor.orgTimezone;
  const editableStatus = !["SUPERSEDED", "CLOSED", "CANCELLED"].includes(contract.status);
  const canEdit = can(ctx.actor, "contract.edit", scope);

  const rows: TermRow[] = data.clauses.map((c) => ({
    id: c.id,
    type: c.type,
    typeLabel: clauseTypeLabels[c.type],
    label: c.label,
    status: c.status,
    terms: c.data as Record<string, unknown>,
    summary: summarizeClause(c.type, c.data as Record<string, unknown>, contract.currency),
    lockVersion: c.lockVersion,
    confirmedByName: c.confirmedBy ? (names.get(c.confirmedBy) ?? null) : null,
    confirmedAtText: c.confirmedAt ? formatDateTime(c.confirmedAt, tz) : null,
  }));
  const proposed = rows.filter((r) => r.status === "PROPOSED").length;
  const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
  const activateBlockedReason =
    proposed > 0
      ? `${proposed} proposed term${proposed === 1 ? "" : "s"} to review first`
      : confirmed === 0
        ? "Add at least one term to activate"
        : null;
  const openObligations = data.obligations.filter((o) => o.status === "OPEN");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={`${supplier.name}: ${contract.title}`}
        crumbs={[
          { href: "/events", label: term(cfg, "event", { plural: true }) },
          { href: `/events/${event.id}`, label: event.name },
          { href: `/events/${event.id}/contracts`, label: "Contracts" },
          { label: supplier.name },
        ]}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Status tone={contractStatusTone[contract.status]}>{contractStatusLabels[contract.status]}</Status>
            {contract.version > 1 ? <span>Version {contract.version}</span> : null}
            <span>{supplierTypeLabels[supplier.type]}</span>
            <Money minor={contract.contractedValueMinor} currency={contract.currency} />
          </span>
        }
        actions={
          <>
            {canEdit && editableStatus ? <ButtonLink href={`/contracts/${id}/edit`}>Edit details</ButtonLink> : null}
            <ContractActions
              contractId={id}
              status={contract.status}
              canActivate={activateBlockedReason === null}
              activateBlockedReason={activateBlockedReason}
              canEdit={canEdit}
            />
          </>
        }
      />
      {contract.status === "SUPERSEDED" ? (
        <p role="status" className="mb-4 rounded-control border border-rule bg-sunken px-3 py-2 text-table">
          This version was superseded by an amendment. It is kept for the record and no longer counts toward deadlines or exposure.
        </p>
      ) : null}
      {contract.status === "DRAFT" && contract.supersedesId ? (
        <p role="status" className="mb-4 rounded-control border border-watch/40 bg-watch-bg px-3 py-2 text-table">
          Amendment in progress. The current version stays in force until you activate this one.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <DocumentPanel
            contractId={id}
            doc={doc ? { id: doc.id, filename: doc.filename, pageCount: doc.pageCount, hasTextLayer: doc.hasTextLayer, uploadedText: `uploaded ${formatDateTime(doc.createdAt, tz)}` } : null}
            run={run ? { status: run.status, reason: run.reason, proposedCount: run.proposedCount, finishedText: run.finishedAt ? formatDateTime(run.finishedAt, tz) : null } : null}
            proposedOpen={proposed}
            canEdit={canEdit && editableStatus}
            canRead={["DRAFT", "IN_REVIEW"].includes(contract.status)}
            extractionAvailable={x.available}
            extractionUnavailableReason={x.unavailableReason}
          />
          <TermsPanel
            contractId={id}
            terms={rows}
            typeLabels={clauseTypeLabels}
            currency={contract.currency}
            editable={canEdit && editableStatus}
            defaults={{
              commitmentPct: cfg.clauseDefaults.attritionCommitmentPct,
              damagesPct: cfg.clauseDefaults.attritionDamagesPct,
              surchargePct: cfg.clauseDefaults.fbShortfallSurchargePct,
            }}
          />
          <Panel
            title="Deadlines from this contract"
            actions={
              <Link href={`/events/${event.id}/deadlines`} className="text-table text-brand hover:underline">
                All event deadlines
              </Link>
            }
          >
            {openObligations.length === 0 ? (
              <p className="px-4 py-6 text-center text-table text-muted">
                {contract.status === "ACTIVE" ? "No open deadlines." : "Deadlines are created when the contract is activated."}
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {openObligations.map((o) => {
                  const rel = relativeDue(o.dueAt, o.dueTz, ctx.now());
                  return (
                    <li key={o.id} className="flex flex-col gap-1 px-4 py-2 text-table md:flex-row md:items-center md:justify-between md:gap-4">
                      <span className="min-w-0">
                        <span className="font-medium">{o.label}</span>{" "}
                        <span className="text-muted">{obligationKindLabels[o.kind]}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {o.amountMinor !== null && o.currency ? <Money minor={o.amountMinor} currency={o.currency} /> : null}
                        <span className="num text-muted">{formatDue(o.dueAt, o.dueTz)}</span>
                        <Status tone={o.dueAt < ctx.now() ? "risk" : rel.days <= 7 ? "watch" : "muted"}>{rel.text}</Status>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Details">
            <Attributes
              items={[
                { label: "Supplier", value: `${supplier.name}${supplier.city ? `, ${supplier.city}` : ""}` },
                { label: "Reference", value: contract.reference },
                { label: "Signed", value: contract.signedDate ? formatDate(contract.signedDate) : null },
                { label: "Currency", value: contract.currency },
                { label: "Contracted value", value: <Money minor={contract.contractedValueMinor} currency={contract.currency} /> },
                { label: "Deadlines shown in", value: event.timezone },
              ]}
            />
          </Panel>
          {data.versions.length > 1 ? (
            <Panel title="Versions">
              <ol className="divide-y divide-rule">
                {data.versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between px-4 py-2 text-table">
                    {v.id === id ? (
                      <span className="font-medium">Version {v.version} (viewing)</span>
                    ) : (
                      <Link href={`/contracts/${v.id}`} className="text-brand hover:underline">
                        Version {v.version}
                      </Link>
                    )}
                    <Status tone={contractStatusTone[v.status]}>{contractStatusLabels[v.status]}</Status>
                  </li>
                ))}
              </ol>
            </Panel>
          ) : null}
          <Panel title="Activity">
            <ActivityList entries={activity} timezone={tz} compact />
          </Panel>
        </div>
      </div>
    </div>
  );
}
