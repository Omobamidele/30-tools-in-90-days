import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "./cn";

const control = "w-full rounded-control border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-ink focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-50";
export const Input = ({ className, ...p }: React.ComponentProps<"input">) => <input className={cn(control, "h-9", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.ComponentProps<"textarea">) => <textarea className={cn(control, "min-h-28 py-2.5 leading-[22px]", className)} {...p} />;
export const NativeSelect = ({ className, ...p }: React.ComponentProps<"select">) => <select className={cn(control, "h-9 pr-8", className)} {...p} />;
export const Label = ({ className, ...p }: React.ComponentProps<typeof LabelPrimitive.Root>) => <LabelPrimitive.Root className={cn("mb-1.5 block text-[13px] font-semibold text-ink", className)} {...p} />;

export function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p> : hint ? <p className="mt-1.5 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}
