"use client";
import { ToggleGroup } from "radix-ui";
/** Underlined view tabs, as in HoneyBook's "Main view | Opportunities" bar. Selection lives in the URL (the caller sets it). */
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className="-mb-px flex items-end gap-6 overflow-x-auto">
      {items.map((i) => (
        <ToggleGroup.Item key={i.value} value={i.value} className="inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-[14px] font-medium text-muted hover:text-ink data-[state=on]:border-ink data-[state=on]:font-semibold data-[state=on]:text-ink">
          {i.label}{i.count != null ? <span className="text-muted">{i.count}</span> : null}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
