import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { listUsers, orphanedWork } from "@/services/users";
import { can, ROLE_LABELS } from "@/auth/policy";
import { Panel } from "@/ui/page";
import { People } from "./people";

export const metadata: Metadata = { title: "People" };

export default async function UsersPage() {
  const ctx = await appCtx();
  const [people, orphans] = await Promise.all([listUsers(ctx), orphanedWork(ctx)]);
  const admin = can(ctx.actor, "users.manage");
  return (
    <div className="flex flex-col gap-4">
      {orphans.csqls.length || orphans.signals.length ? (
        <p role="status" className="rounded-panel border border-watch/40 bg-watch-bg px-4 py-3 text-table text-watch">
          {orphans.csqls.length} open {ctx.actor.config.terminology.csqlPlural} and {orphans.signals.length} signals belong to deactivated people. A sales or CS leader should reassign them.
        </p>
      ) : null}
      <Panel title="People and roles" id="people" description={admin ? "Add people with a temporary password; they change it after signing in." : "Only admins can change people and roles."}>
        <People
          me={ctx.actor.userId}
          admin={admin}
          roles={Object.entries(ROLE_LABELS).map(([key, label]) => ({ key, label }))}
          people={people.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, status: p.status }))}
        />
      </Panel>
    </div>
  );
}
