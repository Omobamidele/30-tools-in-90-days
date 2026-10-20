"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@/components/icons";
import { cn } from "./cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
const overlay = "fixed inset-0 z-40 bg-ink/30";
const closeBtn = "grid size-8 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink";

export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className={cn("fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 overflow-y-auto rounded-panel bg-surface shadow-overlay focus:outline-none", className)}>
        <div className="flex items-start gap-3 px-6 pb-2 pt-5">
          <div className="min-w-0 flex-1">
            <D.Title className="text-[18px] font-semibold leading-7 text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[14px] text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className={cn(closeBtn, "-mr-2")} aria-label="Close"><X className="size-[18px]" /></D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}

export function Sheet({ open, onOpenChange, children, label }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode; label: string }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={overlay} />
        <D.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} tabIndex={-1}
          className="anim-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-surface shadow-overlay focus:outline-none" data-testid="sheet">
          <D.Title className="sr-only">{label}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export const SheetClose = D.Close;
export const sheetCloseClass = closeBtn;
