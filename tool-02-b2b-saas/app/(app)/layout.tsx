import type { CSSProperties } from "react";
import { requireActor } from "@/auth/session";
import { ROLE_LABELS } from "@/auth/policy";
import { appCtx } from "@/services/app-ctx";
import { unreadCount } from "@/services/notifications";
import { countWaiting } from "@/services/signals";
import { Sidebar } from "@/ui/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const ctx = await appCtx();
  const [unread, waiting] = await Promise.all([unreadCount(ctx), countWaiting(ctx)]);
  const { brand, terminology } = actor.org.config;
  return (
    <div style={{ "--brand": brand.primaryColor } as CSSProperties} className="min-h-dvh pb-16 lg:pb-0 lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar
        productName={brand.productName}
        orgName={actor.org.name}
        logoText={brand.logoText}
        user={{ name: actor.name, email: actor.email }}
        roleLabel={ROLE_LABELS[actor.role]}
        role={actor.role}
        csqlPlural={terminology.csqlPlural}
        unread={unread}
        waiting={waiting}
      />
      <main id="main" className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {children}
      </main>
    </div>
  );
}
