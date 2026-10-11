import { Suspense, type CSSProperties } from "react";
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
    <div style={{ "--brand": brand.primaryColor } as CSSProperties} className="min-h-dvh bg-canvas pb-16 lg:pb-0 lg:pl-[264px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Suspense>
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
      </Suspense>
      {/* Pages open with a white header band (PageHeader) that bleeds to these edges. */}
      <main id="main" className="px-4 pb-10 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
