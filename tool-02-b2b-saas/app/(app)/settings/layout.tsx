import { redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { can } from "@/auth/policy";
import { PageHeader } from "@/ui/page";
import { SettingsNav } from "./nav";

export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const ctx = await appCtx();
  if (!can(ctx.actor, "settings.manage") && !can(ctx.actor, "users.manage")) redirect("/");
  return (
    <>
      <PageHeader title="Settings" meta="How this workspace is set up: data in, routing, and who can do what." />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
