"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DropdownMenu as M } from "radix-ui";
import { authClient } from "@/auth/client";
import { Bell, ChartBar, FunnelSimple, GearSix, House, Kanban, MagnifyingGlass, SignOut, SlidersHorizontal, Target, UserCircle, Users } from "./icons";
import type { IconType } from "./icons";
import { Avatar } from "./bits";
import { cx } from "./cx";

// App frame (docs/09 rev. 4), mirroring Close: a white sidebar with plain outline icons, the
// active item as a soft grey pill, sub-items under a hairline, saved views below; a top bar with
// a wide search field. On phones, a slim top bar and a bottom navigation bar.

export function ProductMark({ text, size = 28 }: { text: string; size?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center bg-brand font-semibold text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.25), fontSize: size * 0.38 }}>
      {text}
    </span>
  );
}

type NavItem = { href: string; label: string; icon: IconType; match: string[]; badge?: number; sub?: Array<{ href: string; label: string; tab?: string }> };

function navFor(role: string, csqlPlural: string, waiting: number) {
  const home: NavItem[] = [{ href: "/", label: "Home", icon: House, match: ["/"] }];
  const work: NavItem[] = [
    {
      href: "/signals",
      label: "Signals",
      icon: Target,
      match: ["/signals"],
      badge: waiting,
      sub: [
        { href: "/signals?tab=snoozed", label: "Snoozed", tab: "snoozed" },
        { href: "/signals?tab=accepted", label: "Accepted", tab: "accepted" },
        { href: "/signals?tab=dismissed", label: "Dismissed", tab: "dismissed" },
      ],
    },
    { href: "/csqls", label: csqlPlural, icon: Kanban, match: ["/csqls"] },
    { href: "/accounts", label: "Accounts", icon: Users, match: ["/accounts"] },
  ];
  const insight: NavItem[] = [
    { href: "/results", label: "Results", icon: ChartBar, match: ["/results"] },
    ...(role === "ADMIN" || role === "REVOPS" ? [{ href: "/rules", label: "Rules", icon: SlidersHorizontal, match: ["/rules"] }] : []),
  ];
  const views = [
    { href: "/signals?due=overdue", label: "Overdue signals" },
    { href: "/accounts?signals=1", label: "Accounts with open signals" },
    { href: "/accounts?stale=1", label: "Accounts with stale usage" },
  ];
  return { home, work, insight, views, settings: role === "ADMIN" || role === "REVOPS" };
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

function UserMenu({ user, roleLabel }: { user: Props["user"]; roleLabel: string }) {
  const router = useRouter();
  return (
    <M.Root>
      <M.Trigger className="rounded-full p-0.5 hover:bg-hover" aria-label={`Account menu for ${user.name}`}>
        <Avatar name={user.name} size={30} className="ring-0" />
      </M.Trigger>
      <M.Portal>
        <M.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-panel border border-rule bg-surface p-1 text-text shadow-pop">
          <div className="px-3 py-2">
            <p className="text-body font-medium">{user.name}</p>
            <p className="text-meta text-muted">
              {roleLabel}, {user.email}
            </p>
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

function NavLink({ item, path, tab }: { item: NavItem; path: string; tab: string | null }) {
  const on = isActive(path, item);
  const Icon = item.icon;
  const exact = on && !(item.sub && tab && item.sub.some((s) => s.tab === tab));
  return (
    <li>
      <Link
        href={item.href}
        aria-current={exact ? "page" : undefined}
        className={cx("flex h-9 items-center gap-3 rounded-control px-3 text-body font-medium", exact ? "bg-sunken text-text" : "text-text hover:bg-hover")}
      >
        <Icon size={18} aria-hidden className="text-text" />
        <span className="flex-1">{item.label}</span>
        {item.badge ? <span className="num rounded-full bg-brand px-1.5 text-meta leading-5 font-semibold text-white">{item.badge}</span> : null}
      </Link>
      {on && item.sub ? (
        <ul className="mt-0.5 mb-1 ml-[21px] border-l border-rule pl-3">
          {item.sub.map((s) => {
            const subOn = path === "/signals" && tab === s.tab;
            return (
              <li key={s.href}>
                <Link href={s.href} aria-current={subOn ? "page" : undefined} className={cx("flex h-8 items-center rounded-control px-2 text-table", subOn ? "bg-sunken font-medium text-text" : "text-muted hover:bg-hover hover:text-text")}>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function Group({ items, path, tab }: { items: NavItem[]; path: string; tab: string | null }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((i) => (
        <NavLink key={i.href} item={i} path={path} tab={tab} />
      ))}
    </ul>
  );
}

export function Sidebar(p: Props) {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  const nav = navFor(p.role, p.csqlPlural, p.waiting);
  const onSettings = path === "/settings" || path.startsWith("/settings/");
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-rule bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <ProductMark text={p.logoText} size={26} />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-body font-semibold">{p.orgName}</span>
            <span className="block truncate text-meta text-faint">{p.productName}</span>
          </span>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col overflow-y-auto px-3 pt-2 pb-4">
          <Group items={nav.home} path={path} tab={tab} />
          <div className="my-3 h-px bg-rule" />
          <Group items={nav.work} path={path} tab={tab} />
          <div className="my-3 h-px bg-rule" />
          <Group items={nav.insight} path={path} tab={tab} />
          <div className="mt-6 mb-1 flex items-center justify-between px-3">
            <p className="text-meta font-semibold text-muted">Saved views</p>
            <FunnelSimple size={15} aria-hidden className="text-faint" />
          </div>
          <ul className="flex flex-col gap-0.5">
            {nav.views.map((v) => (
              <li key={v.href}>
                <Link href={v.href} className="flex h-8 items-center rounded-control px-3 text-table text-muted hover:bg-hover hover:text-text">
                  {v.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {nav.settings ? (
          <div className="border-t border-rule px-3 py-3">
            <Link href="/settings" aria-current={onSettings ? "page" : undefined} className={cx("flex h-9 items-center gap-3 rounded-control px-3 text-body font-medium", onSettings ? "bg-sunken" : "hover:bg-hover")}>
              <GearSix size={18} aria-hidden /> Settings
            </Link>
          </div>
        ) : null}
      </aside>

      {/* Top bar: wide search on the left, notifications and the account menu on the right. */}
      <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-rule bg-surface px-8 lg:flex">
        <form action="/search" role="search" className="relative w-full max-w-[620px]">
          <label htmlFor="global-search" className="sr-only">
            Search accounts
          </label>
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
          <input id="global-search" name="q" placeholder="Search accounts..." className="h-11 w-full rounded-panel border border-transparent bg-sunken pr-3 pl-11 text-body placeholder:text-faint focus:border-brand focus:bg-surface focus:outline-none" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-control text-text hover:bg-hover" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
            <Bell size={19} aria-hidden />
            {p.unread ? <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-risk ring-2 ring-surface" /> : null}
          </Link>
          <UserMenu user={p.user} roleLabel={p.roleLabel} />
        </div>
      </header>

      {/* Phones and small tablets */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-rule bg-surface px-4 lg:hidden">
        <ProductMark text={p.logoText} />
        <span className="flex-1 truncate text-body font-semibold">{p.orgName}</span>
        <Link href="/search" className="inline-flex size-9 items-center justify-center rounded-control text-text" aria-label="Search">
          <MagnifyingGlass size={20} aria-hidden />
        </Link>
        <Link href="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-control text-text" aria-label={p.unread ? `Notifications, ${p.unread} unread` : "Notifications"}>
          <Bell size={20} aria-hidden />
          {p.unread ? <span aria-hidden className="absolute top-2 right-2 size-2 rounded-full bg-risk ring-2 ring-surface" /> : null}
        </Link>
        <UserMenu user={p.user} roleLabel={p.roleLabel} />
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-surface lg:hidden">
        {[...nav.home, ...nav.work, nav.insight[0]].map((item) => {
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
