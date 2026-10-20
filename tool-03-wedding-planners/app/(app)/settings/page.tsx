"use client";
import * as React from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { PageHeader, Footer } from "@/components/shell";
import { Card, CardHeader } from "@/components/ui/card";
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
                <Button variant="danger" onClick={() => { restore(); setOpen(false); toast.success("Starting data restored"); }}>Restore</Button></div>
            </DialogContent>
          </Dialog>
        } />
      <div className="space-y-6">
        <Card><CardHeader title="Rules" />
          <dl className="divide-y divide-gray-100">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[220px_1fr]"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900">{v}</dd></div>)}</dl>
        </Card>
        <Card><CardHeader title="Message templates" meta="Drafts only. You copy them into WhatsApp, Instagram or email." />
          <ul className="divide-y divide-gray-100">{Object.entries(TPL).map(([k, l]) => <li key={k} className="px-5 py-3"><p className="font-medium text-gray-900">{l}</p><p className="mt-0.5 text-gray-600">{r.templates[k]}</p></li>)}</ul>
        </Card>
      </div>
      <Footer />
    </>
  );
}
