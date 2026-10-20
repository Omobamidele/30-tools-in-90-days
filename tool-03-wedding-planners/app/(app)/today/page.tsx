"use client";
import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { PageHeader, Footer } from "@/components/shell";
import { Card, CardHeader, Skeleton } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty";
import { NewEnquiryButton } from "@/components/new-enquiry";
import { ErrorBanner } from "@/components/states";
import { useRecordLink } from "@/components/record";
import { useStore } from "@/lib/store";
import { R, dateFlag } from "@/lib/view";
import { fmtDate, fmtDay, fmtLongDate, initials } from "@/lib/format";

type Item = { kind: string; id: string; who: string; why: string; rank: number; minutes?: number };
const LABEL: Record<string, string> = { reply: "Reply", nudge: "Nudge", quiet: "Review", "thank-you": "Thank", "review-nudge": "Remind" };
const GROUPS: [string, string[]][] = [["Reply first", ["reply"]], ["Follow up on quotes", ["nudge", "quiet"]], ["Thank past couples", ["thank-you", "review-nudge"]]];

function Kpi({ label, value, sub, loading }: { label: string; value: string; sub: string; loading: boolean }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[12px] text-gray-500">{label}</p>
      {loading ? <Skeleton className="mt-2 h-7 w-20" /> : <p className="mt-1 text-[28px] font-semibold leading-[34px] tracking-[-0.01em] tabular-nums text-gray-900">{value}</p>}
      <p className="mt-1 text-[12px] text-gray-500">{loading ? <Skeleton className="h-3 w-32" /> : sub}</p>
    </Card>
  );
}

export default function TodayPage() { return <React.Suspense><Today /></React.Suspense>; }

