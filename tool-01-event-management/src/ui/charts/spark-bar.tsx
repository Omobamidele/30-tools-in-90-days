import { cx } from "../cx";

/**
 * Inline bar for a table cell, scaled to the largest value in the column. Decorative:
 * the exact figure is always printed beside it, so it's hidden from assistive tech.
 */
export function SparkBar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "risk" | "watch" }) {
  const pct = max <= 0 ? 0 : Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100));
  return (
    <span aria-hidden className="block h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-sunken">
      <span
        style={{ width: `${pct}%` }}
        className={cx("block h-full rounded-full", tone === "risk" ? "bg-risk" : tone === "watch" ? "bg-watch" : "bg-brand")}
      />
    </span>
  );
}
