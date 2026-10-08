"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { authClient } from "@/auth/client";
import { Bell, CaretDown, ChartBar, GearSix, House, Kanban, MagnifyingGlass, SignOut, SlidersHorizontal, Target, UserCircle, Users } from "./icons";
import type { IconType } from "./icons";
import { Avatar } from "./bits";
import { cx } from "./cx";

// App frame (docs/09 rev. 2): a light left sidebar like the CRMs people pay for. On phones, a
// slim top bar and a bottom navigation bar.

export function ProductMark({ text, size = 28 }: { text: string; size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center bg-brand font-semibold text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), fontSize: size * 0.38 }}>
      {text}
    </span>
  );
}

type NavItem = { href: string; label: string; icon: IconType; match: string[]; badge?: number };

function navFor(role: string, csqlPlural: string, waiting: number) {
  const main: NavItem[] = [
    { href: "/", label: "Home", icon: House, match: ["/"] },
    { href: "/signals", label: "Signals", icon: Target, match: ["/signals"], badge: waiting },
    { href: "/csqls", label: csqlPlural, icon: Kanban, match: ["/csqls"] },
    { href: "/accounts", label: "Accounts", icon: Users, match: ["/accounts"] },
    { href: "/results", label: "Results", icon: ChartBar, match: ["/results"] },
  ];
  const admin: NavItem[] =
    role === "ADMIN" || role === "REVOPS"
      ? [
          { href: "/rules", label: "Rules", icon: SlidersHorizontal, match: ["/rules"] },
          { href: "/settings", label: "Settings", icon: GearSix, match: ["/settings"] },
        ]
      : [];
  return { main, admin };
}

const isActive = (path: string, item: NavItem) => item.match.some((m) => (m === "/" ? path === "/" : path === m || path.startsWith(`${m}/`)));

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

function UserMenu({ user, roleLabel, compact = false }: { user: Props["user"]; roleLabel: string; compact?: boolean }) {
  const router = useRouter();
  return (
    <M.Root>
      <M.Trigger className={cx("flex items-center gap-2.5 rounded-control text-left hover:bg-hover", compact ? "p-1" : "w-full px-2 py-1.5")} aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} size={compact ? 28 : 30} className="ring-0" />
        {compact ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-table font-medium">{user.name}</span>
              <span className="block truncate text-meta text-faint">{roleLabel}</span>
            </span>
            <CaretDown size={14} aria-hidden className="text-faint" />
          </>
        )}
      </M.Trigger>
      <M.Portal>
        <M.Content align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} sideOffset={6} className="z-50 min-w-60 rounded-panel border border-rule bg-surface p-1 text-text shadow-pop">
          <div className="px-3 py-2">
            <p className="text-body font-medium">{user.name}</p>
            <p className="text-meta text-muted">{user.email}</p>
          </div>
          <M.Separator className="my-1 h-px bg-rule" />
          <M.Item asChild className="flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body outline-none data-[highlighted]:bg-hover">
            <Link href="/account">
              <UserCircle size={16} aria-hidden /> Your account
            </Link>
          </M.Item>
          <M.Item
            className="flex cursor-pointer items-center gap-2 rounded-control px-3 py-2 text-body outline-none data-[highlighted]:bg-hover"
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

function NavLink({ item, path }: { item: NavItem; path: string }) {
  const on = isActive(path, item);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={cx("flex h-8 items-center gap-2.5 rounded-control px-2.5 text-body", on ? "bg-surface font-medium text-text shadow-card ring-1 ring-rule" : "text-muted hover:bg-hover hover:text-text")}
    >
      <Icon size={17} weight={on ? "fill" : "regular"} aria-hidden className={on ? "text-brand" : ""} />
      <span className="flex-1">{item.label}</span>
      {item.badge ? <span className="num rounded-full bg-brand px-1.5 text-meta leading-5 font-semibold text-white">{item.badge}</span> : null}
    </Link>
  );
}

export function Sidebar(p: Props) {
  const path = usePathname();
  const { main, admin } = navFor(p.role, p.csqlPlural, p.waiting);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-rule bg-sidebar lg:flex">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <ProductMark text={p.logoText} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-body font-semibold">{p.orgName}</span>
            <span className="block truncate text-meta text-faint">{p.productName}</span>
          </span>
        </div>
        <div className="flex gap-1 px-3 pb-3">
          <form action="/search" role="search" className="relative flex-1">
            <label htmlFor="global-search" className="sr-only">
              Search accounts
            </label>
            <MagnifyingGlass size={15} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
            <input id="global-search" name="q" placeholder="Search" className="h-8 w-full rounded-control border border-rule-strong bg-surface pr-2 pl-8 text-table placeholder:text-faint focus:border-brand focus:outline-none" />
          </form>
          <Link href="/notifications" className="relative inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-text" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
            <Bell size={18} aria-hidden />
            {p.unread ? <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-risk ring-2 ring-sidebar" /> : null}
          </Link>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {main.map((i) => (
            <NavLink key={i.href} item={i} path={path} />
          ))}
          {admin.length ? (
            <>
              <p className="mt-5 mb-1 px-2.5 text-meta font-medium text-faint">Admin</p>
              {admin.map((i) => (
                <NavLink key={i.href} item={i} path={path} />
              ))}
            </>
          ) : null}
        </nav>
        <div className="border-t border-rule p-2">
          <UserMenu user={p.user} roleLabel={p.roleLabel} />
        </div>
      </aside>

      {/* Phones and small tablets */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-rule bg-surface px-4 lg:hidden">
        <ProductMark text={p.logoText} />
        <span className="flex-1 truncate text-body font-semibold">{p.orgName}</span>
        <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-control text-muted" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
          <Bell size={20} aria-hidden />
          {p.unread ? <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-risk ring-2 ring-surface" /> : null}
        </Link>
        <UserMenu user={p.user} roleLabel={p.roleLabel} compact />
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-surface lg:hidden">
        {main.map((item) => {
          const on = isActive(path, item);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cx("relative flex flex-col items-center gap-0.5 py-2 text-meta", on ? "font-medium text-brand" : "text-muted")}>
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
