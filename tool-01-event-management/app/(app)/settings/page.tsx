import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { getSettings, integrationStatus, listUsers } from "@/services/settings";
import { listFx } from "@/services/fx";
import { can } from "@/auth/policy";
import { PageHeader } from "@/ui/page";
import { SettingsForms } from "./forms";

export const metadata: Metadata = { title: "Settings" };

const NAV = [
  ["organisation", "Organisation"],
  ["branding", "Branding"],
  ["terminology", "Terminology"],
  ["workflow", "Event types"],
  ["rules", "Reminders and escalation"],
  ["pricing", "Pricing rules"],
  ["terms", "Term defaults"],
  ["currencies", "Currencies"],
  ["fx", "Exchange rates"],
  ["email", "Email"],
  ["extraction", "Term extraction"],
  ["users", "Users and roles"],
  ["integrations", "Integrations"],
] as const;

export default async function SettingsPage() {
  const ctx = await appCtx();
  if (!can(ctx.actor, "settings.view")) redirect("/");
  const [{ org, config }, users, fx, status] = await Promise.all([getSettings(ctx), listUsers(ctx), listFx(ctx), integrationStatus(ctx)]);
  const canEdit = can(ctx.actor, "settings.edit");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Settings" meta={canEdit ? "Changes apply to everyone in this workspace and are recorded in the activity log." : "You can view settings. Only admins can change them."} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="panel sticky top-20 flex flex-col gap-0.5 p-2 text-table">
            {NAV.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-control px-2.5 py-1.5 text-muted hover:bg-sunken hover:text-ink">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <SettingsForms
          config={config}
          org={{ name: org.name, timezone: org.timezone, baseCurrency: org.baseCurrency }}
          users={users}
          fx={fx.map((r) => ({ fromCcy: r.fromCcy, toCcy: r.toCcy, rate: r.rate, asOf: r.asOf }))}
          status={status}
          canEdit={canEdit}
          timezones={Intl.supportedValuesOf("timeZone")}
          meId={ctx.actor.userId}
        />
      </div>
    </div>
  );
}
