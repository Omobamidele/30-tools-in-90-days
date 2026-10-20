"use client";
import * as React from "react";
import { useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock3 } from "@/components/icons";
import { PageHeader, Footer } from "@/components/shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty";
import { DataTable } from "@/components/data-table";
import { ErrorBanner } from "@/components/states";
import { useRecordLink } from "@/components/record";
import { useStore } from "@/lib/store";
import { R } from "@/lib/view";
import { draftDate, enquiryRef, fmtDate, money, initials } from "@/lib/format";
import type { Enquiry } from "@/lib/types";

type Step = { day: number; state: string; sentOn?: string; due: string; daysLate?: number };
type Row = { e: Enquiry; f: { steps: Step[]; next: Step | null; goneQuiet: boolean } };

const stepBadge = (s: Step) => s.state === "sent" ? <Badge tone="success">Sent {draftDate(s.sentOn!, false)}</Badge> : s.state === "late" ? <Badge tone="danger">{s.daysLate} d late</Badge> : s.state === "due-today" ? <Badge tone="warning">Due today</Badge> : <span className="whitespace-nowrap tabular-nums text-muted">{draftDate(s.due, false)}</span>;

export default function Page() { return <React.Suspense><FollowUps /></React.Suspense>; }
function FollowUps() {
  const { data, now, rules, ready } = useStore(); const open = useRecordLink(); const params = useSearchParams();
  const rows: Row[] = React.useMemo(() => data.enquiries.filter((e) => e.status === "Quote sent").map((e) => ({ e, f: R.followUpState(e, now, rules) })), [data, now, rules]);
  const [d1, d2] = rules.followUp.nudgeDays as number[];
  const cols = React.useMemo<ColumnDef<Row, unknown>[]>(() => [
    { id: "ref", header: "Ref", accessorFn: (r) => enquiryRef(r.e.id), cell: (c) => <span className="whitespace-nowrap font-mono text-[13px] text-muted">{c.getValue() as string}</span>, enableSorting: false },
    { id: "couple", header: "Couple", accessorFn: (r) => r.e.couple, cell: (c) => <span className="whitespace-nowrap font-medium text-ink">{c.getValue() as string}</span> },
    { id: "quote", header: "Quote sent", accessorFn: (r) => r.e.quoteSentOn, cell: (c) => <span className="whitespace-nowrap tabular-nums text-fg">{fmtDate(c.getValue() as string)}</span> },
    { id: "wedding", header: "Wedding", accessorFn: (r) => r.e.weddingDate, cell: (c) => <span className="whitespace-nowrap tabular-nums">{fmtDate(c.getValue() as string)}</span> },
    { id: "budget", header: "Budget", accessorFn: (r) => r.e.budget ?? -1, cell: ({ row: { original: r } }) => money(r.e.budget), meta: { align: "right" } },
    { id: "d1", header: `Day ${d1}`, accessorFn: (r) => r.f.steps[0].due, cell: ({ row: { original: r } }) => stepBadge(r.f.steps[0]) },
    { id: "d2", header: `Day ${d2}`, accessorFn: (r) => r.f.steps[1].due, cell: ({ row: { original: r } }) => stepBadge(r.f.steps[1]) },
    { id: "owner", header: "Planner", accessorFn: (r) => r.e.owner || "", cell: ({ row: { original: r } }) => r.e.owner ? <span className="inline-flex items-center gap-1.5 text-fg"><span className="grid size-5 place-items-center rounded-pill bg-sunken text-[10px] font-semibold text-fg">{initials(r.e.owner)}</span>{r.e.owner.split(" ")[0]}</span> : "Not given" },
    { id: "act", header: () => <span className="sr-only">Action</span>, cell: ({ row: { original: r } }) => r.f.goneQuiet ? <Badge tone="danger">No answer</Badge> : r.f.next && ["late", "due-today"].includes(r.f.next.state) ? <Button size="sm" data-action="nudge" data-id={r.e.id} onClick={() => open(r.e.id)}>Nudge</Button> : null, enableSorting: false, meta: { align: "right" } },
  ], [d1, d2, open]);
  return (
    <>
      <PageHeader crumbs={[rules.company.name, "Quote follow-ups"]} title="Quote follow-ups" subtitle={`Nudges go out on day ${d1} and day ${d2} after the quote. A quote is flagged ${rules.followUp.goneQuietAfterDays} days after the last nudge with no answer.`} />
      <ErrorBanner />
      <Card>
        <CardHeader title="Quotes out" meta={ready ? `${rows.length} quotes` : undefined} />
        <DataTable columns={cols} data={rows} rowId={(r) => r.e.id} selectedId={params.get("open")} onRowClick={(r) => open(r.e.id)} loading={!ready} initialSort={[{ id: "d1", desc: false }]}
          empty={<EmptyState icon={Clock3} title="No quotes out" hint="Quotes you send show up here with their nudge dates." />} />
      </Card>
      <Footer />
    </>
  );
}
