"use client";

import Link from "next/link";
import { DropdownMenu as M } from "radix-ui";
import { CaretDown, Check } from "./icons";
import { cx } from "./cx";

// A HubSpot-style quick filter (docs/09 rev. 5): one button per property showing the current
// choice, opening a short menu of options. Each option is a link, so filters stay in the URL.

export function FilterMenu({ label, items }: { label: string; items: Array<{ href: string; label: string; active: boolean }> }) {
  const current = items.find((i) => i.active);
  const filtered = current && current !== items[0];
  return (
    <M.Root>
      <M.Trigger
        className={cx(
          "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-table",
          filtered ? "border-brand bg-brand-tint text-brand" : "border-rule-strong text-text hover:bg-hover",
        )}
      >
        <span>
          {label}
          {filtered ? <span className="font-medium">: {current.label}</span> : null}
        </span>
        <CaretDown size={12} aria-hidden />
      </M.Trigger>
      <M.Portal>
        <M.Content align="start" sideOffset={4} className="z-50 min-w-56 rounded-panel border border-rule bg-surface p-1 shadow-pop">
          {items.map((i) => (
            <M.Item key={i.href} asChild className="flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body text-text outline-none data-[highlighted]:bg-hover">
              <Link href={i.href} aria-current={i.active ? "true" : undefined}>
                <span className="w-4">{i.active ? <Check size={14} aria-hidden className="text-brand" /> : null}</span>
                {i.label}
              </Link>
            </M.Item>
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
