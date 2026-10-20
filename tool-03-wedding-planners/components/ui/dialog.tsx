"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "./cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="anim-fade fixed inset-0 z-40 bg-gray-900/20" />
      <D.Content className={cn("anim-pop fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl focus:outline-none", className)}>
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0 flex-1">
            <D.Title className="text-[14px] font-semibold text-gray-900">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-[13px] text-gray-500">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="-mr-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40" aria-label="Close"><X className="size-4" /></D.Close>
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
        <D.Overlay className="anim-fade fixed inset-0 z-40 bg-gray-900/20" />
        <D.Content aria-describedby={undefined} onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }} tabIndex={-1} className="anim-sheet fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l border-gray-200 bg-white shadow-xl focus:outline-none" data-testid="sheet">
          <D.Title className="sr-only">{label}</D.Title>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
export const SheetClose = D.Close;
