"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DropdownMenu as M } from "radix-ui";
import { ChevronDown, ImageSquare, LogOut, UserRound } from "@/ui/icons";
import { authClient } from "@/auth/client";
import { Avatar } from "../avatar";
import { cx } from "../cx";
import { NotificationsMenu, type NotificationView } from "./notifications-menu";
import { CommandMenu } from "./command-menu";
import { ProductMark } from "./sidebar";
import { ThreadsButton } from "./threads-button";
import { AppearanceSheet } from "./appearance-sheet";

export type ModuleLink = { label: string; href: string; hint?: string };
/** A top-level module: a direct link, or a menu of links (null = separator). */
export type Module = { label: string; match: string[]; href?: string; items?: Array<ModuleLink | null> };

function activeModule(pathname: string, m: Module) {
  return m.match.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

const tab = "relative inline-flex h-14 items-center gap-1 px-2.5 text-body whitespace-nowrap transition-colors outline-offset-[-4px]";
const underline = "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent";

export function TopNav({
  productName,
  modules,
  userName,
  userEmail,
  roleLabel,
  notifications,
  unread,
  unreadMessages,
  wallpaper,
  nav,
  actions,
}: {
  productName: string;
  modules: Module[];
  userName: string;
  userEmail: string;
  roleLabel: string;
  notifications: NotificationView[];
  unread: number;
  unreadMessages: number;
  /** Current wallpaper key (the user's choice or the organisation default). */
  wallpaper: string;
  nav: Array<{ label: string; href: string }>;
  actions: Array<{ label: string; href: string }>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <header className="on-midnight sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-white/10 bg-midnight px-3 text-on-midnight md:px-6">
      <span className="md:hidden">
        <ProductMark name={productName} size={28} />
      </span>
      <nav aria-label="Modules" className="hidden items-center lg:flex">
        {modules.map((m) => {
          const active = activeModule(pathname, m);
          const cls = cx(tab, active ? cx("font-medium text-white", underline) : "text-on-midnight-muted hover:text-white");
          if (!m.items) {
            return (
              <Link key={m.label} href={m.href!} aria-current={active ? "page" : undefined} className={cls}>
                {m.label}
              </Link>
            );
          }
          return (
            <M.Root key={m.label} modal={false}>
              <M.Trigger className={cx(cls, "data-[state=open]:text-white")}>
                {m.label}
                <ChevronDown size={14} aria-hidden className="opacity-70" />
              </M.Trigger>
              <M.Portal>
                <M.Content align="start" sideOffset={4} className="z-50 min-w-60 rounded-panel border border-rule bg-surface p-1 text-ink shadow-pop">
                  {m.items.map((it, i) =>
                    it === null ? (
                      <M.Separator key={`sep-${i}`} className="my-1 h-px bg-rule" />
                    ) : (
                      <M.Item key={it.href} asChild>
                        <Link href={it.href} className="block rounded-control px-2.5 py-2 outline-none data-[highlighted]:bg-sunken">
                          <span className="block text-body">{it.label}</span>
                          {it.hint ? <span className="block text-meta text-faint">{it.hint}</span> : null}
                        </Link>
                      </M.Item>
                    ),
                  )}
                </M.Content>
              </M.Portal>
            </M.Root>
          );
        })}
      </nav>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1 lg:flex-none">
        <div className="mr-1 min-w-0 flex-1 lg:w-64 lg:flex-none">
          <CommandMenu nav={nav} actions={actions} />
        </div>
        <ThreadsButton unread={unreadMessages} />
        <NotificationsMenu items={notifications} unread={unread} />
        <M.Root modal={false}>
          <M.Trigger className="ml-1 flex items-center gap-2 rounded-control p-1 hover:bg-white/10" aria-label={`${userName}, account menu`}>
            <Avatar name={userName} size={28} />
          </M.Trigger>
          <M.Portal>
            <M.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-panel border border-rule bg-surface p-1 text-ink shadow-pop">
              <div className="px-2.5 py-2">
                <p className="text-body font-medium">{userName}</p>
                <p className="truncate text-meta text-faint">{userEmail}</p>
                <p className="text-meta text-faint">{roleLabel}</p>
              </div>
              <M.Separator className="my-1 h-px bg-rule" />
              <M.Item asChild>
                <Link href="/account" className="flex items-center gap-2 rounded-control px-2.5 py-2 text-body outline-none data-[highlighted]:bg-sunken">
                  <UserRound size={16} aria-hidden className="text-muted" />
                  Your account
                </Link>
              </M.Item>
              <M.Item onSelect={() => setAppearanceOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-body outline-none data-[highlighted]:bg-sunken">
                <ImageSquare size={16} aria-hidden className="text-muted" />
                Appearance
              </M.Item>
              <M.Separator className="my-1 h-px bg-rule" />
              <M.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2 rounded-control px-2.5 py-2 text-body outline-none data-[highlighted]:bg-sunken">
                <LogOut size={16} aria-hidden className="text-muted" />
                Sign out
              </M.Item>
            </M.Content>
          </M.Portal>
        </M.Root>
      </div>
      <AppearanceSheet key={wallpaper} open={appearanceOpen} onOpenChange={setAppearanceOpen} current={wallpaper} />
    </header>
  );
}
