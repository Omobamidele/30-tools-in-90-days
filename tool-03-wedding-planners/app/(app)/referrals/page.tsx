"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { HeartHandshake, Users } from "lucide-react";
import { PageHeader, Footer } from "@/components/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { DataTable } from "@/components/data-table";
import { ErrorBanner } from "@/components/states";
import { useRecordLink } from "@/components/record";
import { useStore } from "@/lib/store";
import { R, STATUS_TONE } from "@/lib/view";
import { coupleRef, draftDate, enquiryRef, fmtDate } from "@/lib/format";
import type { Enquiry, PastCouple } from "@/lib/types";

type S = { state: string; opensOn?: string; daysLate?: number; nudgeOn?: string };
const PILL: Record<string, (s: S) => [Tone, string]> = {
  "not-yet": (s) => ["neutral", `Ask opens ${draftDate(s.opensOn!, false)}`], "thank-you-due": (s) => ["danger", s.daysLate ? `Thank-you ${s.daysLate} d late` : "Thank-you due today"],
  waiting: (s) => ["info", `Asked · reminder ${draftDate(s.nudgeOn!, false)}`], "review-nudge-due": () => ["warning", "Review reminder due"], "asked-twice": () => ["neutral", "Asked twice, leave it"], done: () => ["success", "Review received"],
};

export default function Page() { return <React.Suspense><Referrals /></React.Suspense>; }
function Referrals() {
  const { data, now, rules, ready } = useStore(); const open = useRecordLink(); const params = useSearchParams();
  const fromRefs = data.enquiries.filter((e) => e.referredBy);
  const cols = React.useMemo<ColumnDef<PastCouple, unknown>[]>(() => [
    { id: "ref", header: "Ref", accessorFn: (p) => coupleRef(p.id), cell: (c) => <span className="whitespace-nowrap font-mono text-[12px] text-gray-500">{c.getValue() as string}</span>, enableSorting: false },
    { id: "couple", header: "Couple", accessorKey: "couple", cell: (c) => <span className="whitespace-nowrap font-medium text-gray-900">{c.getValue() as string}</span> },
    { id: "married", header: "Married", accessorKey: "weddingDate", cell: (c) => <span className="whitespace-nowrap tabular-nums text-gray-600">{fmtDate(c.getValue() as string)}</span> },
    { id: "venue", header: "Venue", accessorKey: "venue", cell: (c) => <span className="text-gray-600">{c.getValue() as string}</span>, meta: { className: "hidden xl:table-cell" } },
    { id: "review", header: "Review", accessorFn: (p) => p.review || "", cell: (c) => (c.getValue() as string) || <span className="text-gray-400">—</span> },
    { id: "sent", header: "Referred", accessorFn: (p) => fromRefs.filter((e) => e.referredBy === p.couple).length, cell: (c) => c.getValue() as number, meta: { align: "right" } },
    { id: "status", header: "Status", accessorFn: (p) => R.referralState(p, now, rules).state, cell: ({ row: { original: p } }) => { const s = R.referralState(p, now, rules); const [t, l] = PILL[s.state](s); return <Badge tone={t}>{l}</Badge>; } },
    { id: "act", header: () => <span className="sr-only">Action</span>, enableSorting: false, meta: { align: "right" }, cell: ({ row: { original: p } }) => { const s = R.referralState(p, now, rules);
      return s.state === "thank-you-due" || s.state === "review-nudge-due" ? <Button size="sm" data-action="write" data-id={p.id} onClick={() => open(p.id, s.state === "thank-you-due" ? "thank-you" : "review-nudge")}>Write message</Button> : null; } },
  ], [fromRefs, now, rules, open]);
  const refCols = React.useMemo<ColumnDef<Enquiry, unknown>[]>(() => [
    { id: "ref", header: "Ref", accessorFn: (e) => enquiryRef(e.id), cell: (c) => <span className="whitespace-nowrap font-mono text-[12px] text-gray-500">{c.getValue() as string}</span>, enableSorting: false },
    { id: "couple", header: "Couple", accessorKey: "couple", cell: (c) => <span className="whitespace-nowrap font-medium text-gray-900">{c.getValue() as string}</span> },
    { id: "by", header: "Referred by", accessorKey: "referredBy", cell: (c) => <span className="text-gray-600">{c.getValue() as string}</span> },
    { id: "received", header: "Received", accessorKey: "receivedAt", cell: (c) => <span className="tabular-nums text-gray-600">{fmtDate(c.getValue() as string)}</span> },
    { id: "status", header: "Status", accessorKey: "status", cell: (c) => <Badge tone={STATUS_TONE[c.getValue() as string]}>{c.getValue() as string}</Badge> },
  ], []);
  return (
    <>
      <PageHeader crumbs={[rules.company.name, "Referrals and reviews"]} title="Referrals and reviews" subtitle={`A thank-you with a review and referral ask ${rules.referral.askAfterDays} days after the wedding, then one reminder ${rules.referral.reviewNudgeAfterDays} days later.`} />
      <ErrorBanner />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Past couples" meta={ready ? String(data.past.length) : undefined} />
          <DataTable columns={cols} data={data.past} rowId={(p) => p.id} selectedId={params.get("open")} loading={!ready} initialSort={[{ id: "married", desc: false }]}
            onRowClick={(p) => { const s = R.referralState(p, now, rules); open(p.id, s.state === "review-nudge-due" ? "review-nudge" : "thank-you"); }}
            empty={<EmptyState icon={HeartHandshake} title="No past couples yet" hint="Couples move here after their wedding day." />} />
        </Card>
        <Card>
          <CardHeader title="Enquiries from referrals" meta={ready ? String(fromRefs.length) : undefined} />
          <DataTable columns={refCols} data={fromRefs} rowId={(e) => e.id} loading={!ready} onRowClick={(e) => open(e.id)} initialSort={[{ id: "received", desc: true }]}
            empty={<EmptyState icon={Users} title="No referred enquiries yet" hint="When a couple names who sent them, they show up here." />} />
        </Card>
      </div>
      <Footer />
    </>
  );
}
