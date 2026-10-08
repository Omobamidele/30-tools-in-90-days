import Link from "next/link";
import type { IconType } from "@/ui/icons";
import { Search, X } from "@/ui/icons";
import { cx } from "./cx";

export type LayoutTab = { key: string; label: string; href: string; icon: IconType; active: boolean };
export type FilterChip = { label: string; href: string; active: boolean; count?: number; tone?: "risk" | "watch" };

/**
 * The row above every board/list: layout switcher, filters (URL-driven, so views can be shared
 * and bookmarked) and a search box that submits as a GET form.
 */
export function BoardToolbar({
  layouts,
  chips,
  search,
  clearHref,
}: {
  layouts: LayoutTab[];
  chips: FilterChip[];
  search?: { value: string; placeholder: string; hidden: Record<string, string> };
  clearHref?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-on-canvas-rule pb-4">
      <nav aria-label="Layout" data-surface className="flex rounded-control bg-sunken p-0.5">
        {layouts.map(({ key, label, href, icon: Icon, active }) => (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-table transition-colors",
              active ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(14_23_38/0.1)]" : "text-muted hover:text-ink",
            )}
          >
            <Icon size={14} aria-hidden />
            {label}
          </Link>
        ))}
      </nav>

      <nav aria-label="Filters" className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            aria-current={c.active ? "true" : undefined}
            data-surface={c.active ? "" : undefined}
            className={cx(
              "inline-flex h-7 items-center gap-1.5 rounded-control border px-2.5 text-table whitespace-nowrap transition-colors",
              c.active ? "border-rule-strong bg-surface font-medium text-ink" : "border-transparent text-on-canvas-muted hover:bg-surface hover:text-ink",
            )}
          >
            {c.tone && c.count ? <span aria-hidden className={cx("size-1.5 rounded-full", c.tone === "risk" ? "bg-risk" : "bg-watch")} /> : null}
            {c.label}
            {c.count !== undefined ? <span className="num opacity-80">{c.count}</span> : null}
          </Link>
        ))}
      </nav>

      {search ? (
        <form method="get" role="search" data-surface className="flex h-8 w-full items-center gap-2 rounded-control border border-rule bg-surface px-2.5 focus-within:border-brand sm:ml-auto sm:w-64">
          {Object.entries(search.hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <Search size={14} className="shrink-0 text-faint" aria-hidden />
          <label className="sr-only" htmlFor="board-search">
            Search
          </label>
          <input id="board-search" name="q" defaultValue={search.value} placeholder={search.placeholder} className="h-full min-w-0 flex-1 bg-transparent text-table outline-none placeholder:text-faint" />
          {search.value && clearHref ? (
            <Link href={clearHref} aria-label="Clear search" className="rounded p-0.5 text-faint hover:text-ink">
              <X size={14} aria-hidden />
            </Link>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
