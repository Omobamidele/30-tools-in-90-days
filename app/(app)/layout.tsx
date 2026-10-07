import type { CSSProperties } from "react";
import { requireActor } from "@/auth/session";
import { ROLE_LABELS } from "@/auth/policy";
import { appCtx } from "@/services/app-ctx";
import { unreadCount } from "@/services/notifications";
import { TopBar } from "@/ui/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireActor();
  const unread = await unreadCount(await appCtx());
  const { brand, terminology } = actor.org.config;
  return (
    <div style={{ "--brand": brand.primaryColor, "--accent": brand.accentColor } as CSSProperties} className="min-h-dvh pb-16 md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <TopBar
        productName={brand.productName}
        orgName={actor.org.name}
        logoText={brand.logoText}
        user={{ name: actor.name, email: actor.email }}
        roleLabel={ROLE_LABELS[actor.role]}
        role={actor.role}
        csqlPlural={terminology.csqlPlural}
        unread={unread}
      />
      <main id="main" className="mx-auto max-w-[1440px] px-4 py-6 lg:px-6">
        {children}
      </main>
    </div>
  );
}
