import type { Metadata } from "next";
import { requireActor } from "@/auth/session";
import { Attributes, PageHeader, Panel } from "@/ui/page";
import { PasswordForm } from "./password-form";
import { BriefToggle } from "./brief-toggle";
import { appCtx } from "@/services/app-ctx";
import { getPreferences } from "@/services/preferences";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const actor = await requireActor();
  const prefs = await getPreferences(await appCtx());
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Your account" />
      <div className="flex flex-col gap-4">
        <Panel title="Profile" description="Your name, email and role are managed by an administrator in Settings.">
          <Attributes
            items={[
              { label: "Name", value: actor.name },
              { label: "Email", value: actor.email },
              { label: "Role", value: actor.org.config.roles.labels[actor.role] },
              { label: "Organisation", value: actor.org.name },
            ]}
          />
        </Panel>
        <Panel title="Email" description="Alerts and approvals always reach you. The weekly summary is optional.">
          <BriefToggle initial={prefs.weeklyBrief} email={actor.email} />
        </Panel>
        <Panel title="Password" description="Changing it signs you out on every other device.">
          <PasswordForm />
        </Panel>
      </div>
    </div>
  );
}
