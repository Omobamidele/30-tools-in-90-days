import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { clauseTypeLabels, getContract } from "@/services/contracts";
import { eventScope } from "@/services/events";
import { isNotFound } from "@/services/errors";
import { can } from "@/auth/policy";
import { termsSchemaByType } from "@/core/clauses/schemas";
import { fieldLabel, summarizeClause } from "@/ui/clause-summary";
import { PageHeader } from "@/ui/page";
import { ReviewWorkspace, type ReviewItem } from "./review-workspace";

export const metadata: Metadata = { title: "Review terms" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await appCtx();
  const data = await getContract(ctx, id).catch((e) => {
    if (isNotFound(e)) notFound();
    throw e;
  });
  const { contract, event, supplier } = data;
  if (!can(ctx.actor, "contract.edit", await eventScope(ctx.db, ctx.actor.orgId, event.id)) || !contract.documentFileId) {
    redirect(`/contracts/${id}`);
  }

  const items: ReviewItem[] = data.clauses
    .filter((c) => c.status === "PROPOSED")
    .map((c) => {
      const terms = c.data as Record<string, unknown>;
      const check = termsSchemaByType[c.type].safeParse(terms);
      const sources = Object.entries((c.sources ?? {}) as Record<string, { quote: string; page: number; verified: boolean }>).map(
        ([field, s]) => ({ field: fieldLabel(field), ...s }),
      );
      return {
        id: c.id,
        type: c.type,
        typeLabel: clauseTypeLabels[c.type],
        label: c.label,
        terms,
        summary: summarizeClause(c.type, terms, contract.currency),
        sources: sources.sort((a, b) => a.page - b.page),
        problems: check.success ? [] : check.error.issues.map((i) => `${i.path.length ? fieldLabel(i.path.join(".")) : "Term"}: ${i.message}`),
        lockVersion: c.lockVersion,
      };
    });

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title={`Review terms: ${supplier.name}`}
        crumbs={[
          { href: `/events/${event.id}`, label: event.name },
          { href: `/contracts/${id}`, label: `${supplier.name}: ${contract.title}` },
          { label: "Review" },
        ]}
        meta="Check each proposed value against the document. Nothing counts toward deadlines or exposure until you confirm it."
      />
      <ReviewWorkspace
        contractId={id}
        docId={contract.documentFileId!}
        items={items}
        confirmedCount={data.clauses.filter((c) => c.status === "CONFIRMED").length}
        currency={contract.currency}
      />
    </div>
  );
}
