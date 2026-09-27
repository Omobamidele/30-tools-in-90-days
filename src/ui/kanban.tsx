import type { ReactNode } from "react";
import { cx } from "./cx";

// Presentational pieces shared by every board (events, changes, deadlines). Drag behaviour
// lives in the board that needs it; these only draw. Colour appears only as a stage dot.

/** Stage colours, used as small dots and calendar markers. Tuned to the midnight/gold palette
 *  (docs/09); each is ≥3:1 on white and on the photo scrim, as non-text marks. */
export const stageColors = {
  violet: "#8b6cf0",
  blue: "#4f86d6",
  teal: "#1b9e8a",
  amber: "#d4972a",
  green: "#2a9d63",
  grey: "#98a2b3",
  red: "#e5484d",
} as const;
export type StageColor = keyof typeof stageColors;

/** Horizontally scrolling row of columns, full bleed on phones. */
export function Board({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="region" aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      <div className="flex min-w-max items-start gap-3">{children}</div>
    </div>
  );
}

/** Column header: stage dot, name, count; the column's money total on the right. */
export function StageHeader({ title, count, color, total, totalLabel }: { title: string; count: number; color: StageColor; total?: ReactNode; totalLabel?: string }) {
  return (
    <div className="flex items-center gap-2 px-1.5 pt-0.5 pb-1">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: stageColors[color] }} />
      <h2 className="truncate text-body font-semibold text-on-canvas">{title}</h2>
      <span className="num text-table text-on-canvas-faint">{count}</span>
      {total !== undefined ? (
        <span className="num ml-auto text-table text-on-canvas-muted" title={totalLabel}>
          {total}
        </span>
      ) : null}
    </div>
  );
}

/** Column: a light track holding the cards, with an optional drop highlight. */
export function ColumnShell({ children, highlight, dimmed, className }: { children: ReactNode; highlight?: boolean; dimmed?: boolean; className?: string }) {
  return (
    <section
      className={cx(
        "flex w-[280px] shrink-0 flex-col gap-2 rounded-panel bg-[var(--column-bg)] p-2 transition-colors",
        highlight ? "bg-brand-tint outline-2 outline-dashed outline-brand/50" : "",
        dimmed ? "opacity-50" : "",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Empty column placeholder. */
export function EmptyColumn({ children }: { children: ReactNode }) {
  return <p className="rounded-control border border-dashed border-on-canvas-rule px-3 py-5 text-center text-table text-on-canvas-faint">{children}</p>;
}

/** Card surface used by all boards. `accent` is accepted for API compatibility and not drawn. */
export function CardShell({ children, className, flush }: { children: ReactNode; accent?: StageColor | "risk" | "watch"; className?: string; /** No padding, clipped corners: for cards that start with a photo. */ flush?: boolean }) {
  return (
    <article data-surface className={cx("rounded-panel border border-rule bg-surface text-ink transition-colors hover:border-rule-strong", flush ? "overflow-hidden" : "p-3", className)}>
      {children}
    </article>
  );
}
