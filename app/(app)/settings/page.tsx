import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { formatMoney } from "@/core/money";
import { Attributes, Panel } from "@/ui/page";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettings() {
  const ctx = await appCtx();
  const c = ctx.actor.config;
  const money = (m: number) => formatMoney(m, c.priceBook.currency);
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Where these come from" id="source">
        <p className="px-4 py-3 text-table text-muted">
          Branding, wording, the price book, deadlines and reasons are part of this workspace&apos;s client configuration (<span className="font-mono">config/clients/&lt;name&gt;.json</span>), validated on load. A
          consultant setting up a new company changes them there; editing them in the app is on the roadmap.
        </p>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Branding and wording" id="brand">
          <Attributes
            items={[
              { label: "Product name", value: c.brand.productName },
              {
                label: "Colours",
                value: (
                  <span className="flex items-center gap-2 font-mono">
                    <span aria-hidden className="size-4 rounded-[3px]" style={{ background: c.brand.primaryColor }} /> {c.brand.primaryColor}
                    <span aria-hidden className="ml-2 size-4 rounded-[3px] ring-1 ring-rule-strong" style={{ background: c.brand.accentColor }} /> {c.brand.accentColor}
                  </span>
                ),
              },
              { label: "Lead name", value: `${c.terminology.csql} / ${c.terminology.csqlPlural}` },
              { label: "Seats", value: c.terminology.seats },
              { label: "Usage metric", value: `${c.terminology.usageMetric} (${c.terminology.usageUnit})` },
            ]}
          />
        </Panel>
        <Panel title="Price book" id="prices" description="Used to estimate what a signal is worth.">
          <Attributes
            items={[
              { label: "Seat price", value: `${money(c.priceBook.seatPriceMinor)} a year` },
              { label: "Seat proposals", value: `At least ${c.priceBook.minSeatAddOn}, with ${c.priceBook.seatHeadroomPct}% headroom` },
              { label: "Usage tiers", value: <span className="flex flex-col">{c.priceBook.creditTiers.map((t) => <span key={t.committed} className="font-mono">{t.committed.toLocaleString("en-US")} → {money(t.priceMinor)}</span>)}</span> },
              { label: "Overage", value: `${money(c.priceBook.overagePer1000Minor)} per 1,000 ${c.terminology.usageUnit}` },
              { label: "Add-ons", value: <span className="flex flex-col">{c.priceBook.addons.map((a) => <span key={a.key}>{a.name}: {money(a.priceMinor)}</span>)}</span> },
            ]}
          />
        </Panel>
        <Panel title="Deadlines and detection" id="deadlines">
          <Attributes
            items={[
              { label: "Triage within", value: `${c.deadlines.triageBusinessDays} business days` },
              { label: "Seller responds within", value: `${c.deadlines.sellerBusinessDays} business day${c.deadlines.sellerBusinessDays === 1 ? "" : "s"}` },
              { label: "Time zone", value: ctx.actor.timezone },
              { label: "Holidays", value: c.deadlines.holidays.join(", ") || "None" },
              { label: "Stale usage after", value: `${c.detection.staleAfterDays} days` },
              { label: "Signals expire after", value: `${c.detection.expireAfterDays} days without the condition` },
              { label: "Renewal boost", value: `Within ${c.detection.renewalBoostDays} days of renewal` },
            ]}
          />
        </Panel>
        <Panel title="Reasons people choose from" id="reasons">
          <div className="grid gap-4 px-4 py-3 text-table sm:grid-cols-3">
            {[
              ["Dismissing a signal", c.dismissReasons],
              ["Returning to CS", c.returnReasons],
              ["Lost deals", c.lostReasons],
            ].map(([title, list]) => (
              <div key={title as string}>
                <p className="mb-1 font-medium">{title as string}</p>
                <ul className="list-disc pl-4 text-muted">
                  {(list as string[]).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
