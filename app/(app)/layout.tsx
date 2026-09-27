import type { CSSProperties } from "react";
import { requireActor } from "@/auth/session";
import { term } from "@/config/terms";
import { Sidebar, type NavItem } from "@/ui/shell/sidebar";
import { TopNav, type Module } from "@/ui/shell/top-nav";
import { BottomNav } from "@/ui/shell/bottom-nav";
import { appCtx } from "@/services/app-ctx";
import { listMyNotifications } from "@/services/notifications";
import { formatDateTime } from "@/ui/format";
import { listObligations } from "@/services/obligations";
import { listChanges } from "@/services/changes";
import { unreadMessageCount } from "@/services/threads";
import { can, canApproveInternally } from "@/auth/policy";
import { isMarker } from "@/core/obligations/generate";
import { getPreferences, resolveWallpaper } from "@/services/preferences";
import { Photo } from "@/ui/photo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const { config } = actor.org;
  const ctx = await appCtx();
  const approver = canApproveInternally({ ...ctx.actor, internalApproverRoles: config.rules.internalApproverRoles });
  const [notes, mine, awaiting, unreadMessages, prefs] = await Promise.all([
    listMyNotifications(ctx, 20),
    listObligations(ctx, { ownerId: actor.userId }),
    approver ? listChanges(ctx, { statuses: ["INTERNAL_REVIEW"] }) : Promise.resolve([]),
    unreadMessageCount(ctx),
    getPreferences(ctx),
  ]);
  const wallpaper = resolveWallpaper(prefs, config.brand.defaultWallpaper);
  const now = ctx.now();
  const tasks = mine.filter((o) => !isMarker(o.kind));
  const soon = tasks.filter((o) => o.dueAt.getTime() - now.getTime() < 7 * 86_400_000).length;
  const toApprove = awaiting.filter((c) => c.createdBy !== actor.userId).length;
  const events = term(config, "event", { plural: true });
  const changes = term(config, "changeRequest", { plural: true });
  const canCreate = can(ctx.actor, "event.create");
  const admin = actor.role === "ADMIN" || actor.role === "MD";

  const nav: NavItem[] = [
    { href: "/", label: "Overview", icon: "overview" },
    { href: "/events", label: events, icon: "events" },
    { href: "/deadlines", label: "Deadlines", icon: "deadlines", count: soon },
    { href: toApprove ? "/changes?view=approve" : "/changes", label: changes, icon: "changes", count: toApprove },
    { href: "/clients", label: term(config, "client", { plural: true }), icon: "clients" },
    { href: "/suppliers", label: term(config, "supplier", { plural: true }), icon: "suppliers" },
    { href: "/reports", label: "Reports", icon: "reports" },
  ];

  // Top module bar (Bitrix-style structure): each module opens a menu of its views.
  const modules: Module[] = [
    { label: "Overview", href: "/", match: ["/"] },
    {
      label: events,
      match: ["/events"],
      items: [
        { label: "Pipeline board", href: "/events?layout=board", hint: "Drag events between stages" },
        { label: "List", href: "/events?layout=list", hint: "Sortable table of every event" },
        { label: "Calendar", href: "/events?layout=calendar", hint: "Month view of event dates" },
        ...(canCreate ? [null, { label: `New ${term(config, "event", { lower: true })}`, href: "/events/new" }] : []),
      ],
    },
    {
      label: "Deadlines",
      match: ["/deadlines"],
      items: [
        { label: "Deadlines board", href: "/deadlines?layout=board", hint: "Overdue, this week, next two weeks" },
        { label: "My deadlines", href: "/deadlines", hint: "Everything you own" },
        { label: "Everyone's deadlines", href: "/deadlines?who=all" },
        { label: "Calendar", href: "/deadlines?layout=calendar" },
      ],
    },
    {
      label: changes,
      match: ["/changes"],
      items: [
        { label: "Change board", href: "/changes?layout=board", hint: "From draft to applied" },
        { label: "All change requests", href: "/changes" },
        ...(approver ? [{ label: "Awaiting my approval", href: "/changes?view=approve" }] : []),
      ],
    },
    {
      label: "Money",
      match: ["/reports", "/value"],
      items: [
        { label: "Money protected", href: "/value", hint: "What your team's recorded decisions saved" },
        null,
        { label: "Exposure by client", href: "/reports?r=exposure" },
        { label: "Payments schedule", href: "/reports?r=payments" },
        { label: "Projected vs actual penalties", href: "/reports?r=penalties" },
        { label: "Decisions", href: "/reports?r=decisions" },
      ],
    },
    {
      label: "Directory",
      match: ["/clients", "/suppliers", "/contracts"],
      items: [
        { label: term(config, "client", { plural: true }), href: "/clients", hint: "Agreements and liability rules" },
        { label: term(config, "supplier", { plural: true }), href: "/suppliers", hint: "Hotels, venues, caterers, AV" },
      ],
    },
    {
      label: "More",
      match: ["/settings", "/account"],
      items: [...(admin ? [{ label: "Settings", href: "/settings" }] : []), { label: "Your account", href: "/account" }],
    },
  ];


  return (
    <div
      data-canvas={wallpaper ? "photo" : "plain"}
      // Photo mode sits on midnight, so if the photo fails to load, light text still reads.
      className={wallpaper ? "relative flex min-h-dvh bg-midnight" : "relative flex min-h-dvh bg-canvas"}
      style={{ "--brand": config.brand.primaryColor, "--accent": config.brand.accentColor } as CSSProperties}
    >
      {wallpaper ? (
        // The chosen venue photo, fixed behind the page under a midnight scrim (docs/09 § Photography).
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <Photo photo={wallpaper} sizes="100vw" priority />
          <div className="absolute inset-0" style={{ background: "var(--scrim-page)" }} />
        </div>
      ) : null}
      <Sidebar productName={config.brand.productName} orgName={actor.org.name} items={nav} showSettings={admin} demo={config.demo} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopNav
          productName={config.brand.productName}
          modules={modules}
          userName={actor.name}
          userEmail={actor.email}
          roleLabel={config.roles.labels[actor.role]}
          unread={notes.unread}
          unreadMessages={unreadMessages}
          wallpaper={prefs.wallpaper ?? config.brand.defaultWallpaper}
          nav={nav.map((n) => ({ label: n.label, href: n.href }))}
          actions={[
            ...(canCreate ? [{ label: `New ${term(config, "event", { lower: true })}`, href: "/events/new" }] : []),
            ...(can(ctx.actor, "client.edit") ? [{ label: `New ${term(config, "client", { lower: true })}`, href: "/clients/new" }] : []),
            { label: "Pipeline board", href: "/events?layout=board" },
            { label: "My deadlines", href: "/deadlines" },
            { label: "Your account", href: "/account" },
          ]}
          notifications={notes.rows.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, kind: n.kind, read: n.readAt !== null, when: formatDateTime(n.createdAt, actor.org.timezone) }))}
        />
        <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-10 md:pt-10 md:pb-12">{children}</main>
      </div>
      <BottomNav items={nav} productName={config.brand.productName} />
    </div>
  );
}
