"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { CalendarCheck, Inbox, Clock3, HeartHandshake, SlidersHorizontal, Search, Menu, ChevronsUpDown, X } from "lucide-react";
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
  { group: "Workspace", items: [
    { href: "/today", label: "Today", icon: CalendarCheck, count: "today" },
    { href: "/enquiries", label: "Enquiries", icon: Inbox, count: "enquiries" },
    { href: "/follow-ups", label: "Quote follow-ups", icon: Clock3, count: "followups" },
    { href: "/referrals", label: "Referrals and reviews", icon: HeartHandshake, count: "referrals" },
  ] },
  { group: "Settings", items: [{ href: "/settings", label: "House rules", icon: SlidersHorizontal }] },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const counts = useCounts() as Record<string, number>;
  const { ready } = useStore();
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {NAV.map((g) => (
        <div key={g.group} className="mb-5">
          <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = path.startsWith(i.href);
              const n = "count" in i ? counts[i.count] : undefined;
              return (
                <li key={i.href}>
                  <Link href={i.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40",
                      active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900")}>
                    <i.icon className={cn("size-[18px]", active ? "text-brand-600" : "text-gray-400")} strokeWidth={1.75} aria-hidden />
                    <span className="flex-1 truncate">{i.label}</span>
                    {n != null && ready ? <span className="rounded-md border border-gray-200 bg-white px-1.5 text-[11px] font-medium tabular-nums text-gray-500">{n}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { rules } = useStore();
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-4">
        <span className="grid size-7 place-items-center rounded-md bg-brand-600 text-[12px] font-semibold text-white" aria-hidden>WE</span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-semibold text-gray-900">Wedding Enquiries</p>
          <p className="truncate text-[11px] text-gray-500">Tool 03 · Wedding planners</p>
        </div>
      </div>
      <NavList onNavigate={onNavigate} />
      <button type="button" className="m-3 flex items-center gap-2.5 rounded-md border border-gray-200 px-2.5 py-2 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40" aria-label={`Workspace: ${rules.company.name}`}>
        <span className="grid size-7 place-items-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600" aria-hidden>{initials(rules.team[0].name)}</span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium text-gray-900">{rules.team[0].name}</span>
          <span className="block truncate text-[11px] text-gray-500">{rules.company.name}</span>
        </span>
        <ChevronsUpDown className="size-4 text-gray-400" aria-hidden />
      </button>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const ref = React.useRef<HTMLInputElement>(null);
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const { rules } = useStore();
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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 lg:px-8">
      <button type="button" onClick={onMenu} className="grid size-8 place-items-center rounded-md text-gray-600 hover:bg-gray-100 lg:hidden" aria-label="Open navigation"><Menu className="size-[18px]" /></button>
      <label className="relative flex h-8 w-full max-w-80 items-center">
        <span className="sr-only">Search enquiries</span>
        <Search className="pointer-events-none absolute left-2.5 size-4 text-gray-400" aria-hidden />
        <input ref={ref} id="search" aria-label="Search enquiries" type="search" value={q} onChange={(e) => go(e.target.value)} placeholder="Search couples, venues, handles…" autoComplete="off"
          className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 pl-8 pr-10 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/15" />
        <kbd className="pointer-events-none absolute right-2 rounded border border-gray-200 bg-white px-1 font-sans text-[11px] text-gray-400">⌘K</kbd>
      </label>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden rounded-md bg-accent px-2 py-0.5 text-[12px] font-medium text-gray-900 sm:inline">Demo data</span>
        <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-[11px] font-semibold text-white" title={rules.team[0].name} aria-label={`Signed in as ${rules.team[0].name}`}>{initials(rules.team[0].name)}</span>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = React.useState(false);
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-gray-200 bg-white lg:flex" data-testid="sidebar"><SidebarBody /></aside>
      <Dialog.Root open={menu} onOpenChange={setMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-gray-900/20 lg:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white shadow-xl lg:hidden">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Close className="absolute right-2 top-3 grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100" aria-label="Close navigation"><X className="size-4" /></Dialog.Close>
            <SidebarBody onNavigate={() => setMenu(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="lg:pl-60">
        <React.Suspense><TopBar onMenu={() => setMenu(true)} /></React.Suspense>
        <main id="main" className="min-w-0 mx-auto max-w-[1280px] px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ crumbs, title, subtitle, actions }: { crumbs: string[]; title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-gray-500">{crumbs.join(" / ")}</p>
        <h1 className="mt-1 text-[20px] font-semibold leading-7 tracking-[-0.01em] text-gray-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export const Footer = () => <p className="mt-8 text-[12px] text-gray-400">Built by Mo Bamidele · Tool 03 of 30 · v0.2</p>;
