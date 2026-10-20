"use client";
import { ToggleGroup } from "radix-ui";
export function Segmented<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <ToggleGroup.Root type="single" value={value} onValueChange={(v) => v && onChange(v as T)} aria-label={label} className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-gray-50 p-0.5">
      {items.map((i) => (
        <ToggleGroup.Item key={i.value} value={i.value} className="inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium text-gray-600 transition-colors duration-150 ease-out hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 data-[state=on]:bg-white data-[state=on]:text-gray-900 data-[state=on]:shadow-sm">
          {i.label}{i.count != null ? <span className="tabular-nums text-gray-400">{i.count}</span> : null}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
