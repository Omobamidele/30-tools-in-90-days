import type { ReactNode } from "react";
import type { RuleType } from "@/config/schema";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { Gauge, IdentificationBadge, LockKeyOpen, TreeStructure, UsersThree, type IconType } from "./icons";
import { cx } from "./cx";

// Small shared display pieces: money, rule tags, status dots, avatars.

/** Summary money: "$212k" on screen, the exact amount for hover and screen readers (docs/09). */
export function MoneyShort({ minor, currency, className, empty = "Not estimated" }: { minor: number | null | undefined; currency: string; className?: string; empty?: string }) {
  if (minor === null || minor === undefined) return <span className={cx("text-faint", className)}>{empty}</span>;
  const exact = formatMoney(minor, currency);
  return (
    <span className={cx("num", className)} title={exact}>
      <span aria-hidden>{formatMoneyShort(minor, currency)}</span>
      <span className="sr-only">{exact}</span>
    </span>
  );
}

export function Money({ minor, currency, className }: { minor: number | null | undefined; currency: string; className?: string }) {
  if (minor === null || minor === undefined) return <span className={cx("text-faint", className)}>Not estimated</span>;
  return <span className={cx("num", className)}>{formatMoney(minor, currency)}</span>;
}

export const RULE_META: Record<RuleType, { label: string; icon: IconType; short: string }> = {
  SEAT_PRESSURE: { label: "Seat pressure", short: "Seats", icon: UsersThree },
  USAGE_PACE: { label: "Usage pace", short: "Usage", icon: Gauge },
  NEW_TEAM: { label: "New team", short: "New team", icon: TreeStructure },
  FEATURE_INTENT: { label: "Add-on interest", short: "Add-on", icon: LockKeyOpen },
  NEW_EXECUTIVE: { label: "New executive", short: "Executive", icon: IdentificationBadge },
};

/** The signal type as a quiet label with its icon (not a ticker-style code). */
export function RuleTag({ type, className }: { type: RuleType; className?: string }) {
  const m = RULE_META[type];
  const Icon = m.icon;
  return (
    <span className={cx("inline-flex items-center gap-1 text-meta font-medium text-muted", className)}>
      <Icon size={14} aria-hidden />
      {m.label}
    </span>
  );
}

export type Tone = "risk" | "watch" | "won" | "neutral" | "live" | "brand";

const DOT: Record<Tone, string> = {
  risk: "bg-risk",
  watch: "bg-watch",
  won: "bg-won",
  neutral: "bg-faint",
  live: "bg-signal ring-1 ring-signal-ink",
  brand: "bg-brand",
};
const TEXT: Record<Tone, string> = { risk: "text-risk", watch: "text-watch", won: "text-won", neutral: "text-muted", live: "text-signal-ink", brand: "text-brand" };

/** A dot plus a word: status colour never stands alone (docs/09). */
export function Status({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-table font-medium", TEXT[tone], className)}>
      <span aria-hidden className={cx("size-2 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

export function Avatar({ name, size = 24, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const initials = (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-ink-2 font-medium text-on-ink", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials}
    </span>
  );
}

export function SimulatedTag() {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-dashed border-field px-1.5 py-0.5 text-meta text-muted" title="Usage for this account comes from the demo simulator, not a live product feed.">
      Simulated usage
    </span>
  );
}
