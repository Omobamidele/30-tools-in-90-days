import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight, type IconType } from "./icons";
import { cx } from "./cx";

// Page furniture (docs/09 rev. 4), mirroring Close: a white header band with a bold title and
// its actions, an optional row of pill tabs and a toolbar row, then a grey canvas holding white
// bordered panels.

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-meta text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <CaretRight size={11} aria-hidden /> : null}
            {c.href ? (
              <Link href={c.href} className="hover:text-text hover:underline">
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
  tabs,
  toolbar,
  leading,
  children,
  className,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  toolbar?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("-mx-4 mb-6 border-b border-rule bg-surface sm:-mx-6 lg:-mx-8", className)}>
      <div className="px-4 pt-6 pb-4 sm:px-6 lg:px-8">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {leading}
            <div className="min-w-0">
              <h1 className="text-display font-bold">{title}</h1>
              {meta ? <div className="mt-0.5 text-table text-muted">{meta}</div> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {tabs ? <div className="mt-4">{tabs}</div> : null}
        {children}
      </div>
      {toolbar ? <div className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3 sm:px-6 lg:px-8">{toolbar}</div> : null}
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
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section className={cx("panel", className)} aria-labelledby={title && id ? id : undefined}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-rule px-6 py-4">
          <div className="min-w-0">
            <h2 id={id} className="text-section font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-table text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** An empty screen says what fills it and how (docs/04 §4), with an icon in a soft circle. */
export function EmptyState({ title, children, actions, icon: Icon }: { title: string; children?: ReactNode; actions?: ReactNode; icon?: IconType }) {
  return (
    <div className="px-4 py-14 text-center">
      {Icon ? (
        <span aria-hidden className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon size={28} />
        </span>
      ) : null}
      <p className="text-title">{title}</p>
      {children ? <p className="mx-auto mt-2 max-w-md text-body text-muted">{children}</p> : null}
      {actions ? <div className="mt-5 flex justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "secondary", size = "md", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md"; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors",
        size === "sm" ? "h-8 px-3 text-table" : "h-9 px-4 text-body",
        variant === "primary" && "bg-brand font-semibold text-white hover:bg-brand-strong",
        variant === "secondary" && "border border-rule-strong bg-surface text-text hover:bg-hover",
        variant === "ghost" && "text-text hover:bg-hover",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Attributes({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-rule">
      {items.map((i) => (
        <div key={i.label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-6 py-3">
          <dt className="text-table text-muted">{i.label}</dt>
          <dd className="min-w-0 text-table break-words">{i.value ?? <span className="text-faint">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Filters kept in the URL, drawn as Close-style outlined toolbar buttons (docs/04 §2). */
export function Chips({ items }: { items: Array<{ href: string; label: string; count?: number; active: boolean; icon?: IconType }> }) {
  return (
    <div role="list" className="flex flex-wrap gap-2">
      {items.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            role="listitem"
            key={c.href + c.label}
            href={c.href}
            aria-current={c.active ? "true" : undefined}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-table",
              c.active ? "border-brand/40 bg-brand-tint font-medium text-brand" : "border-rule-strong bg-surface text-text hover:bg-hover",
            )}
          >
            {Icon ? <Icon size={15} aria-hidden /> : null}
            {c.label}
            {c.count !== undefined ? <span className={cx("num text-meta", c.active ? "text-brand" : "text-muted")}>{c.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}

/** Pill tabs kept in the URL, with icons and counts (Close's Inbox tabs). */
export function Tabs({ items, label }: { items: Array<{ href: string; label: string; count?: number; active: boolean; icon?: IconType }>; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto">
      {items.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.href + t.label}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cx("flex h-8 items-center gap-2 rounded-control px-3 text-body whitespace-nowrap", t.active ? "bg-sunken font-medium text-text" : "text-muted hover:bg-hover hover:text-text")}
          >
            {Icon ? <Icon size={16} aria-hidden /> : null}
            {t.label}
            {t.count !== undefined ? <span className={cx("num text-meta", t.active ? "text-text" : "text-faint")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
