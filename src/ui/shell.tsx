"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { authClient } from "@/auth/client";
import { Bell, ChartBar, GearSix, House, Kanban, MagnifyingGlass, SignOut, SlidersHorizontal, Target, UserCircle, Users } from "./icons";
import type { IconType } from "./icons";
import { cx } from "./cx";

export function ProductMark({ text, size = 32 }: { text: string; size?: number }) {
  return (
    <span aria-hidden className="relative inline-flex shrink-0 items-center justify-center rounded-[7px] bg-ink-2 font-mono font-semibold text-on-ink ring-1 ring-white/15" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {text}
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-signal ring-2 ring-ink" />
    </span>
  );
}

export type NavItem = { href: string; label: string; icon: IconType; match: string[] };

function navFor(role: string, csqlPlural: string): NavItem[] {
  const items: NavItem[] = [
    { href: "/", label: "Overview", icon: House, match: ["/"] },
    { href: "/signals", label: "Signals", icon: Target, match: ["/signals"] },
    { href: "/csqls", label: csqlPlural, icon: Kanban, match: ["/csqls"] },
    { href: "/accounts", label: "Accounts", icon: Users, match: ["/accounts"] },
    { href: "/results", label: "Results", icon: ChartBar, match: ["/results"] },
  ];
  if (role === "ADMIN" || role === "REVOPS") {
    items.push({ href: "/rules", label: "Rules", icon: SlidersHorizontal, match: ["/rules"] });
    items.push({ href: "/settings", label: "Settings", icon: GearSix, match: ["/settings"] });
  }
  return items;
}

const active = (path: string, item: NavItem) => item.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));

export function TopBar({
  productName,
  orgName,
  logoText,
  user,
  roleLabel,
  role,
  csqlPlural,
  unread,
}: {
  productName: string;
  orgName: string;
  logoText: string;
  user: { name: string; email: string };
  roleLabel: string;
  role: string;
  csqlPlural: string;
  unread: number;
}) {
  const nav = navFor(role, csqlPlural);
  const path = usePathname();
  const router = useRouter();
  return (
    <>
      <header className="on-ink sticky top-0 z-30 bg-ink text-on-ink">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 lg:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <ProductMark text={logoText} />
            <span className="hidden leading-tight sm:block">
              <span className="block text-body font-semibold">{productName}</span>
              <span className="block text-meta text-on-ink-muted">{orgName}</span>
            </span>
          </Link>
          <nav aria-label="Main" className="ml-2 hidden h-full items-stretch md:flex">
            {nav.map((item) => {
              const on = active(path, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className={cx("relative flex items-center px-3 text-body", on ? "font-medium text-on-ink" : "text-on-ink-muted hover:text-on-ink")}
                >
                  {item.label}
                  {on ? <span aria-hidden className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-signal" /> : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <form action="/search" className="relative hidden lg:block" role="search">
              <label htmlFor="global-search" className="sr-only">
                Search accounts
              </label>
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-on-ink-muted" />
              <input
                id="global-search"
                name="q"
                placeholder="Search accounts…"
                className="h-8 w-56 rounded-control border border-white/15 bg-ink-2 pr-3 pl-8 text-table text-on-ink placeholder:text-on-ink-muted focus:border-signal focus:outline-none"
              />
            </form>
            <Link href="/notifications" className="relative rounded-control p-2 text-on-ink-muted hover:bg-ink-2 hover:text-on-ink" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
              <Bell size={20} aria-hidden />
              {unread ? (
                <span aria-hidden className="absolute top-1 right-1 min-w-4 rounded-full bg-signal px-1 font-mono text-[10px] leading-4 font-semibold text-ink">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
            <M.Root>
              <M.Trigger className="flex items-center gap-2 rounded-control p-1.5 hover:bg-ink-2" aria-label={`Account menu for ${user.name}`}>
                <span className="inline-flex size-7 items-center justify-center rounded-full bg-brand font-mono text-meta font-semibold text-white">
                  {user.name
                    .split(/\s+/)
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join("")}
                </span>
              </M.Trigger>
              <M.Portal>
                <M.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-panel border border-rule bg-surface p-1 text-text shadow-pop">
                  <div className="px-3 py-2">
                    <p className="text-body font-medium">{user.name}</p>
                    <p className="text-meta text-muted">
                      {roleLabel} · {user.email}
                    </p>
                  </div>
                  <M.Separator className="my-1 h-px bg-rule" />
                  <M.Item asChild className="flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body outline-none data-[highlighted]:bg-sunken">
                    <Link href="/account">
                      <UserCircle size={16} aria-hidden /> Your account
                    </Link>
                  </M.Item>
                  <M.Item
                    className="flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body outline-none data-[highlighted]:bg-sunken"
                    onSelect={async () => {
                      await authClient.signOut();
                      router.replace("/sign-in");
                      router.refresh();
                    }}
                  >
                    <SignOut size={16} aria-hidden /> Sign out
                  </M.Item>
                </M.Content>
              </M.Portal>
            </M.Root>
          </div>
        </div>
      </header>
      {/* Phones: bottom navigation (docs/04 §6). */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-rule bg-surface md:hidden" style={{ gridTemplateColumns: `repeat(${Math.min(nav.length, 5)}, minmax(0, 1fr))` }}>
        {nav.slice(0, 5).map((item) => {
          const on = active(path, item);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cx("flex flex-col items-center gap-0.5 py-2 text-meta", on ? "font-medium text-brand" : "text-muted")}>
              <Icon size={20} weight={on ? "fill" : "regular"} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
