import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type IconType } from "@/ui/icons";
import { cx } from "./cx";

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-meta text-on-canvas-faint">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight size={12} aria-hidden /> : null}
            {c.href ? (
              <Link href={c.href} className="hover:text-on-canvas">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  crumbs,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-title font-medium text-on-canvas">{title}</h1>
          {meta ? <div className="mt-1 text-table text-on-canvas-muted">{meta}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  /** Accepted for API compatibility; panels are titled with text only. */
  icon?: IconType;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("panel", className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-rule px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-section font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-table text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** An empty screen is an invitation to act (docs/04 §7). */
export function EmptyState({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-body font-medium">{title}</p>
      {children ? <p className="mx-auto mt-1 max-w-md text-table text-muted">{children}</p> : null}
      {actions ? <div className="mt-4 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "secondary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors",
        size === "sm" ? "h-7 px-2.5 text-table" : "h-8 px-3 text-body",
        variant === "primary" && "bg-brand text-white hover:bg-brand-strong",
        variant === "secondary" && "border border-rule-strong bg-surface text-ink hover:bg-sunken",
        variant === "ghost" && "text-on-canvas hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

/** Attribute list for record pages (label / value rows). */
export function Attributes({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-rule">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-5 py-2.5">
          <dt className="text-table text-muted">{i.label}</dt>
          <dd className="min-w-0 text-table break-words">{i.value ?? <span className="text-faint">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
