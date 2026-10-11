import type { ReactNode } from "react";
import type { RuleType } from "@/config/schema";
import { formatMoney, formatMoneyShort } from "@/core/money";
import { Gauge, IdentificationBadge, LockKeyOpen, TreeStructure, UsersThree, type IconType } from "./icons";
import { cx } from "./cx";

// Shared display pieces (docs/09 rev. 3, "Customer stories"): company tiles, avatars, one colour
// per signal type, soft status pills, and money kept quiet.

/** Summary money: "$212k" on screen, the exact amount for hover and screen readers. */
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

export const RULE_META: Record<RuleType, { label: string; icon: IconType; short: string; plain: string }> = {
  SEAT_PRESSURE: { label: "Seat pressure", short: "Seats", plain: "Seats nearly full", icon: UsersThree },
  USAGE_PACE: { label: "Usage pace", short: "Usage", plain: "Usage ahead of plan", icon: Gauge },
  NEW_TEAM: { label: "New team", short: "New team", plain: "A new team joined", icon: TreeStructure },
  FEATURE_INTENT: { label: "Add-on interest", short: "Add-on", plain: "Wants an add-on", icon: LockKeyOpen },
  NEW_EXECUTIVE: { label: "New executive", short: "Executive", plain: "New senior contact", icon: IdentificationBadge },
};

/** Signal types share one neutral style (docs/09 rev. 4): colour is kept for status and the brand. */
const NEUTRAL_TONE = { text: "text-text", bg: "bg-sunken", fill: "bg-brand", ring: "ring-rule-strong" };
export const TYPE_TONE: Record<RuleType, { text: string; bg: string; fill: string; ring: string }> = {
  SEAT_PRESSURE: NEUTRAL_TONE,
  USAGE_PACE: NEUTRAL_TONE,
  NEW_TEAM: NEUTRAL_TONE,
  FEATURE_INTENT: NEUTRAL_TONE,
  NEW_EXECUTIVE: NEUTRAL_TONE,
};

/** The signal type as a coloured pill with its icon and plain name. */
export function RuleTag({ type, className }: { type: RuleType; className?: string }) {
  const m = RULE_META[type];
  const Icon = m.icon;
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rule px-2 py-0.5 text-meta text-muted", className)}>
      <Icon size={14} aria-hidden />
      {m.plain}
    </span>
  );
}

/** The signal type as an icon tile: the first thing the eye lands on in a story. */
export function TypeBadge({ type, size = 36, className }: { type: RuleType; size?: number; className?: string }) {
  const t = TYPE_TONE[type];
  const Icon = RULE_META[type].icon;
  return (
    <span aria-hidden className={cx("inline-flex shrink-0 items-center justify-center rounded-full", t.bg, t.text, className)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}

export type Tone = "risk" | "watch" | "won" | "neutral" | "live" | "brand";

const PILL: Record<Tone, string> = {
  risk: "bg-risk-bg text-risk",
  watch: "bg-watch-bg text-watch",
  won: "bg-won-bg text-won",
  neutral: "bg-neutral-bg text-neutral",
  live: "bg-brand-tint text-brand",
  brand: "bg-brand-tint text-brand",
};

/** Status as a soft pill with a word (colour never stands alone). */
export function Status({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-meta font-medium", PILL[tone], className)}>{children}</span>;
}

// Eight tile colours: dark ink on its own light tint, each ≥ 5:1 (contrast computed in docs/09).
const TILE = ["#1f5f86", "#6a3f99", "#8f4a14", "#2f6b2c", "#a12f52", "#3a4aa8", "#735a0c", "#0f655e"];
const tint = (c: string) => `color-mix(in srgb, ${c} 13%, white)`;
function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE[h % TILE.length];
}
const initialsOf = (name: string, n = 2) =>
  name
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, n)
    .join("")
    .toUpperCase();

/** A company's logo tile: a stable colour per company with its initials (no real logos in a demo). */
export function CompanyLogo({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center font-semibold", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), background: tint(hue(name)), color: hue(name), boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${hue(name)} 18%, transparent)`, fontSize: Math.round(size * 0.38), letterSpacing: "-0.01em" }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A person's avatar: initials on a stable colour. */
export function Avatar({ name, size = 24, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const n = name ?? "?";
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: name ? tint(hue(`p:${n}`)) : "#f0f0f1", color: name ? hue(`p:${n}`) : "#5f6368", boxShadow: `inset 0 0 0 1px ${name ? `color-mix(in srgb, ${hue(`p:${n}`)} 22%, transparent)` : "#e6e6e8"}` }}
    >
      {initialsOf(n)}
    </span>
  );
}

/** Who → who, as overlapping avatars with a label (CSM hands to seller). */
export function Handoff({ from, to }: { from: string | null; to: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-meta text-muted">
      <span className="flex shrink-0 -space-x-1">
        <Avatar name={from} size={20} />
        {to ? <Avatar name={to} size={20} /> : null}
      </span>
      <span>
        {from ?? "No CSM"}
        {to ? ` → ${to.split(" ")[0]}` : ""}
      </span>
    </span>
  );
}

export function SimulatedTag() {
  return (
    <span className="inline-flex items-center rounded-full border border-dashed border-field px-2 py-0.5 text-meta text-muted" title="Usage for this account comes from the demo simulator, not a live product feed.">
      Simulated usage
    </span>
  );
}
