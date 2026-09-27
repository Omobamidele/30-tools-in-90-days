"use client";

import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@/ui/icons";

// Accessible modal (focus trap, Esc to close, labelled title) on Radix primitives.
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-ink/30" />
        <D.Content
          className={`fixed top-[10vh] left-1/2 z-50 max-h-[80vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto panel shadow-pop ${wide ? "max-w-2xl" : "max-w-lg"}`}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between gap-3 border-b border-rule px-4 py-3">
            <div>
              <D.Title className="text-section font-semibold">{title}</D.Title>
              {description ? <D.Description className="text-table text-muted">{description}</D.Description> : null}
            </div>
            <D.Close className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X size={16} aria-hidden />
            </D.Close>
          </div>
          <div className="p-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
