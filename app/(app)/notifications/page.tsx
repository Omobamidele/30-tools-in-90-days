import Link from "next/link";
import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listNotifications, markAllRead } from "@/services/notifications";
import { EmptyState, PageHeader, Panel } from "@/ui/page";
import { ago } from "@/ui/format";
import { cx } from "@/ui/cx";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await appCtx();
  const items = await listNotifications(ctx, 60);
  const unread = items.filter((n) => !n.readAt).length;
  // Opening the page marks everything read; the unread ones are highlighted for this visit.
  if (unread) await markAllRead(ctx);
  return (
    <>
      <PageHeader title="Notifications" meta={unread ? `${unread} new since you last looked` : "You're up to date"} />
      <Panel>
        {items.length ? (
          <ul className="divide-y divide-rule">
            {items.map((n) => (
              <li key={n.id} className={cx(!n.readAt && "bg-brand-tint")}>
                <Link href={n.link ?? "/"} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 hover:bg-sunken/60">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-body font-medium">
                      {!n.readAt ? <span aria-label="New" className="size-2 rounded-full bg-signal ring-1 ring-signal-ink" /> : null}
                      {n.title}
                    </span>
                    {n.body ? <span className="mt-0.5 block text-table text-muted">{n.body}</span> : null}
                  </span>
                  <span className="text-meta text-muted">{ago(n.createdAt, ctx.now())}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No notifications yet">You&apos;ll hear here when work is routed to you, comes back, or is close to its deadline.</EmptyState>
        )}
      </Panel>
    </>
  );
}
