"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { X, Copy, Check } from "lucide-react";
import { Sheet, SheetClose } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Textarea } from "./ui/field";
import { useStore } from "@/lib/store";
import { R, STATUS_TONE, CHECK_TONE, check, replyInfo } from "@/lib/view";
import { coupleRef, draftDate, enquiryRef, fmtDate, fmtWhen, money, initials } from "@/lib/format";
import type { Enquiry, PastCouple } from "@/lib/types";
import { cn } from "./ui/cn";

/** Open a record in the side sheet. The record lives in the URL (?open=e01), so links and the back button work. */
export function useRecordLink() {
  const router = useRouter(); const path = usePathname(); const params = useSearchParams();
  return React.useCallback((id: string | null, kind?: string) => {
    const sp = new URLSearchParams(params.toString());
    if (id) { sp.set("open", id); if (kind) sp.set("kind", kind); else sp.delete("kind"); } else { sp.delete("open"); sp.delete("kind"); }
    const qs = sp.toString();
    router.push(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [router, path, params]);
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<><dt className="text-gray-500">{k}</dt><dd className="min-w-0 text-gray-900">{children}</dd></>);
const Section = ({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) => (
  <section className="border-t border-gray-100 px-5 py-4" data-testid={testid}><h3 className="mb-2.5 text-[12px] font-medium text-gray-500">{title}</h3>{children}</section>
);

function Draft({ text }: { text: string }) {
  const [v, setV] = React.useState(text); const [copied, setCopied] = React.useState(false);
  React.useEffect(() => setV(text), [text]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1500); toast.success("Copied. Paste it into the chat"); }
    catch { toast("Select the text and copy it"); }
  };
  return (
    <div>
      <label htmlFor="draft" className="sr-only">Draft message</label>
      <Textarea id="draft" value={v} onChange={(e) => setV(e.target.value)} rows={5} />
      <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" onClick={copy}>{copied ? <Check /> : <Copy />}Copy message</Button></div>
    </div>
  );
}

function EnquiryBody({ e, close }: { e: Enquiry; close: () => void }) {
  const { data, now, rules, act } = useStore();
  const c = check(e, data, rules); const r = R.replyState(e, now, rules); const f = R.followUpState(e, now, rules); const ri = replyInfo(e, now, rules);
  const blocked = ["full", "venue-clash"].includes(c.level);
  let draftKind: string | null = null; let primary: React.ReactNode = null;
  const run = (a: string) => toast.success(act(e.id, a));
  if (r.state === "overdue" || r.state === "waiting") { draftKind = "reply"; primary = <Button variant="primary" data-action="reply" onClick={() => run("reply")}>Mark reply as sent</Button>; }
  else if (f?.next && f.next.state !== "waiting" && !f.goneQuiet) { draftKind = "nudge"; primary = <Button variant="primary" data-action="nudge" disabled={f.next.state === "upcoming"} title={f.next.state === "upcoming" ? "Not due yet" : undefined} onClick={() => run("nudge")}>Mark day {f.next.day} nudge as sent</Button>; }
  const secondary: React.ReactNode[] = [];
  if (["New", "Replied"].includes(e.status)) secondary.push(<Button key="q" data-action="quote" disabled={blocked} title={blocked ? "Date is not available" : undefined} onClick={() => run("quote")}>Quote sent</Button>);
  if (R.OPEN_STATUSES.includes(e.status) || e.status === "Gone quiet") secondary.push(<Button key="b" data-action="booked" disabled={blocked || !e.weddingDate} onClick={() => run("booked")}>Booked</Button>);
  if (f?.goneQuiet) secondary.push(<Button key="g" data-action="quiet" onClick={() => run("quiet")}>Mark gone quiet</Button>);
  if (R.OPEN_STATUSES.includes(e.status)) secondary.push(<Button key="l" variant="ghost" data-action="lost" onClick={() => run("lost")}>Lost</Button>);
  return (
    <>
      <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-gray-500">{enquiryRef(e.id)}</p>
          <h2 className="mt-0.5 truncate text-[16px] font-semibold leading-6 tracking-[-0.01em] text-gray-900" data-testid="sheet-title">{e.couple}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[e.status]}>{e.status}</Badge><Badge tone={ri.tone}>{ri.minutes != null && !ri.label.startsWith("Waiting") ? `Replied in ${ri.label}` : ri.label}</Badge></div>
        </div>
        <SheetClose className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40" aria-label="Close"><X className="size-4" /></SheetClose>
      </div>
      <div className="flex-1 overflow-y-auto">
        <section className="px-5 py-4">
          <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13px]">
            <Row k="Wedding date">{e.weddingDate ? fmtDate(e.weddingDate) : "—"}</Row>
            <Row k="Venue">{e.venue || "—"}</Row>
            <Row k="Guests"><span className="tabular-nums">{e.guests ?? "—"}</span></Row>
            <Row k="Budget"><span className="tabular-nums">{money(e.budget)}</span></Row>
            <Row k="Came in by">{rules.channels[e.channel]}{e.contact ? <span className="text-gray-500"> · {e.contact}</span> : null}</Row>
            <Row k="Received">{fmtWhen(e.receivedAt)}</Row>
            <Row k="Planner">{e.owner ? <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">{initials(e.owner)}</span>{e.owner}</span> : <span className="text-gray-500">Unassigned</span>}</Row>
            {e.referredBy ? <Row k="Referred by">{e.referredBy}</Row> : null}
            {e.note ? <Row k="Note">{e.note}</Row> : null}
          </dl>
        </section>
        <Section title="Date check" testid="date-check">
          <div className={cn("rounded-md px-3 py-2 text-[13px] ring-1 ring-inset", { danger: "bg-red-50 text-red-800 ring-red-600/20", warning: "bg-amber-50 text-amber-800 ring-amber-600/20", success: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", neutral: "bg-gray-50 text-gray-700 ring-gray-500/20" }[CHECK_TONE[c.level] as "danger"] )}>
            {c.message}
            {c.booked.length ? <ul className="mt-1 text-[12px] opacity-80">{c.booked.map((w: { id: string; couple: string; venue: string; planner: string }) => <li key={w.id}>{w.couple} at {w.venue} ({w.planner})</li>)}</ul> : null}
          </div>
        </Section>
        {f ? (
          <Section title="Quote follow-up" testid="steps">
            <ol className="flex flex-wrap gap-2">{f.steps.map((s: { day: number; state: string; sentOn?: string; due: string; daysLate?: number }) => (
              <li key={s.day}><Badge tone={s.state === "sent" ? "success" : s.state === "late" ? "danger" : s.state === "due-today" ? "warning" : "neutral"}>
                {s.state === "sent" ? `Day ${s.day} sent ${draftDate(s.sentOn!, false)}` : s.state === "late" ? `Day ${s.day} · ${s.daysLate} d late` : s.state === "due-today" ? `Day ${s.day} due today` : `Day ${s.day} · ${draftDate(s.due, false)}`}
              </Badge></li>))}</ol>
          </Section>
        ) : null}
        {draftKind ? <Section title="Draft message"><Draft text={R.draftFor(draftKind, e, c, rules, draftDate)} /></Section> : null}
        <Section title="Activity" testid="history">
          <ol className="relative space-y-3 border-l border-gray-200 pl-4">
            {[...e.history].reverse().map((h, i) => (
              <li key={i} className="relative text-[13px]"><span className={cn("absolute -left-[21px] top-1.5 size-2 rounded-full ring-2 ring-white", i === 0 ? "bg-brand-600" : "bg-gray-300")} />
                <span className="text-gray-900">{h.what}</span><span className="ml-2 text-[12px] tabular-nums text-gray-500">{fmtWhen(h.at)}</span></li>
            ))}
          </ol>
        </Section>
      </div>
      {primary || secondary.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white px-5 py-3">{secondary}<span className="flex-1" />{primary}</div>
      ) : null}
    </>
  );
}

function PastBody({ p, kind, close }: { p: PastCouple; kind: string; close: () => void }) {
  const { now, rules, pastAct } = useStore();
  const s = R.referralState(p, now, rules);
  const can = (kind === "thank-you" && s.state === "thank-you-due") || (kind === "review-nudge" && s.state === "review-nudge-due");
  return (
    <>
      <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[12px] text-gray-500">{coupleRef(p.id)}</p>
          <h2 className="mt-0.5 truncate text-[16px] font-semibold leading-6 tracking-[-0.01em]" data-testid="sheet-title">{p.couple}</h2>
          <p className="mt-1 text-[13px] text-gray-500">Married {fmtDate(p.weddingDate)} at {p.venue}</p>
        </div>
        <SheetClose className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close"><X className="size-4" /></SheetClose>
      </div>
      <div className="flex-1 overflow-y-auto">
        <section className="px-5 py-4"><dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-[13px]">
          <Row k="Thank-you sent">{p.thankYouSentOn ? fmtDate(p.thankYouSentOn) : "—"}</Row>
          <Row k="Review">{p.review || "—"}</Row>
          <Row k="Referrals sent"><span className="tabular-nums">{p.referralsSent}</span></Row>
        </dl></section>
        <Section title={kind === "thank-you" ? "Thank-you and referral ask" : "Review reminder"}><Draft text={R.draftFor(kind, p, null, rules, draftDate)} /></Section>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
        <Button variant="primary" data-action="sent" disabled={!can} onClick={() => { pastAct(p.id, kind); toast.success("Logged as sent"); close(); }}>Mark as sent</Button>
      </div>
    </>
  );
}

export function RecordSheet() {
  const params = useSearchParams(); const link = useRecordLink(); const { data } = useStore();
  const id = params.get("open"); const kind = params.get("kind") || "";
  const e = id ? data.enquiries.find((x) => x.id === id) : undefined;
  const p = id && !e ? data.past.find((x) => x.id === id) : undefined;
  const open = !!(e || p);
  const close = () => link(null);
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }} label={e?.couple || p?.couple || "Record"}>
      {e ? <EnquiryBody e={e} close={close} /> : p ? <PastBody p={p} kind={kind || "thank-you"} close={close} /> : null}
    </Sheet>
  );
}
