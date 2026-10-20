"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Plus } from "@/components/icons";
import { Dialog, DialogContent, DialogTrigger, DialogClose } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field, Input, NativeSelect, Textarea } from "./ui/field";
import { useStore } from "@/lib/store";
import { R, CHECK_TONE } from "@/lib/view";
import { Notice } from "./ui/badge";

type Values = { couple: string; channel: string; receivedAt: string; contact: string; referredBy: string; weddingDate: string; venue: string; guests: string; budget: string; note: string };

export function NewEnquiryButton({ secondary }: { secondary?: boolean } = {}) {
  const { data, now, rules, add } = useStore();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [dup, setDup] = React.useState<{ id: string; couple: string; channel: string; receivedAt: string } | null>(null);
  const resolver: Resolver<Values> = React.useCallback(async (values) => {
    const errors = R.validateEnquiry(values, now, rules) as unknown as Record<string, string>;
    return Object.keys(errors).length
      ? { values: {}, errors: Object.fromEntries(Object.entries(errors).map(([k, m]) => [k, { type: "rule", message: m }])) }
      : { values, errors: {} };
  }, [now, rules]);
  const form = useForm<Values>({ resolver, defaultValues: { couple: "", channel: "ig", receivedAt: now, contact: "", referredBy: "", weddingDate: "", venue: "", guests: "", budget: "", note: "" } });
  const { register, handleSubmit, formState: { errors, isSubmitting }, watch, reset } = form;
  React.useEffect(() => { if (open) { reset({ ...form.getValues(), receivedAt: now }); setDup(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const wd = watch("weddingDate"), venue = watch("venue");
  const live = wd && /^\d{4}-\d\d-\d\d$/.test(wd) && R.daysBetween(now, wd) >= 0 ? R.dateCheck({ weddingDate: wd, venue }, data.weddings, data.enquiries, rules) : null;

  const save = handleSubmit((v) => {
    const d = R.findDuplicate(v, data.enquiries);
    if (d && !dup) { setDup(d); return; }
    const id = add(v as unknown as Record<string, string>);
    setOpen(false); reset(); setDup(null);
    toast("Enquiry added", { description: v.couple });
    router.push(`/enquiries?open=${id}`);
  });
  const err = (k: keyof Values) => errors[k]?.message as string | undefined;
  const aria = (k: keyof Values) => ({ id: `f-${k}`, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `f-${k}-error` : undefined });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={secondary ? "secondary" : "primary"} data-action="new-enquiry"><Plus weight="bold" />Add enquiry</Button></DialogTrigger>
      <DialogContent title="New enquiry" description="From a DM, WhatsApp, email or the website form. The date is checked as you type." className="max-w-lg">
        <form onSubmit={save} noValidate>
          <div className="grid grid-cols-1 gap-4 px-6 py-4 sm:grid-cols-2">
            <Field id="f-couple" label="Couple’s names" error={err("couple")} className="sm:col-span-2"><Input {...register("couple")} {...aria("couple")} autoFocus /></Field>
            <Field id="f-channel" label="Came in by" error={err("channel")}><NativeSelect {...register("channel")} {...aria("channel")}>{Object.entries(rules.channels).map(([k, l]) => <option key={k} value={k}>{l as string}</option>)}</NativeSelect></Field>
            <Field id="f-receivedAt" label="Received" error={err("receivedAt")}><Input type="datetime-local" {...register("receivedAt")} {...aria("receivedAt")} /></Field>
            <Field id="f-contact" label="Handle, phone or email"><Input {...register("contact")} id="f-contact" /></Field>
            <Field id="f-referredBy" label="Referred by"><Input {...register("referredBy")} id="f-referredBy" /></Field>
            <Field id="f-weddingDate" label="Wedding date" error={err("weddingDate")}><Input type="date" {...register("weddingDate")} {...aria("weddingDate")} /></Field>
            <Field id="f-venue" label="Venue"><Input {...register("venue")} id="f-venue" list="venues" /></Field>
            <Field id="f-guests" label="Guests" error={err("guests")}><Input type="number" inputMode="numeric" min={1} {...register("guests")} {...aria("guests")} /></Field>
            <Field id="f-budget" label={`Budget (${rules.company.currency})`} error={err("budget")}><Input type="number" min={0} step={50} {...register("budget")} {...aria("budget")} /></Field>
            <Field id="f-note" label="Note" className="sm:col-span-2"><Textarea rows={2} className="min-h-14" {...register("note")} id="f-note" /></Field>
            <datalist id="venues">{[...new Set(data.weddings.map((w) => w.venue))].map((x) => <option key={x} value={x} />)}</datalist>
          </div>
          {live ? (
            <Notice id="liveCheck" role="status" tone={CHECK_TONE[live.level]} className="mx-6 mb-4">
              Date check: {live.message}
            </Notice>
          ) : null}
          {dup ? (
            <Notice id="dupWarn" role="alert" tone="warning" className="mx-6 mb-4">
              Possible duplicate: {dup.couple} came in by {rules.channels[dup.channel]} on {dup.receivedAt.slice(0, 10)}. Select Add anyway to keep both.
            </Notice>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
            <DialogClose asChild><Button>Cancel</Button></DialogClose>
            <Button type="submit" variant="primary" disabled={isSubmitting}>{dup ? "Add anyway" : "Add enquiry"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
