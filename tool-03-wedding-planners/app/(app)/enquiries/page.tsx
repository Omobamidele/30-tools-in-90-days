"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { SearchX } from "lucide-react";
import { PageHeader, Footer } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty";
import { DataTable } from "@/components/data-table";
import { NewEnquiryButton } from "@/components/new-enquiry";
import { ErrorBanner } from "@/components/states";
import { useRecordLink } from "@/components/record";
import { useStore } from "@/lib/store";
import { R, STATUS_TONE, dateFlag, nextStep, replyInfo } from "@/lib/view";
import { enquiryRef, fmtDate, fmtWhen, money, initials } from "@/lib/format";
import type { Enquiry } from "@/lib/types";

type View = "open" | "reply" | "booked" | "closed" | "all";
export default function EnquiriesPage() { return <React.Suspense><Enquiries /></React.Suspense>; }

function Enquiries() {
  const { data, now, rules, ready } = useStore();
  const router = useRouter(); const path = usePathname(); const params = useSearchParams(); const open = useRecordLink();
  const view = (params.get("view") as View) || "open"; const channel = params.get("channel") || ""; const q = (params.get("q") || "").trim().toLowerCase();
  const setParam = (k: string, v: string) => { const sp = new URLSearchParams(params.toString()); if (v) sp.set(k, v); else sp.delete(k); sp.delete("open"); router.replace(`${path}?${sp}`, { scroll: false }); };
  const inView = React.useCallback((e: Enquiry, f: View) => {
    if (f === "open") return R.OPEN_STATUSES.includes(e.status);
    if (f === "reply") return ["overdue", "waiting"].includes(R.replyState(e, now, rules).state);
    if (f === "booked") return e.status === "Booked";
    if (f === "closed") return ["Lost", "Gone quiet"].includes(e.status);
    return true;
  }, [now, rules]);
  const rows = React.useMemo(() => data.enquiries.filter((e) => {
    if (channel && e.channel !== channel) return false;
    if (!inView(e, view)) return false;
    if (q && ![e.couple, e.venue, e.contact, e.note, e.referredBy].some((x) => (x || "").toLowerCase().includes(q))) return false;
    return true;
  }), [data.enquiries, channel, view, q, inView]);

  const columns = React.useMemo<ColumnDef<Enquiry, unknown>[]>(() => [
    { id: "ref", header: "Ref", accessorFn: (e) => enquiryRef(e.id), cell: (c) => <span className="whitespace-nowrap font-mono text-[12px] text-gray-500">{c.getValue() as string}</span>, enableSorting: false },
    { id: "couple", header: "Couple", accessorKey: "couple", cell: ({ row: { original: e } }) => { const f = dateFlag(e, data, rules); return (
      <div className="max-w-[260px]"><p className="truncate font-medium text-gray-900">{e.couple}</p>{f ? <p className={f.tone === "danger" ? "truncate text-[12px] text-red-600" : "truncate text-[12px] text-amber-700"} title={f.text}>{f.text}</p> : <p className="truncate text-[12px] text-gray-500"><span className="2xl:hidden">{rules.channels[e.channel]}{e.contact ? " · " : ""}</span>{e.contact}</p>}</div>); } },
    { id: "channel", header: "Channel", accessorFn: (e) => rules.channels[e.channel], cell: (c) => <span className="whitespace-nowrap text-gray-600">{c.getValue() as string}</span>, meta: { className: "hidden 2xl:table-cell" } },
    { id: "received", header: "Received", accessorKey: "receivedAt", cell: (c) => <span className="whitespace-nowrap tabular-nums text-gray-600">{fmtWhen(c.getValue() as string)}</span> },
    { id: "wedding", header: "Wedding", accessorFn: (e) => e.weddingDate || "9999", cell: ({ row: { original: e } }) => <span className="whitespace-nowrap tabular-nums">{e.weddingDate ? fmtDate(e.weddingDate) : <span className="text-gray-400">—</span>}</span> },
    { id: "guests", header: "Guests", accessorFn: (e) => e.guests ?? -1, cell: ({ row: { original: e } }) => e.guests ?? <span className="text-gray-400">—</span>, meta: { align: "right", className: "hidden 2xl:table-cell" } },
    { id: "budget", header: "Budget", accessorFn: (e) => e.budget ?? -1, cell: ({ row: { original: e } }) => (e.budget ? money(e.budget) : <span className="text-gray-400">—</span>), meta: { align: "right" } },
    { id: "reply", header: "First reply", accessorFn: (e) => replyInfo(e, now, rules).minutes ?? 99999, cell: ({ row: { original: e } }) => { const r = replyInfo(e, now, rules); return <Badge tone={r.tone}>{r.label}</Badge>; } },
    { id: "status", header: "Status", accessorKey: "status", cell: (c) => <Badge tone={STATUS_TONE[c.getValue() as string]}>{c.getValue() as string}</Badge> },
    { id: "owner", header: "Planner", accessorFn: (e) => e.owner || "", cell: ({ row: { original: e } }) => e.owner ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700"><span className="grid size-5 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{initials(e.owner)}</span>{e.owner.split(" ")[0]}</span> : <span className="text-gray-400">Unassigned</span>, meta: { className: "hidden xl:table-cell" } },
    { id: "next", header: "Next step", accessorFn: (e) => nextStep(e, now, rules), cell: (c) => <span className="whitespace-nowrap text-gray-600">{c.getValue() as string}</span>, enableSorting: false, meta: { className: "hidden 2xl:table-cell" } },
  ], [data, now, rules]);

  const count = (f: View) => data.enquiries.filter((e) => inView(e, f)).length;
  const clear = () => router.replace(path, { scroll: false });
  return (
    <>
      <PageHeader crumbs={[rules.company.name, "Enquiries"]} title="Enquiries" subtitle="Every enquiry from Instagram, WhatsApp, email, the website and referrals, newest first." actions={<NewEnquiryButton />} />
      <ErrorBanner />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
          <Segmented<View> label="View" value={view} onChange={(v) => setParam("view", v === "open" ? "" : v)} items={[
            { value: "open", label: "Open", count: count("open") }, { value: "reply", label: "Needs a reply", count: count("reply") }, { value: "booked", label: "Booked", count: count("booked") },
            { value: "closed", label: "Lost or quiet", count: count("closed") }, { value: "all", label: "All", count: count("all") }]} />
          <label className="sr-only" htmlFor="channel">Channel</label>
          <NativeSelect id="channel" value={channel} onChange={(e) => setParam("channel", e.target.value)} className="w-auto">
            <option value="">All channels</option>{Object.entries(rules.channels).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}
          </NativeSelect>
          {q ? <span className="text-[12px] text-gray-500">Matching “{params.get("q")}”</span> : null}
          <span className="ml-auto text-[12px] tabular-nums text-gray-500" data-testid="count">{ready ? `${rows.length} ${rows.length === 1 ? "enquiry" : "enquiries"}` : ""}</span>
        </div>
        <DataTable columns={columns} data={rows} rowId={(e) => e.id} selectedId={params.get("open")} onRowClick={(e) => open(e.id)} loading={!ready} initialSort={[{ id: "received", desc: true }]}
          empty={<EmptyState icon={SearchX} title="No enquiries match" hint={q ? `Nothing for “${params.get("q")}” in this view.` : "Nothing in this view yet."} action={<Button onClick={clear}>Clear filters</Button>} />} />
      </Card>
      <Footer />
    </>
  );
}
