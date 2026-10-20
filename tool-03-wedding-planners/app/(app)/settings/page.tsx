"use client";
import * as React from "react";
import { toast } from "sonner";
import { RotateCcw } from "@/components/icons";
import { PageHeader, Footer } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { R } from "@/lib/view";

const TPL: Record<string, string> = { firstReply: "First reply", nudge3: "Day 3 nudge", nudge7: "Day 7 nudge", thankYou: "Thank-you and referral ask", reviewNudge: "Review reminder" };
export default function Settings() {
  const { rules: r, restore } = useStore();
  const [open, setOpen] = React.useState(false);
  const rows: [string, string][] = [
    ["Company", `${r.company.name} (messages signed “${r.company.senderName}”)`],
    ["Team", r.team.map((t: { name: string; role: string }) => `${t.name}, ${t.role}`).join("; ")],
    ["Weddings per date", `Up to ${r.capacity.maxWeddingsPerDate}. Same venue on the same date: ${r.capacity.sameVenueSameDate === "block" ? "blocked" : "allowed"}. Open quotes on the same date: ${r.capacity.holdWarningForOpenQuotes ? "shown as a warning" : "ignored"}.`],
    ["First reply", `Within ${R.fmtMinutes(r.firstReply.targetMinutes)} of the enquiry arriving, evenings and weekends included.`],
    ["Quote nudges", `Day ${r.followUp.nudgeDays.join(" and day ")} after the quote; flagged as gone quiet ${r.followUp.goneQuietAfterDays} days after the last nudge.`],
    ["Thank-you and referral ask", `${r.referral.askAfterDays} days after the wedding; one review reminder ${r.referral.reviewNudgeAfterDays} days later.`],
    ["Channels", Object.values(r.channels).join(", ")],
  ];
  return (
    <>
      <PageHeader crumbs={[r.company.name, "Settings"]} title="House rules" subtitle="Set in config/rules.json. Change them there to fit another planning company."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><RotateCcw />Restore starting data</Button></DialogTrigger>
            <DialogContent title="Restore starting data?" description="Changes made in this browser will be lost. This can’t be undone.">
              <div className="flex justify-end gap-2 px-5 py-4"><DialogClose asChild><Button>Cancel</Button></DialogClose>
                <Button variant="danger" onClick={() => { restore(); setOpen(false); toast("Starting data restored"); }}>Restore starting data</Button></div>
            </DialogContent>
          </Dialog>
        } />
      <div className="max-w-4xl space-y-10">
        <section aria-labelledby="h-data">
          <h2 id="h-data" className="text-[16px] font-semibold text-ink">About this data</h2>
          <p className="mt-2 text-[15px] leading-6 text-fg" data-testid="demo-note">Everything here is sample data for {r.company.name}, a made-up planning company. Every number on screen is worked out from these records; nothing is typed in by hand. Changes you make are saved in this browser only.</p>
        </section>
        <section aria-labelledby="h-rules">
          <h2 id="h-rules" className="text-[16px] font-semibold text-ink">Rules</h2>
          <dl className="mt-3 divide-y divide-line border-y border-line">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[220px_1fr]"><dt className="text-muted">{k}</dt><dd className="text-ink">{v}</dd></div>)}</dl>
        </section>
        <section aria-labelledby="h-tpl">
          <h2 id="h-tpl" className="text-[16px] font-semibold text-ink">Message templates</h2>
          <p className="mt-1 text-[14px] text-muted">Drafts only. You copy them into WhatsApp, Instagram or email.</p>
          <ul className="mt-3 divide-y divide-line border-y border-line">{Object.entries(TPL).map(([k, l]) => <li key={k} className="py-3"><p className="font-semibold text-ink">{l}</p><p className="mt-0.5 text-fg">{r.templates[k]}</p></li>)}</ul>
        </section>
      </div>
      <Footer />
    </>
  );
}
