import Link from "next/link";
import type { RuleType } from "@/config/schema";
import { Avatar, CompanyLogo, Handoff, RuleTag, Status, type Tone } from "./bits";
import { Evidence } from "./evidence";
import { cx } from "./cx";

// Story cards (docs/09 rev. 3). A signal reads as: who the customer is, what they did (one
// sentence), the evidence picture, and who it goes to. Value is a quiet line, never a headline.

type Terms = { seats: string; seatSingular: string; usageMetric: string; usageUnit: string };

export function StoryCard({
  href,
  account,
  type,
  headline,
  evidence,
  terms,
  due,
  worth,
  from,
  to,
  high,
  action = "Review",
}: {
  href: string;
  account: string;
  type: RuleType;
  headline: string;
  evidence: unknown;
  terms: Terms;
  due: { text: string; tone: Tone } | null;
  worth: string;
  from: string | null;
  to: string | null;
  high?: boolean;
  action?: string;
}) {
  return (
    <Link href={href} className="group block rounded-panel border border-rule bg-surface p-5 shadow-card transition-shadow hover:border-rule-strong hover:shadow-lift">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CompanyLogo name={account} size={28} />
        <span className="font-medium">{account}</span>
        <RuleTag type={type} />
        {high ? <Status tone="brand">High priority</Status> : null}
        {due ? <Status tone={due.tone} className="ml-auto">{due.text}</Status> : null}
      </div>
      <h3 className="mt-3 text-story font-semibold text-balance">{headline}</h3>
      <Evidence type={type} evidence={evidence} terms={terms} size="compact" className="mt-3" />
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-3">
        <Handoff from={from} to={to} />
        <span className="text-meta text-muted">{worth}</span>
        <span className="ml-auto text-table font-medium text-brand group-hover:underline">{action}</span>
      </div>
    </Link>
  );
}

/** A handoff seen from the seller's side: the CSM's note is the story. */
export function NoteCard({
  href,
  account,
  label,
  note,
  from,
  due,
  worth,
  status,
}: {
  href: string;
  account: string;
  label: string;
  note: string;
  from: string | null;
  due: { text: string; tone: Tone } | null;
  worth: string;
  status?: string;
}) {
  return (
    <Link href={href} className="group block rounded-panel border border-rule bg-surface p-5 shadow-card transition-shadow hover:border-rule-strong hover:shadow-lift">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <CompanyLogo name={account} size={28} />
        <span className="font-medium">{account}</span>
        <span className="text-meta text-faint">{label}</span>
        {due ? <Status tone={due.tone} className="ml-auto">{due.text}</Status> : status ? <Status tone="neutral" className="ml-auto">{status}</Status> : null}
      </div>
      <blockquote className="mt-3 flex gap-3">
        <Avatar name={from} size={28} className="mt-0.5 ring-0" />
        <span className="min-w-0">
          <span className="block text-meta text-muted">{from ?? "Customer success"} wrote</span>
          <span className={cx("mt-0.5 block text-story font-medium text-balance", "line-clamp-3")}>“{note}”</span>
        </span>
      </blockquote>
      <div className="mt-4 flex items-center gap-4 border-t border-rule pt-3">
        <span className="text-meta text-muted">{worth}</span>
        <span className="ml-auto text-table font-medium text-brand group-hover:underline">Open</span>
      </div>
    </Link>
  );
}
