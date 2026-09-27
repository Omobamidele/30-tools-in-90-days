"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutDashboard, CalendarRange, AlarmClock, GitPullRequestArrow, Menu, X } from "@/ui/icons";
import type { NavItem } from "./sidebar";
import { cx } from "../cx";

// Phone navigation (docs/04 §8): the four daily destinations plus a menu for the rest.
export function BottomNav({ items, productName }: { items: NavItem[]; productName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = [
    { href: "/", label: "Overview", Icon: LayoutDashboard },
    { href: "/events", label: items.find((i) => i.href === "/events")?.label ?? "Events", Icon: CalendarRange },
    { href: "/deadlines", label: "Deadlines", Icon: AlarmClock },
    { href: "/changes", label: "Changes", Icon: GitPullRequestArrow },
  ];
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => setOpen(false)}>
          <nav
            aria-label="More"
            className="absolute right-0 bottom-16 left-0 border-t border-rule bg-surface p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-meta text-muted">{productName}</p>
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cx("block rounded-control px-3 py-2 text-body", active(i.href) ? "bg-sunken font-medium" : "text-ink")}
              >
                {i.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
      <nav
        aria-label="Main"
        className="on-midnight fixed right-0 bottom-0 left-0 z-30 grid h-16 grid-cols-5 bg-midnight md:hidden"
      >
        {primary.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cx(
              "relative flex flex-col items-center justify-center gap-0.5 text-meta",
              active(href) ? "font-medium text-white" : "text-on-midnight-muted",
            )}
          >
            {active(href) ? <span aria-hidden className="absolute top-0 h-[3px] w-10 rounded-b-full bg-accent" /> : null}
            <Icon size={20} weight={active(href) ? "fill" : "regular"} aria-hidden />
            <span className="max-w-full truncate px-1">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-col items-center justify-center gap-0.5 text-meta text-on-midnight-muted"
        >
          {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          More
        </button>
      </nav>
    </>
  );
}
