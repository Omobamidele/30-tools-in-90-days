"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { CalendarCheck, Inbox, Clock3, HeartHandshake, SlidersHorizontal, Search, Menu, X } from "@/components/icons";
import { useStore } from "@/lib/store";
import { R } from "@/lib/view";
import { cn } from "./ui/cn";
import { initials } from "@/lib/format";

function useCounts() {
  const { data, now, rules } = useStore();
  const q = R.actionQueue(data, now, rules);
  return {
    today: q.length,
    enquiries: data.enquiries.filter((e) => R.OPEN_STATUSES.includes(e.status)).length,
    followups: data.enquiries.filter((e) => e.status === "Quote sent").length,
    referrals: q.filter((a: { kind: string }) => a.kind === "thank-you" || a.kind === "review-nudge").length,
  };
}

const NAV = [
  [
    { href: "/today", label: "Today", icon: CalendarCheck, count: "today" },
    { href: "/enquiries", label: "Enquiries", icon: Inbox, count: "enquiries" },
    { href: "/follow-ups", label: "Quote follow-ups", icon: Clock3, count: "followups" },
    { href: "/referrals", label: "Referrals", icon: HeartHandshake, count: "referrals" },
  ],
  [{ href: "/settings", label: "House rules", icon: SlidersHorizontal }],
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const counts = useCounts() as Record<string, number>;
  const { ready } = useStore();
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
      {NAV.map((g, gi) => (
        <ul key={gi} className={cn("space-y-0.5", gi > 0 && "mt-3 border-t border-rail-active pt-3")}>
          {g.map((i) => {
            const active = path.startsWith(i.href);
            const n = "count" in i ? counts[i.count] : undefined;
            return (
              <li key={i.href}>
                <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                  className={cn("relative flex h-9 items-center gap-3 rounded-control px-3 text-[14px] focus-visible:outline-white",
                    active ? "bg-rail-active font-semibold text-white" : "text-rail-fg hover:bg-rail-hover hover:text-white")}>
                  {active ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-pill bg-brand" aria-hidden /> : null}
                  <i.icon className="size-[18px] shrink-0" weight={active ? "bold" : "regular"} aria-hidden />
                  <span className="flex-1 truncate">{i.label}</span>
                  <span className="min-w-4 text-right text-[13px] text-rail-muted">{n != null && ready ? n : ""}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { rules } = useStore();
  return (
    <>
      <div className="flex h-16 items-center gap-3 px-5">
        <span className="grid size-8 shrink-0 place-items-center rounded-control bg-brand text-[13px] font-bold text-white" aria-hidden>WE</span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold text-white">Wedding Enquiries</p>
          <p className="truncate text-[13px] text-rail-muted">{rules.company.name}</p>
        </div>
      </div>
      <NavList onNavigate={onNavigate} />
      <div className="flex items-center gap-3 border-t border-rail-active px-5 py-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-rail-active text-[13px] font-semibold text-white" aria-hidden>{initials(rules.team[0].name)}</span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[14px] font-medium text-white">{rules.team[0].name}</span>
          <span className="block truncate text-[13px] text-rail-muted">Signed in</span>
        </span>
      </div>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const ref = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState(params.get("q") ?? "");
  React.useEffect(() => { setQ(params.get("q") ?? ""); }, [params]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes((document.activeElement as HTMLElement)?.tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (v: string) => {
    setQ(v);
    const sp = new URLSearchParams(path === "/enquiries" ? params.toString() : "");
    if (v) sp.set("q", v); else sp.delete("q");
    if (path !== "/enquiries") sp.set("view", "all");
    sp.delete("open");
    router.replace(`/enquiries?${sp.toString()}`, { scroll: false });
  };
  return (
    <header className="flex h-16 items-center gap-3 px-4 sm:px-8">
      <button type="button" onClick={onMenu} className="grid size-9 place-items-center rounded-control text-ink hover:bg-sunken lg:hidden" aria-label="Open navigation"><Menu className="size-5" /></button>
      <label className="relative flex h-9 w-full max-w-72 items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden />
        <input ref={ref} id="search" aria-label="Search enquiries" type="search" value={q} onChange={(e) => go(e.target.value)} placeholder="Search" autoComplete="off"
          className="h-9 w-full rounded-pill bg-sunken pl-9 pr-10 text-[14px] text-ink placeholder:text-muted focus:bg-surface focus:outline-none focus:ring-1 focus:ring-line-strong" />
        <kbd className="pointer-events-none absolute right-3 font-sans text-[13px] text-muted">/</kbd>
      </label>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = React.useState(false);
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col bg-rail lg:flex" data-testid="sidebar"><SidebarBody /></aside>
      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/30 lg:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col bg-rail shadow-overlay lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close className="absolute right-3 top-4 grid size-8 place-items-center rounded-control text-rail-fg hover:bg-rail-hover" aria-label="Close navigation"><X className="size-4" /></Dialog.Close>
            <SidebarBody onNavigate={() => setMenu(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="lg:pl-[232px]">
        <React.Suspense><TopBar onMenu={() => setMenu(true)} /></React.Suspense>
        <main id="main" className="mx-auto min-w-0 max-w-[1240px] px-4 pb-10 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

/** Big title left, actions right, then optional underlined tabs: the HoneyBook page header. */
export function PageHeader({ title, subtitle, actions, tabs }: { crumbs?: string[]; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; tabs?: React.ReactNode }) {
  return (
    <div className={cn("mb-6 pt-2", tabs && "border-b border-line")}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-9 text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 max-w-3xl text-[15px] leading-6 text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-5">{tabs}</div> : null}
    </div>
  );
}

export const Footer = () => <p className="mt-10 text-[13px] text-muted">Built by Mo Bamidele. Tool 03 of 30, v0.3.</p>;
