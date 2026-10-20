"use client";
import * as React from "react";
import { CheckCircle2 } from "@/components/icons";
import { PageHeader, Footer } from "@/components/shell";
import { Panel, SectionHead, Skeleton } from "@/components/ui/card";
import { Urgent } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty";
import { NewEnquiryButton } from "@/components/new-enquiry";
import { ErrorBanner } from "@/components/states";
import { useRecordLink } from "@/components/record";
import { useStore } from "@/lib/store";
import { R, dateFlag } from "@/lib/view";
import { fmtDate, fmtDay, fmtLongDate } from "@/lib/format";

type Item = { kind: string; id: string; who: string; why: string; rank: number; minutes?: number };
const LABEL: Record<string, string> = { reply: "Reply", nudge: "Nudge", quiet: "Review", "thank-you": "Thank", "review-nudge": "Remind" };
const GROUPS: [string, string[]][] = [["Reply first", ["reply"]], ["Follow up on quotes", ["nudge", "quiet"]], ["Thank past couples", ["thank-you", "review-nudge"]]];

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
      <PageHeader title="Today" actions={<NewEnquiryButton />}
        subtitle={<>{fmtLongDate(now)}. {!ready ? "Loading the list." : q.length ? `${q.length} couples are waiting on you, most urgent first.` : "Nothing is waiting on you."}</>} />
      <ErrorBanner />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <Panel>
            <SectionHead title="Needs attention" meta={ready ? q.length : ""} />
            {!ready ? <Table><tbody>{Array.from({ length: 7 }).map((_, i) => <TR key={i}><TD><Skeleton className="h-4 w-48" /></TD><TD><Skeleton className="h-4 w-56" /></TD><TD className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TD><TD><Skeleton className="ml-auto h-8 w-16" /></TD></TR>)}</tbody></Table>
              : q.length === 0 ? <EmptyState icon={CheckCircle2} title="Nothing needs you right now" hint="New enquiries, due quote nudges and thank-you messages appear here as they come up." action={<NewEnquiryButton secondary />} />
              : (
                <Table data-testid="queue">
                  <THead><tr><TH>Couple</TH><TH>Why now</TH><TH className="hidden md:table-cell">Wedding</TH><TH className="text-right"><span className="sr-only">Action</span></TH></tr></THead>
                  <tbody>
                    {GROUPS.map(([title, kinds]) => {
                      const items = q.filter((a) => kinds.includes(a.kind));
                      if (!items.length) return null;
                      return (
                        <React.Fragment key={title}>
                          <tr className="border-t border-line bg-canvas"><td colSpan={4} className="h-9 px-5 text-[13px] font-semibold text-ink">{title} <span className="ml-1 font-normal text-muted">{items.length}</span></td></tr>
                          {items.map((a) => {
                            const past = a.kind === "thank-you" || a.kind === "review-nudge";
                            const e = past ? null : data.enquiries.find((x) => x.id === a.id)!;
                            const p = past ? data.past.find((x) => x.id === a.id)! : null;
                            const urgent = a.rank === 0 || a.rank === 2 || (a.kind === "thank-you" && (a.minutes ?? 0) > 0);
                            const flag = e ? dateFlag(e, data, rules) : null;
                            return (
                              <TR key={a.kind + a.id} data-kind={a.kind} data-oid={a.id} className="cursor-pointer hover:bg-canvas" onClick={(ev) => { if (!(ev.target as HTMLElement).closest("button")) open(a.id, past ? a.kind : undefined); }}>
                                <TD className="max-w-[280px] py-2.5">
                                  <p className="truncate font-semibold text-ink" data-testid="who">{a.who}</p>
                                  {flag ? <Urgent tone={flag.tone} className="block truncate text-[13px]">{flag.text}</Urgent>
                                    : <p className="truncate text-[13px] text-muted">{past ? p!.venue : e!.note ? `${rules.channels[e!.channel]}: ${e!.note}` : rules.channels[e!.channel]}</p>}
                                </TD>
                                <TD className="py-2.5"><Urgent tone={urgent ? "danger" : "neutral"} className={urgent ? "" : "!text-fg"}>{a.why}</Urgent></TD>
                                <TD className="hidden whitespace-nowrap text-fg md:table-cell">{past ? `Married ${fmtDate(p!.weddingDate)}` : e!.weddingDate ? fmtDate(e!.weddingDate) : <span className="text-muted">No date yet</span>}</TD>
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
          </Panel>
          <p className="mt-4 min-h-6 text-[14px] leading-6 text-muted" data-testid="month">{ready ? <>So far in {month}: {s.total} enquiries, median first reply {R.fmtMinutes(s.medianReplyMinutes)}. {s.slowOrNone} waited over {R.fmtMinutes(rules.firstReply.targetMinutes)} or got no reply. {s.bookedFromReferrals} of {s.booked} bookings came from referrals. {quotes.length} quotes are out and {nudgesDue} nudge{nudgesDue === 1 ? " is" : "s are"} due.</> : null}</p>
        </div>
        <aside aria-labelledby="soon-h" className="min-w-0">
          <h2 id="soon-h" className="flex h-12 items-center text-[16px] font-semibold text-ink">Next 14 days <span className="ml-2 font-normal text-muted">{ready ? soon.length : ""}</span></h2>
          {!ready ? <div className="space-y-4 pt-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : soon.length === 0
            ? <p className="text-[14px] text-muted">No weddings in the next two weeks.</p>
            : (
              <ul className="divide-y divide-line border-t border-line">
                {soon.map((w) => (
                  <li key={w.id} className="py-3">
                    <p className="text-[13px] font-semibold text-ink">{fmtDay(w.date)}</p>
                    <p className="mt-0.5 truncate text-[14px] text-fg">{w.couple}</p>
                    <p className="truncate text-[13px] text-muted">{w.venue}, {w.planner.split(" ")[0]}</p>
                  </li>
                ))}
              </ul>
            )}
        </aside>
      </div>
      <Footer />
    </>
  );
}
