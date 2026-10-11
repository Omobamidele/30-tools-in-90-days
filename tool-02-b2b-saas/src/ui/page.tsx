import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight, type IconType } from "./icons";
import { cx } from "./cx";

// Page furniture (docs/09 rev. 5), HubSpot-style: white pages, a title row with its actions,
// saved-view tabs underlined in the brand colour, a row of quick filters, and sections that are
// separated by space and hairlines rather than boxed cards.

export type Crumb = { href?: string; label: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-meta text-muted">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <CaretRight size={11} aria-hidden /> : null}
            {c.href ? (
              <Link href={c.href} className="text-brand hover:underline">
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
    <header className={cx("pt-8", tabs ? "mb-0" : "mb-8", className)}>
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <h1 className="text-display font-semibold">{title}</h1>
            {meta ? <div className="mt-1 text-body text-muted">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
      {tabs ? <div className="mt-6">{tabs}</div> : null}
      {toolbar ? <div className={cx("flex flex-wrap items-center gap-2", tabs ? "py-4" : "mt-5")}>{toolbar}</div> : null}
    </header>
  );
}

/** A titled section. No box: a heading over a hairline, then the content. */
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
        <div className="flex items-end justify-between gap-3 border-b border-rule pb-3">
          <div className="min-w-0">
            <h2 id={id} className="text-section font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-meta text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** An empty screen says what fills it and how (docs/04 §4). */
export function EmptyState({ title, children, actions, icon: Icon }: { title: string; children?: ReactNode; actions?: ReactNode; icon?: IconType }) {
  return (
    <div className="px-4 py-14 text-center">
      {Icon ? (
        <span aria-hidden className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
          <Icon size={26} />
        </span>
      ) : null}
      <p className="text-section font-semibold">{title}</p>
      {children ? <p className="mx-auto mt-1.5 max-w-md text-body text-muted">{children}</p> : null}
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
        size === "sm" ? "h-8 px-3 text-meta" : "h-10 px-5 text-body",
        variant === "primary" && "bg-brand text-white hover:bg-brand-strong",
        variant === "secondary" && "border border-brand text-brand hover:bg-brand-tint",
        variant === "ghost" && "text-brand hover:bg-brand-tint",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Record properties, HubSpot-style: a small label above its value. */
export function Attributes({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="flex flex-col gap-4 py-4">
      {items.map((i) => (
        <div key={i.label}>
          <dt className="text-meta text-muted">{i.label}</dt>
          <dd className="mt-0.5 min-w-0 text-body break-words">{i.value ?? <span className="text-faint">Not set</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small toggles kept in the URL. Prefer FilterMenu when there are more than three options. */
export function Chips({ items }: { items: Array<{ href: string; label: string; count?: number; active: boolean; icon?: IconType }> }) {
  return (
    <div role="list" className="flex flex-wrap gap-2">
      {items.map((c) => (
        <Link
          role="listitem"
          key={c.href + c.label}
          href={c.href}
          aria-current={c.active ? "true" : undefined}
          className={cx("inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-table", c.active ? "border-brand bg-brand-tint font-medium text-brand" : "border-rule-strong text-text hover:bg-hover")}
        >
          {c.label}
          {c.count !== undefined ? <span className="num text-meta text-muted">{c.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}

/** Saved-view tabs kept in the URL, underlined in the brand colour. */
export function Tabs({ items, label }: { items: Array<{ href: string; label: string; count?: number; active: boolean; icon?: IconType }>; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b border-rule">
      {items.map((t) => (
        <Link
          key={t.href + t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx("-mb-px flex items-center gap-2 border-b-[3px] pt-1 pb-3 text-body whitespace-nowrap", t.active ? "border-brand font-semibold text-text" : "border-transparent text-muted hover:text-text")}
        >
          {t.label}
          {t.count !== undefined ? <span className={cx("num text-meta", t.active ? "text-text" : "text-faint")}>{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A simple data table with a soft header row (HubSpot index pages). */
export function DataTable({ caption, head, children, minWidth = 760 }: { caption: string; head: Array<{ label: string; className?: string }>; children: ReactNode; minWidth?: number }) {
  return (
    <div className="hidden overflow-x-auto border-y border-rule md:block">
      <table className="w-full text-table" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-sunken text-left text-meta font-semibold text-muted">
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" className={cx("px-4 py-3 font-semibold first:pl-5", h.className)}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">{children}</tbody>
      </table>
    </div>
  );
}

/**
 * HubSpot's record page (docs/09 rev. 5): key details on the left, the main work in the middle,
 * associated records on the right, separated by hairlines rather than boxes. On narrower
 * screens the columns stack: left, middle, right.
 */
export function RecordLayout({ left, middle, right }: { left: ReactNode; middle: ReactNode; right: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-y-8 pt-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]">
      <aside aria-label="Key details" className="lg:border-r lg:border-rule lg:pr-8">
        {left}
      </aside>
      <div className="min-w-0 lg:px-10">{middle}</div>
      <aside aria-label="Related records" className="lg:col-start-2 lg:px-10 xl:col-start-auto xl:border-l xl:border-rule xl:pr-0 xl:pl-8">
        {right}
      </aside>
    </div>
  );
}

/** A titled group of properties in a record's side column. */
export function RecordSection({ title, children, first = false }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={cx(first ? "" : "mt-6", "border-t border-rule pt-5")}>
      <h2 className="text-section font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** The middle column's tabs (Overview, Activity), kept in the URL. */
export function RecordTabs({ items }: { items: Array<{ href: string; label: string; active: boolean; count?: number }> }) {
  return (
    <nav aria-label="Record sections" className="flex gap-6 border-b border-rule">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx("-mb-px flex items-center gap-2 border-b-[3px] pb-3 text-body", t.active ? "border-brand font-semibold text-text" : "border-transparent text-muted hover:text-text")}
        >
          {t.label}
          {t.count !== undefined ? <span className="num text-meta text-faint">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** The phone version of an index table: one stacked row per record (docs/09 rev. 5). */
export function PhoneList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-rule border-y border-rule md:hidden">{children}</ul>;
}
