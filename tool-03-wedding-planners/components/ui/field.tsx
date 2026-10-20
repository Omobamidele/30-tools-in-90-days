import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "./cn";

const control = "w-full rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 transition-colors duration-150 ease-out focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 aria-[invalid=true]:border-red-600 aria-[invalid=true]:focus:ring-red-600/15 disabled:opacity-50";
export const Input = ({ className, ...p }: React.ComponentProps<"input">) => <input className={cn(control, "h-8", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.ComponentProps<"textarea">) => <textarea className={cn(control, "min-h-24 py-2 leading-5", className)} {...p} />;
export const NativeSelect = ({ className, ...p }: React.ComponentProps<"select">) => <select className={cn(control, "h-8 pr-7", className)} {...p} />;
export const Label = ({ className, ...p }: React.ComponentProps<typeof LabelPrimitive.Root>) => <LabelPrimitive.Root className={cn("mb-1 block text-[12px] font-medium text-gray-700", className)} {...p} />;

export function Field({ id, label, error, hint, children, className }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p id={`${id}-error`} role="alert" className="mt-1 text-[12px] text-red-600">{error}</p> : hint ? <p className="mt-1 text-[12px] text-gray-500">{hint}</p> : null}
    </div>
  );
}
