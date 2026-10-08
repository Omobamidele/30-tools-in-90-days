import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cx } from "./cx";

// Dense, rule-separated tables. Wide tables scroll inside their container with the
// first column pinned (docs/04 §8): no horizontal page scroll.

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full border-collapse text-table", className)}>{children}</table>
    </div>
  );
}

export function Th({ className, align, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cx(
        "h-9 border-b border-rule bg-surface px-3 text-meta font-medium whitespace-nowrap text-faint first:sticky first:left-0 first:z-[1] first:pl-5 last:pr-5",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, align, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { align?: "left" | "right" }) {
  return (
    <td
      className={cx(
        "h-11 border-b border-rule px-3 align-middle first:sticky first:left-0 first:bg-surface first:pl-5 last:pr-5",
        align === "right" && "num text-right whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx("group hover:bg-sunken/60 [&>td:first-child]:group-hover:bg-sunken", className)}>{children}</tr>;
}
