"use client";

import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@/ui/icons";
import type { IconType } from "@/ui/icons";
import { cx } from "./cx";

// Slide-over panel anchored to the right edge (settings, threads, notifications, quick views).
// Radix Dialog underneath: focus trap, Esc to close, labelled title, focus returns on close.
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: IconType;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  bodyClassName?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/25 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <D.Content
          aria-describedby={undefined}
          className={cx(
            "fixed top-0 right-0 bottom-0 z-50 flex w-full flex-col bg-surface shadow-pop outline-none sm:top-2 sm:right-2 sm:bottom-2 sm:rounded-[10px]",
            "data-[state=open]:animate-[sheet-in_200ms_cubic-bezier(0.2,0.8,0.2,1)]",
            size === "md" ? "sm:max-w-[560px]" : size === "lg" ? "sm:max-w-[760px]" : "sm:max-w-[1040px]",
          )}
        >
          <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <D.Title className="truncate text-section font-semibold">{title}</D.Title>
                {description ? <p className="truncate text-table text-muted">{description}</p> : null}
              </div>
            </div>
            <D.Close className="rounded-full p-2 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X size={18} aria-hidden />
            </D.Close>
          </header>
          <div className={cx("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Two-pane sheet body: section menu on the left, content on the right (stacks on phones). */
export function SheetSections<K extends string>({
  sections,
  active,
  onSelect,
  children,
}: {
  sections: Array<{ key: K; label: string; icon: IconType; badge?: number }>;
  active: K;
  onSelect: (k: K) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col sm:flex-row">
      <nav aria-label="Sections" className="flex shrink-0 gap-1 overflow-x-auto border-b border-rule p-2 sm:w-56 sm:flex-col sm:border-r sm:border-b-0 sm:p-3">
        {sections.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-current={active === key ? "page" : undefined}
            className={cx(
              "flex h-9 items-center gap-3 rounded-control px-3 text-body whitespace-nowrap",
              active === key ? "bg-sunken font-medium text-ink" : "text-muted hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon size={18} aria-hidden />
            <span className="flex-1 text-left">{label}</span>
            {badge ? <span className="num rounded-full bg-risk px-1.5 text-meta leading-5 font-semibold text-white">{badge}</span> : null}
          </button>
        ))}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
