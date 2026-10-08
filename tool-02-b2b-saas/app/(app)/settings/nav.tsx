"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/ui/cx";

const ITEMS = [
  { href: "/settings", label: "Workspace" },
  { href: "/settings/data", label: "Usage feed" },
  { href: "/settings/crm", label: "CRM and webhooks" },
  { href: "/settings/imports", label: "Imports" },
  { href: "/settings/routing", label: "Routing" },
  { href: "/settings/users", label: "People" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto lg:flex-col">
      {ITEMS.map((i) => {
        const on = path === i.href;
        return (
          <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} className={cx("rounded-control px-3 py-2 text-body whitespace-nowrap", on ? "bg-brand-tint font-medium text-brand" : "text-muted hover:bg-sunken hover:text-text")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
