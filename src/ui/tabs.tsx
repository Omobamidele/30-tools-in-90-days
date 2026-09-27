"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./cx";

// Routed tabs: each tab is a URL, so tabs are linkable and back works (docs/04 §5.3).
export function RouteTabs({ tabs, base }: { tabs: Array<{ href: string; label: string; count?: number }>; base: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="flex max-w-full gap-6 overflow-x-auto border-b border-on-canvas-rule">
      {tabs.map((t) => {
        const active = t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px inline-flex h-10 items-center border-b-2 text-body whitespace-nowrap transition-colors",
              active ? "border-on-canvas-mark font-medium text-on-canvas" : "border-transparent text-on-canvas-muted hover:text-on-canvas",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="num ml-1.5 rounded-full bg-on-canvas-rule px-1.5 text-meta text-on-canvas-muted">{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
