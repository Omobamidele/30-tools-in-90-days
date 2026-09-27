"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { Bell } from "@/ui/icons";
import { markReadAction } from "../../../app/(app)/alerts/actions";
import { cx } from "../cx";

export type NotificationView = { id: string; title: string; body: string | null; link: string | null; when: string; read: boolean; kind: string };

export function NotificationsMenu({ items, unread }: { items: NotificationView[]; unread: number }) {
  const router = useRouter();
  return (
    <Popover.Root>
      <Popover.Trigger
        className="relative rounded-control p-2 text-on-midnight-muted hover:bg-white/10 hover:text-white"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell size={18} aria-hidden />
        {unread ? (
          <span className="num absolute top-0.5 right-0.5 min-w-4 rounded-full bg-risk px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-midnight">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[min(92vw,380px)] panel shadow-pop">
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <p className="text-table font-semibold">Notifications</p>
            {unread ? (
              <button
                type="button"
                className="text-meta text-brand hover:underline"
                onClick={async () => {
                  await markReadAction();
                  router.refresh();
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-table text-muted">Nothing yet. Reminders and alerts appear here.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-rule overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <>
                    <p className={cx("text-table", !n.read && "font-semibold")}>{n.title}</p>
                    {n.body ? <p className="truncate text-meta text-muted">{n.body}</p> : null}
                    <p className="text-meta text-faint">{n.when}</p>
                  </>
                );
                return (
                  <li key={n.id} className={cx(!n.read && "bg-sunken/60")}>
                    {n.link ? (
                      <Popover.Close asChild>
                        <Link
                          href={n.link}
                          className="block px-3 py-2 hover:bg-sunken"
                          onClick={() => {
                            if (!n.read) void markReadAction([n.id]);
                          }}
                        >
                          {inner}
                        </Link>
                      </Popover.Close>
                    ) : (
                      <div className="px-3 py-2">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
