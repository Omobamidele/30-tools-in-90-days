"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  CalendarRange,
  AlarmClock,
  GitPullRequestArrow,
  Building2,
  Truck,
  FileBarChart,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type IconType,
} from "@/ui/icons";
import { cx } from "../cx";

const icons: Record<string, IconType> = {
  overview: LayoutDashboard,
  events: CalendarRange,
  deadlines: AlarmClock,
  changes: GitPullRequestArrow,
  clients: Building2,
  suppliers: Truck,
  reports: FileBarChart,
  settings: Settings,
};

export type NavItem = { href: string; label: string; icon: keyof typeof icons; count?: number };

function isActive(pathname: string, fullHref: string) {
  const href = fullHref.split("?")[0];
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const KEY = "er.rail.expanded";
const EVT = "er-rail";

// Rail state lives in localStorage; useSyncExternalStore keeps SSR (collapsed) and client in step.
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVT, cb);
  };
}
function readExpanded() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: stay collapsed
  }
}

/**
 * Left rail: icons only by default; "Expand menu" overlays a labelled panel on top of the page
 * (the page never reflows). The choice is remembered per browser; storage may be unavailable.
 */
export function Sidebar({
  productName,
  orgName,
  items,
  showSettings,
  demo,
}: {
  productName: string;
  orgName: string;
  items: NavItem[];
  showSettings: boolean;
  demo: boolean;
}) {
  const pathname = usePathname();
  const expanded = useSyncExternalStore(subscribe, readExpanded, () => false);
  const toggle = (next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* storage blocked: the toggle still works for this page view */
    }
    window.dispatchEvent(new Event(EVT));
  };
  const all: NavItem[] = showSettings ? [...items, { href: "/settings", label: "Settings", icon: "settings" }] : items;

  return (
    <div className="relative hidden w-16 shrink-0 md:block">
      {expanded ? <div aria-hidden className="fixed inset-0 z-30 bg-ink/20" onClick={() => toggle(false)} /> : null}
      <nav
        aria-label="Main"
        className={cx(
          "on-midnight fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-midnight text-on-midnight transition-[width] duration-150",
          expanded ? "w-60 shadow-pop" : "w-16",
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-4">
          <ProductMark name={productName} size={28} />
          <div className={cx("min-w-0", expanded ? "" : "sr-only")}>
            <p className="truncate font-display text-section text-white">{productName}</p>
            <p className="truncate text-meta text-on-midnight-muted">{orgName}</p>
          </div>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
          {all.map((item) => {
            const Icon = icons[item.icon];
            const active = isActive(pathname, item.href);
            const urgent = item.icon === "deadlines" || item.icon === "changes";
            return (
              <li key={item.href} className={item.href === "/settings" ? "mt-auto" : undefined}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={expanded ? undefined : item.count ? `${item.label} (${item.count})` : item.label}
                  title={expanded ? undefined : item.label}
                  onClick={() => expanded && toggle(false)}
                  className={cx(
                    "relative flex h-9 items-center gap-3 rounded-control px-[10px] text-body transition-colors",
                    active ? "bg-white/10 font-medium text-white" : "text-on-midnight-muted hover:bg-white/5 hover:text-white",
                  )}
                >
                  {active ? <span aria-hidden className="absolute top-2 bottom-2 -left-2.5 w-[3px] rounded-r-full bg-accent" /> : null}
                  <Icon size={20} weight={active ? "fill" : "regular"} aria-hidden className={cx("shrink-0", active && "text-accent")} />
                  <span className={cx("flex-1 truncate whitespace-nowrap", expanded ? "" : "sr-only")}>{item.label}</span>
                  {item.count ? (
                    expanded ? (
                      <span className={cx("num rounded-full px-1.5 text-meta leading-5 font-medium", urgent ? "bg-risk text-white" : "bg-white/15 text-white")}>{item.count}</span>
                    ) : (
                      <span aria-hidden className={cx("absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-midnight", urgent ? "bg-[#f97066]" : "bg-accent")} />
                    )
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-white/10 p-2.5">
          {demo ? (
            <p className={cx("mb-1 flex items-center gap-2 px-[10px] py-1 text-meta text-on-midnight-muted", expanded ? "" : "justify-center")} title="Demo data">
              <span aria-hidden className="inline-block size-1.5 rounded-full bg-watch" />
              <span className={expanded ? "" : "sr-only"}>Demo data</span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => toggle(!expanded)}
            aria-expanded={expanded}
            className="flex h-9 w-full items-center gap-3 rounded-control px-[10px] text-on-midnight-muted hover:bg-white/5 hover:text-white"
          >
            {expanded ? <PanelLeftClose size={18} aria-hidden /> : <PanelLeftOpen size={18} aria-hidden />}
            <span className={cx("text-body whitespace-nowrap", expanded ? "" : "sr-only")}>{expanded ? "Collapse menu" : "Expand menu"}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

/** Square monogram in the org's accent colour (midnight text, 6.4:1 by default): the white-labelled product mark. */
export function ProductMark({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-[7px] bg-accent font-display font-semibold text-midnight"
    >
      {initials}
    </span>
  );
}
