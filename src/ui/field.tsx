"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

const control =
  "w-full rounded-control border border-rule-strong bg-surface px-3 text-body text-ink placeholder:text-faint " +
  "focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none " +
  "aria-[invalid=true]:border-risk disabled:bg-sunken disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(control, "h-9", className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cx(control, "h-9 pr-7", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cx(control, "min-h-20 py-1.5", className)} {...props} />;
  },
);

// Label above, helper or error below (docs/04-ux-design.md §6).
export function Field({
  label,
  help,
  error,
  required,
  children,
  className,
}: {
  label: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-table font-medium text-ink">
        {label}
        {required ? <span className="ml-1.5 font-normal text-muted">Required</span> : null}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-meta text-risk">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-meta text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