function Today() {
  const { data, now, rules, ready } = useStore();
  const open = useRecordLink();
  const q: Item[] = R.actionQueue(data, now, rules);
  const s = R.monthSummary(data.enquiries, now, rules);
  const replies = q.filter((a) => a.kind === "reply").length;
  const quotes = data.enquiries.filter((e) => e.status === "Quote sent");
  const nudgesDue = quotes.filter((e) => { const f = R.followUpState(e, now, rules); return f?.next && ["late", "due-today"].includes(f.next.state); }).length;
  const t = now.slice(0, 10); const end = R.addDays(t, 14);
  const soon = data.weddings.filter((w) => w.date >= t && w.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const month = new Date(now.slice(0, 10) + "T12:00").toLocaleDateString(rules.company.locale, { month: "long" });

  return (
    <>
      <PageHeader crumbs={[rules.company.name, "Today"]} title="Today" subtitle={`${fmtLongDate(now)} · ${q.length ? `${q.length} couples waiting on you, most urgent first` : "Nothing is waiting on you"}`} actions={<NewEnquiryButton />} />
      <ErrorBanner />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi loading={!ready} label="Waiting for a first reply" value={String(replies)} sub={`Target: reply within ${R.fmtMinutes(rules.firstReply.targetMinutes)}`} />
          <Kpi loading={!ready} label={`Median first reply, ${month}`} value={R.fmtMinutes(s.medianReplyMinutes)} sub={`${s.slowOrNone} of ${s.total} enquiries over target or unanswered`} />
          <Kpi loading={!ready} label="Quotes out" value={String(quotes.length)} sub={`${nudgesDue} nudge${nudgesDue === 1 ? "" : "s"} due today or late`} />
          <Kpi loading={!ready} label={`Bookings from referrals, ${month}`} value={`${s.bookedFromReferrals} of ${s.booked}`} sub="Couples sent by past couples" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 [&>*]:min-w-0">
          <Card className="xl:col-span-2">
            <CardHeader title="Needs attention" meta={ready ? `${q.length} items` : undefined} />
            {!ready ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
              : q.length === 0 ? <EmptyState icon={CheckCircle2} title="All clear" hint="New enquiries, due nudges and thank-yous will show up here." />
              : (
                <Table data-testid="queue">
                  <THead><tr><TH>Couple</TH><TH>Why now</TH><TH className="hidden md:table-cell">Wedding</TH><TH className="text-right"><span className="sr-only">Action</span></TH></tr></THead>
                  <tbody>
                    {GROUPS.map(([title, kinds]) => {
                      const items = q.filter((a) => kinds.includes(a.kind));
                      if (!items.length) return null;
                      return (
                        <React.Fragment key={title}>
                          <tr className="border-t border-gray-100 bg-gray-50/60"><td colSpan={4} className="px-5 py-1.5 text-[12px] font-medium text-gray-500">{title} <span className="tabular-nums text-gray-400">{items.length}</span></td></tr>
                          {items.map((a) => {
                            const past = a.kind === "thank-you" || a.kind === "review-nudge";
                            const e = past ? null : data.enquiries.find((x) => x.id === a.id)!;
                            const p = past ? data.past.find((x) => x.id === a.id)! : null;
                            const urgent = a.rank === 0 || a.rank === 2 || (a.kind === "thank-you" && (a.minutes ?? 0) > 0);
                            const flag = e ? dateFlag(e, data, rules) : null;
                            return (
                              <TR key={a.kind + a.id} data-kind={a.kind} data-oid={a.id} className="cursor-pointer hover:bg-gray-50" onClick={(ev) => { if (!(ev.target as HTMLElement).closest("button")) open(a.id, past ? a.kind : undefined); }}>
                                <TD className="max-w-[260px]">
                                  <p className="truncate font-medium text-gray-900" data-testid="who">{a.who}</p>
                                  {flag ? <p className={flag.tone === "danger" ? "text-[12px] text-red-600" : "text-[12px] text-amber-700"}>{flag.text}</p>
                                    : <p className="truncate text-[12px] text-gray-500">{past ? p!.venue : `${rules.channels[e!.channel]}${e!.note ? ` · ${e!.note}` : ""}`}</p>}
                                </TD>
                                <TD><span className={`flex items-start gap-2 ${urgent ? "text-red-700" : "text-gray-700"}`}><span className={`mt-[7px] size-1.5 shrink-0 rounded-full ${urgent ? "bg-red-500" : "bg-amber-500"}`} aria-hidden />{a.why}</span></TD>
                                <TD className="hidden whitespace-nowrap text-gray-600 md:table-cell">{past ? `Married ${fmtDate(p!.weddingDate)}` : e!.weddingDate ? fmtDate(e!.weddingDate) : "—"}</TD>
                                <TD className="text-right"><Button size="sm" data-action="open" onClick={() => open(a.id, past ? a.kind : undefined)}>{LABEL[a.kind]}</Button></TD>
                              </TR>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            {ready ? <p className="border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500" data-testid="month">So far in {month}: {s.total} enquiries. Median first reply {R.fmtMinutes(s.medianReplyMinutes)}; {s.slowOrNone} waited over {R.fmtMinutes(rules.firstReply.targetMinutes)} or got no reply. {s.bookedFromReferrals} of {s.booked} bookings came from referrals.</p> : null}
          </Card>
          <Card>
            <CardHeader title="Weddings in the next 14 days" meta={ready ? String(soon.length) : undefined} />
            {!ready ? <div className="space-y-3 p-5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-2/3" /></div> : soon.length === 0
              ? <EmptyState icon={CheckCircle2} title="No weddings in the next two weeks" hint="Booked weddings appear here as the date gets close." />
              : (
                <ul className="divide-y divide-gray-100">
                  {soon.map((w) => (
                    <li key={w.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="w-12 shrink-0 rounded-md border border-gray-200 py-1 text-center leading-tight">
                        <p className="text-[11px] font-medium uppercase text-gray-500">{fmtDay(w.date).split(" ")[0].replace(",", "")}</p>
                        <p className="text-[15px] font-semibold tabular-nums text-gray-900">{w.date.slice(8, 10).replace(/^0/, "")}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-gray-900">{w.couple}</p>
                        <p className="truncate text-[12px] text-gray-500">{w.venue}</p>
                      </div>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600" title={w.planner}>{initials(w.planner)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
      </div>
      <Footer />
    </>
  );
}
