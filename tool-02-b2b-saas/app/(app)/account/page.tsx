import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { appCtx } from "@/services/app-ctx";
import { requireActor } from "@/auth/session";
import { ROLE_LABELS } from "@/auth/policy";
import { users } from "@/db/schema";
import { Attributes, PageHeader, Panel } from "@/ui/page";
import { AccountForms } from "./forms";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const ctx = await appCtx();
  const actor = await requireActor();
  const [u] = await ctx.db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.actor.userId));
  const prefs = u.preferences as { emailNotifications?: boolean; digest?: boolean };
  return (
    <>
      <PageHeader title="Your account" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Profile" id="profile">
          <Attributes
            items={[
              { label: "Name", value: actor.name },
              { label: "Email", value: actor.email },
              { label: "Role", value: ROLE_LABELS[actor.role] },
              { label: "Workspace", value: actor.org.name },
            ]}
          />
        </Panel>
        <AccountForms emailNotifications={prefs.emailNotifications !== false} digest={prefs.digest !== false} />
      </div>
    </>
  );
}
