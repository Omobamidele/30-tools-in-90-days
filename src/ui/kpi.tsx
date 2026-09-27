import type { ReactNode } from "react";
import type { IconType } from "@/ui/icons";
import { ArrowDownRight, ArrowUpRight, Minus } from "@/ui/icons";
import { cx } from "./cx";
import { formatMoney } from "@/core/money";

type Accent = "brand" | "risk" | "watch" | "settled" | "agency";

/**
 * Headline figure tile: label, figure, optional real comparison and footer content.
 * Deliberately undecorated: the number is the design. `icon` and `accent` are accepted for API
 * compatibility; only `accent="risk"` has an effect (the figure turns red when it's bad news).
 */
export function Kpi({
  label,
  term,
  value,
  accent,
  delta,
  caption,
  children,
  className,
}: {
  label: string;
  /** The industry term, shown small under the plain label (docs/09 § Money). */
  term?: string;
  value: ReactNode;
  icon?: IconType;
  accent?: Accent;
  /** A real comparison, e.g. vs the snapshot 7 days ago. `upIsBad` colours a rise red. */
  delta?: { text: string; direction: "up" | "down" | "flat"; upIsBad?: boolean };
  caption?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const bad = delta && ((delta.direction === "up" && delta.upIsBad) || (delta.direction === "down" && !delta.upIsBad));
  const good = delta && delta.direction !== "flat" && !bad;
  const DeltaIcon = delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  return (
    <section className={cx("panel flex flex-col p-5", className)}>
      <h2 className="text-table font-medium text-ink">
        {label}
        {term ? <span className="block text-meta font-normal text-faint">{term}</span> : null}
      </h2>
      <p className={cx("num mt-2 font-display text-figure font-medium", accent === "risk" ? "text-risk" : "text-ink")}>{value}</p>
      {delta ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-meta text-faint">
          <span
            className={cx(
              "inline-flex items-center gap-0.5 rounded-[4px] px-1 py-px font-medium",
              bad ? "bg-risk-bg text-risk" : good ? "bg-settled-bg text-settled" : "bg-sunken text-muted",
            )}
          >
            <DeltaIcon size={12} aria-hidden />
            {delta.text.split(" vs ")[0]}
          </span>
          {delta.text.includes(" vs ") ? <span>vs {delta.text.split(" vs ")[1]}</span> : null}
        </p>
      ) : null}
      {caption ? <p className="mt-1.5 text-meta text-faint">{caption}</p> : null}
      {children ? <div className="mt-auto pt-4">{children}</div> : null}
    </section>
  );
}

/** Headline money: small currency code, figure, never wraps mid-number. */
export function BigMoney({ minor, currency }: { minor: number; currency: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="mr-1.5 font-sans text-body font-medium tracking-normal text-faint">{currency}</span>
      {formatMoney(minor, currency, { withCode: false })}
    </span>
  );
}
