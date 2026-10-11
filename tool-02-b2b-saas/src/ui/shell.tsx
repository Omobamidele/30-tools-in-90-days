"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { authClient } from "@/auth/client";
import { Bell, CaretDown, ChartBar, House, Kanban, MagnifyingGlass, SignOut, Target, UserCircle, Users } from "./icons";
import type { IconType } from "./icons";
import { cx } from "./cx";

// App frame (docs/09 rev. 5), HubSpot-style: a green top navigation bar with the main sections,
// an Admin menu, search, notifications and the account menu. No sidebar, so pages use the full
// width. On phones, a slim top bar and a bottom navigation bar.

export function ProductMark({ text, size = 28 }: { text: string; size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center bg-brand font-semibold text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), fontSize: size * 0.38 }}>
      {text}
    </span>
  );
}

type NavItem = { href: string; label: string; icon: IconType; match: string[]; badge?: number };

function navFor(csqlPlural: string, waiting: number) {
  const main: NavItem[] = [
    { href: "/", label: "Home", icon: House, match: ["/"] },
    { href: "/signals", label: "Signals", icon: Target, match: ["/signals"], badge: waiting },
    { href: "/csqls", label: csqlPlural, icon: Kanban, match: ["/csqls"] },
    { href: "/accounts", label: "Accounts", icon: Users, match: ["/accounts"] },
    { href: "/results", label: "Results", icon: ChartBar, match: ["/results"] },
  ];
  return main;
}

const isActive = (path: string, item: { match: string[] }) => item.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));

type Props = {
  productName: string;
  orgName: string;
  logoText: string;
  user: { name: string; email: string };
  roleLabel: string;
  role: string;
  csqlPlural: string;
  unread: number;
  waiting: number;
};

const menuItem = "flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body text-text outline-none data-[highlighted]:bg-hover";

function UserMenu({ user, roleLabel, onDark }: { user: Props["user"]; roleLabel: string; onDark: boolean }) {
  const router = useRouter();
  return (
    <M.Root>
      <M.Trigger className={cx("flex h-9 items-center gap-1.5 rounded-control px-2 text-body", onDark ? "text-white hover:bg-white/10" : "text-text hover:bg-hover")} aria-label={`Account menu for ${user.name}`}>
        <UserCircle size={22} aria-hidden />
        <span className="hidden xl:inline">{user.name.split(" ")[0]}</span>
        <CaretDown size={12} aria-hidden />
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-64 rounded-panel border border-rule bg-surface p-1 shadow-pop">
          <div className="px-3 py-2">
            <p className="text-body font-medium text-text">{user.name}</p>
            <p className="text-meta text-muted">{roleLabel}</p>
            <p className="text-meta text-muted">{user.email}</p>
          </div>
          <M.Separator className="my-1 h-px bg-rule" />
          <M.Item asChild className={menuItem}>
            <Link href="/account">Your account</Link>
          </M.Item>
          <M.Item
            className={menuItem}
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
  );
}

function AdminMenu({ path }: { path: string }) {
  const on = path.startsWith("/rules") || path.startsWith("/settings");
  return (
    <M.Root>
      <M.Trigger className={cx("flex h-14 items-center gap-1 border-b-[3px] px-3 text-body", on ? "border-white font-medium text-white" : "border-transparent text-white/85 hover:text-white")}>
        Admin <CaretDown size={12} aria-hidden />
      </M.Trigger>
      <M.Portal>
        <M.Content align="start" sideOffset={0} className="z-50 min-w-56 rounded-panel border border-rule bg-surface p-1 shadow-pop">
          <M.Item asChild className={menuItem}>
            <Link href="/rules">Signal rules</Link>
          </M.Item>
          <M.Item asChild className={menuItem}>
            <Link href="/settings">Settings</Link>
          </M.Item>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

export function Sidebar(p: Props) {
  const path = usePathname();
  const main = navFor(p.csqlPlural, p.waiting);
  const admin = p.role === "ADMIN" || p.role === "REVOPS";
  return (
    <>
      {/* Desktop: the green top navigation bar. */}
      <header className="sticky top-0 z-30 hidden h-14 items-center gap-2 bg-brand-strong px-6 lg:flex">
        <Link href="/" className="mr-4 flex items-center gap-2.5 text-white">
          <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-[6px] bg-white text-meta font-semibold text-brand">
            {p.logoText}
          </span>
          <span className="text-body font-semibold">{p.orgName}</span>
        </Link>
        <nav aria-label="Main" className="flex items-stretch">
          {main.map((item) => {
            const on = isActive(path, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={on ? "page" : undefined}
                className={cx("flex h-14 items-center gap-2 border-b-[3px] px-3 text-body", on ? "border-white font-medium text-white" : "border-transparent text-white/85 hover:text-white")}
              >
                {item.label}
                {item.badge ? <span className="num rounded-full bg-white px-1.5 text-meta leading-5 font-semibold text-brand">{item.badge}</span> : null}
              </Link>
            );
          })}
          {admin ? <AdminMenu path={path} /> : null}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <form action="/search" role="search" className="relative">
            <label htmlFor="global-search" className="sr-only">
              Search accounts
            </label>
            <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-white/80" />
            <input
              id="global-search"
              name="q"
              placeholder="Search accounts"
              className="h-9 w-64 rounded-control border border-white/25 bg-white/10 pr-3 pl-9 text-table text-white placeholder:text-white/75 focus:border-white focus:bg-white focus:text-text focus:placeholder:text-faint focus:outline-none"
            />
          </form>
          <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-control text-white hover:bg-white/10" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
            <Bell size={20} aria-hidden />
            {p.unread ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-[#ffb4a8] ring-2 ring-brand-strong" /> : null}
          </Link>
          <UserMenu user={p.user} roleLabel={p.roleLabel} onDark />
        </div>
      </header>

      {/* Phones and small tablets */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-brand-strong px-4 lg:hidden">
        <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-[6px] bg-white text-meta font-semibold text-brand">
          {p.logoText}
        </span>
        <span className="flex-1 truncate text-body font-semibold text-white">{p.orgName}</span>
        <Link href="/search" className="inline-flex size-9 items-center justify-center rounded-control text-white" aria-label="Search">
          <MagnifyingGlass size={20} aria-hidden />
        </Link>
        <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-control text-white" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
          <Bell size={20} aria-hidden />
        </Link>
        <UserMenu user={p.user} roleLabel={p.roleLabel} onDark />
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-surface lg:hidden">
        {main.map((item) => {
          const on = isActive(path, item);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-meta", on ? "font-semibold text-brand" : "text-muted")}>
              <Icon size={20} weight={on ? "fill" : "regular"} aria-hidden />
              {item.label}
              {item.badge ? <span aria-hidden className="absolute top-1.5 right-[28%] size-2 rounded-full bg-brand" /> : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
