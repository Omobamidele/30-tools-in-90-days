"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "@/ui/icons";
import type { OrgConfig, RoleKey } from "@/config/schema";
import { contrastAgainstWhite, contrastRatio, MIDNIGHT } from "@/config/schema";
import { PLAIN, WALLPAPERS } from "@/config/imagery";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { Panel } from "@/ui/page";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";
import { SettingsSectionForm } from "./section";
import { createUserAction, setUserActiveAction, setUserRoleAction, testEmailAction, upsertFxAction } from "./actions";

const ROLES: RoleKey[] = ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER", "FINANCE", "MD"];
const dec = (m: number) => (m / 100).toFixed(2);

export function SettingsForms({
  config,
  org,
  users,
  fx,
  status,
  canEdit,
  timezones,
  meId,
}: {
  config: OrgConfig;
  org: { name: string; timezone: string; baseCurrency: string };
  users: Array<{ id: string; name: string; email: string; role: RoleKey; status: string }>;
  fx: Array<{ fromCcy: string; toCcy: string; rate: string; asOf: string }>;
  status: {
    email: { driver: string; detail: string };
    extraction: { available: boolean; reason: string | null; model: string; hasKey: boolean; stats: { runs: number; succeeded: number; failed: number; proposed: number; confirmed: number; edited: number; rejected: number } };
    storage: { driver: string };
    cron: { configured: boolean };
  };
  canEdit: boolean;
  timezones: string[];
  meId: string;
}) {
  const labels = config.roles.labels;
  const roleChecks = (value: RoleKey[], set: (v: RoleKey[]) => void) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {ROLES.map((r) => (
        <label key={r} className="flex items-center gap-2 text-table">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={value.includes(r)} onChange={(e) => set(e.target.checked ? [...value, r] : value.filter((x) => x !== r))} />
          {labels[r]}
        </label>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsSectionForm id="organisation" section="organisation" title="Organisation" canEdit={canEdit} initial={{ name: org.name, timezone: org.timezone }}>
        {(v, set, fe) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation name" required error={fe("name")}>
              {(p) => <Input {...p} value={v.name} onChange={(e) => set({ name: e.target.value })} />}
            </Field>
            <Field label="Timezone" help="Used for the daily run and organisation times" error={fe("timezone")}>
              {(p) => (
                <Select {...p} value={v.timezone} onChange={(e) => set({ timezone: e.target.value })}>
                  {timezones.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              )}
            </Field>
            <p className="text-meta text-muted sm:col-span-2">Reporting currency: {org.baseCurrency}. It is set at deployment because every total is kept in it.</p>
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm id="branding" section="branding" title="Branding" description="Shown on every screen, the client approval page and emails." canEdit={canEdit} initial={{ productName: config.brand.productName, primaryColor: config.brand.primaryColor, accentColor: config.brand.accentColor, defaultWallpaper: config.brand.defaultWallpaper }}>
        {(v, set, fe) => {
          const valid = /^#[0-9a-fA-F]{6}$/.test(v.primaryColor);
          const ratio = valid ? contrastAgainstWhite(v.primaryColor) : 0;
          const accentValid = /^#[0-9a-fA-F]{6}$/.test(v.accentColor);
          const accentRatio = accentValid ? contrastRatio(v.accentColor, MIDNIGHT) : 0;
          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-4">
                <Field label="Product name" required error={fe("productName")}>
                  {(p) => <Input {...p} value={v.productName} onChange={(e) => set({ productName: e.target.value })} />}
                </Field>
                <Field
                  label="Brand colour"
                  error={fe("primaryColor") ?? (valid && ratio < 4.5 ? `Contrast ${ratio.toFixed(2)}:1 on white. At least 4.5:1 is needed for readable buttons.` : undefined)}
                  help={valid ? `Buttons and links. Contrast ${ratio.toFixed(2)}:1 on white` : "Hex, e.g. #8A5D12"}
                >
                  {(p) => (
                    <div className="flex gap-2">
                      <input type="color" aria-label="Pick brand colour" value={valid ? v.primaryColor : "#8A5D12"} onChange={(e) => set({ primaryColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded-control border border-rule-strong" />
                      <Input {...p} value={v.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="num max-w-32" />
                    </div>
                  )}
                </Field>
                <Field
                  label="Accent colour"
                  error={fe("accentColor") ?? (accentValid && accentRatio < 3 ? `Contrast ${accentRatio.toFixed(2)}:1 on the navigation bar. At least 3:1 is needed.` : undefined)}
                  help={accentValid ? `Highlights on the navigation bar and photos. Contrast ${accentRatio.toFixed(2)}:1` : "Hex, e.g. #C8912E"}
                >
                  {(p) => (
                    <div className="flex gap-2">
                      <input type="color" aria-label="Pick accent colour" value={accentValid ? v.accentColor : "#C8912E"} onChange={(e) => set({ accentColor: e.target.value.toUpperCase() })} className="h-8 w-10 rounded-control border border-rule-strong" />
                      <Input {...p} value={v.accentColor} onChange={(e) => set({ accentColor: e.target.value })} className="num max-w-32" />
                    </div>
                  )}
                </Field>
                <Field label="Default wallpaper" help="People can choose their own under Appearance." error={fe("defaultWallpaper")}>
                  {(p) => (
                    <Select {...p} value={v.defaultWallpaper} onChange={(e) => set({ defaultWallpaper: e.target.value })}>
                      <option value={PLAIN}>Plain (no photo)</option>
                      {WALLPAPERS.map((w) => (
                        <option key={w.key} value={w.key}>
                          {w.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <div
                aria-label="Preview"
                className="rounded-panel border border-rule bg-surface p-3"
                style={{ ...(valid ? { "--brand": v.primaryColor } : {}), ...(accentValid ? { "--accent": v.accentColor } : {}) } as React.CSSProperties}
              >
                <p className="mb-2 text-meta text-muted">Preview</p>
                <div className="flex overflow-hidden rounded-control border border-rule">
                  <div className="w-36 bg-midnight p-2 text-white">
                    <p className="truncate font-display text-table">{v.productName || "Product"}</p>
                    <p className="mt-2 flex items-center gap-1.5 rounded-control bg-white/10 px-2 py-1 text-table font-medium">
                      <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-accent" /> Overview
                    </p>
                  </div>
                  <div className="flex flex-1 flex-col gap-2 bg-sunken p-3">
                    <p className="border-t-4 border-brand pt-1 text-meta font-semibold">{config.email.senderName}</p>
                    <span className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-2.5 text-table font-medium text-white">Approve change</span>
                    <span className="text-table text-brand underline">A link</span>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </SettingsSectionForm>

      <SettingsSectionForm id="terminology" section="terminology" title="Terminology" description="Use the words your team uses. Changes apply everywhere." canEdit={canEdit} initial={config.terminology}>
        {(v, set, fe) => (
          <div className="grid gap-3 sm:grid-cols-2">
            {(["event", "client", "supplier", "changeRequest"] as const).map((k) => (
              <div key={k} className="grid grid-cols-2 gap-2">
                <Field label={`${config.terminology[k].singular} (singular)`} error={fe(`${k}.singular`)}>
                  {(p) => <Input {...p} value={v[k].singular} onChange={(e) => set({ [k]: { ...v[k], singular: e.target.value } } as Partial<typeof v>)} />}
                </Field>
                <Field label="Plural" error={fe(`${k}.plural`)}>
                  {(p) => <Input {...p} value={v[k].plural} onChange={(e) => set({ [k]: { ...v[k], plural: e.target.value } } as Partial<typeof v>)} />}
                </Field>
              </div>
            ))}
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm id="workflow" section="workflow" title="Event types" canEdit={canEdit} initial={{ eventTypes: config.workflow.eventTypes }}>
        {(v, set, fe) => (
          <ListEditor items={v.eventTypes} onChange={(eventTypes) => set({ eventTypes })} error={fe("eventTypes")} addLabel="Add event type" />
        )}
      </SettingsSectionForm>

      <SettingsSectionForm
        id="rules"
        section="rules"
        title="Reminders and escalation"
        canEdit={canEdit}
        initial={{
          reminderOffsetsDays: config.rules.reminderOffsetsDays.join(", "),
          overdueEscalationHours: String(config.rules.overdueEscalationHours),
          exposureThreshold: dec(config.rules.exposureThresholdMinor),
          tierStepWarningDays: String(config.rules.tierStepWarningDays),
          cutoffWarningDays: String(config.rules.cutoffWarningDays),
          approvalLimit: dec(config.rules.approvalLimitMinor),
          marginFloorPct: String(config.rules.marginFloorPct),
          approvalLinkExpiryDays: String(config.rules.approvalLinkExpiryDays),
          escalateTo: config.rules.escalateTo,
          internalApproverRoles: config.rules.internalApproverRoles,
        }}
      >
        {(v, set, fe) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Remind owners before a deadline (days)" help="e.g. 30, 14, 7, 1" error={fe("reminderOffsetsDays")}>
              {(p) => <Input {...p} value={v.reminderOffsetsDays} onChange={(e) => set({ reminderOffsetsDays: e.target.value })} />}
            </Field>
            <Field label="Escalate overdue deadlines after (hours)" error={fe("overdueEscalationHours")}>
              {(p) => <Input {...p} type="number" className="num" value={v.overdueEscalationHours} onChange={(e) => set({ overdueEscalationHours: e.target.value })} />}
            </Field>
            <Field label={`Default exposure alert threshold (${org.baseCurrency})`} help="Events can override it" error={fe("exposureThreshold")}>
              {(p) => <Input {...p} inputMode="decimal" className="num" value={v.exposureThreshold} onChange={(e) => set({ exposureThreshold: e.target.value })} />}
            </Field>
            <Field label="Warn before a cancellation step (days)" error={fe("tierStepWarningDays")}>
              {(p) => <Input {...p} type="number" className="num" value={v.tierStepWarningDays} onChange={(e) => set({ tierStepWarningDays: e.target.value })} />}
            </Field>
            <Field label="Warn before a room block cutoff (days)" error={fe("cutoffWarningDays")}>
              {(p) => <Input {...p} type="number" className="num" value={v.cutoffWarningDays} onChange={(e) => set({ cutoffWarningDays: e.target.value })} />}
            </Field>
            <Field label="Client approval links expire after (days)" error={fe("approvalLinkExpiryDays")}>
              {(p) => <Input {...p} type="number" className="num" value={v.approvalLinkExpiryDays} onChange={(e) => set({ approvalLinkExpiryDays: e.target.value })} />}
            </Field>
            <Field label={`Changes above this value need internal approval (${org.baseCurrency})`} error={fe("approvalLimit")}>
              {(p) => <Input {...p} inputMode="decimal" className="num" value={v.approvalLimit} onChange={(e) => set({ approvalLimit: e.target.value })} />}
            </Field>
            <Field label="Changes below this margin need internal approval (%)" error={fe("marginFloorPct")}>
              {(p) => <Input {...p} type="number" className="num" value={v.marginFloorPct} onChange={(e) => set({ marginFloorPct: e.target.value })} />}
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1 text-table font-medium">Escalate alerts to</p>
              {roleChecks(v.escalateTo, (escalateTo) => set({ escalateTo }))}
              {fe("escalateTo") ? <p className="text-meta text-risk">{fe("escalateTo")}</p> : null}
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1 text-table font-medium">Who can approve changes internally</p>
              {roleChecks(v.internalApproverRoles, (internalApproverRoles) => set({ internalApproverRoles }))}
              <p className="text-meta text-muted">The person who raised a change can never approve it.</p>
            </div>
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm
        id="pricing"
        section="pricing"
        title="Pricing rules"
        description="Used to suggest client prices on change requests."
        canEdit={canEdit}
        initial={{
          defaultMarkupPct: String(config.pricing.defaultMarkupPct),
          managementFeePct: String(config.pricing.managementFeePct),
          categories: Object.entries(config.pricing.markupByCategoryPct).map(([name, markupPct]) => ({ name, markupPct: String(markupPct) })),
        }}
      >
        {(v, set, fe) => (
          <div className="flex flex-col gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Default markup (%)" error={fe("defaultMarkupPct")}>
                {(p) => <Input {...p} type="number" className="num" value={v.defaultMarkupPct} onChange={(e) => set({ defaultMarkupPct: e.target.value })} />}
              </Field>
              <Field label="Management fee (%)" help="Added on top of the marked-up amount" error={fe("managementFeePct")}>
                {(p) => <Input {...p} type="number" className="num" value={v.managementFeePct} onChange={(e) => set({ managementFeePct: e.target.value })} />}
              </Field>
            </div>
            <p className="text-table font-medium">Markup by cost category</p>
            {v.categories.map((c, i) => (
              <div key={i} className="flex items-end gap-2">
                <Input aria-label={`Category ${i + 1} name`} value={c.name} onChange={(e) => set({ categories: v.categories.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="max-w-60" />
                <Input aria-label={`Category ${i + 1} markup`} type="number" className="num w-24" value={c.markupPct} onChange={(e) => set({ categories: v.categories.map((x, j) => (j === i ? { ...x, markupPct: e.target.value } : x)) })} />
                <span className="pb-1.5 text-table text-muted">%</span>
                <Button size="sm" variant="ghost" aria-label={`Remove category ${i + 1}`} onClick={() => set({ categories: v.categories.filter((_, j) => j !== i) })}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" variant="ghost" onClick={() => set({ categories: [...v.categories, { name: "", markupPct: v.defaultMarkupPct }] })}>
                <Plus size={14} aria-hidden /> Add category
              </Button>
            </div>
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm
        id="terms"
        section="clauseDefaults"
        title="Term defaults"
        description="Pre-filled when someone enters a new room block or F&B minimum."
        canEdit={canEdit}
        initial={{
          attritionCommitmentPct: String(config.clauseDefaults.attritionCommitmentPct),
          attritionDamagesPct: String(config.clauseDefaults.attritionDamagesPct),
          fbShortfallSurchargePct: String(config.clauseDefaults.fbShortfallSurchargePct),
        }}
      >
        {(v, set, fe) => (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Room block commitment (%)" error={fe("attritionCommitmentPct")}>
              {(p) => <Input {...p} type="number" className="num" value={v.attritionCommitmentPct} onChange={(e) => set({ attritionCommitmentPct: e.target.value })} />}
            </Field>
            <Field label="Attrition damages (% of rate)" error={fe("attritionDamagesPct")}>
              {(p) => <Input {...p} type="number" className="num" value={v.attritionDamagesPct} onChange={(e) => set({ attritionDamagesPct: e.target.value })} />}
            </Field>
            <Field label="F&B shortfall surcharge (%)" error={fe("fbShortfallSurchargePct")}>
              {(p) => <Input {...p} type="number" className="num" value={v.fbShortfallSurchargePct} onChange={(e) => set({ fbShortfallSurchargePct: e.target.value })} />}
            </Field>
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm id="currencies" section="currencies" title="Currencies" description="Contracts can be recorded in these currencies." canEdit={canEdit} initial={{ enabledCurrencies: config.finance.enabledCurrencies }}>
        {(v, set, fe) => (
          <ListEditor items={v.enabledCurrencies} onChange={(enabledCurrencies) => set({ enabledCurrencies: enabledCurrencies.map((c) => c.toUpperCase()) })} error={fe("enabledCurrencies")} addLabel="Add currency" narrow />
        )}
      </SettingsSectionForm>

      <FxPanel fx={fx} baseCurrency={org.baseCurrency} currencies={config.finance.enabledCurrencies} canEdit={canEdit} />

      <SettingsSectionForm id="email" section="email" title="Email" canEdit={canEdit} initial={{ senderName: config.email.senderName, replyTo: config.email.replyTo ?? "" }}>
        {(v, set, fe) => (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sender name" help="Shown to clients on approval emails" error={fe("senderName")}>
                {(p) => <Input {...p} value={v.senderName} onChange={(e) => set({ senderName: e.target.value })} />}
              </Field>
              <Field label="Reply-to address" error={fe("replyTo")}>
                {(p) => <Input {...p} type="email" value={v.replyTo} onChange={(e) => set({ replyTo: e.target.value })} />}
              </Field>
            </div>
            <TestEmail driver={status.email.driver} detail={status.email.detail} canEdit={canEdit} />
          </div>
        )}
      </SettingsSectionForm>

      <SettingsSectionForm id="extraction" section="extraction" title="Term extraction" description="Reads financial terms from contract PDFs as proposals for review." canEdit={canEdit} initial={{ enabled: config.extraction.enabled, effort: config.extraction.effort }}>
        {(v, set, fe) => {
          const s = status.extraction.stats;
          const resolved = s.confirmed + s.edited + s.rejected;
          return (
            <div className="flex flex-col gap-3 text-table">
              <label className="flex items-center gap-2">
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={v.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
                Read terms from uploaded contracts
              </label>
              <Field label="Reading depth" help="Higher reads more carefully and costs more per document" error={fe("effort")}>
                {(p) => (
                  <Select {...p} value={v.effort} onChange={(e) => set({ effort: e.target.value as typeof v.effort })} className="max-w-60">
                    <option value="medium">Standard</option>
                    <option value="high">Careful (recommended)</option>
                    <option value="xhigh">Most careful</option>
                    <option value="low">Quick</option>
                  </Select>
                )}
              </Field>
              <p className={status.extraction.hasKey ? "text-muted" : "text-watch"}>
                {status.extraction.hasKey ? `API key configured. Model ${status.extraction.model}.` : "No API key is configured, so terms can't be read even when this is on. Add ANTHROPIC_API_KEY to the environment."}
              </p>
              <p className="text-muted">
                {s.runs ? (
                  <>
                    {s.runs} document{s.runs === 1 ? "" : "s"} read ({s.failed} failed). Of {resolved} reviewed proposals: {s.confirmed} confirmed as read, {s.edited} corrected, {s.rejected} rejected
                    {resolved ? ` (${Math.round(((s.edited + s.rejected) / resolved) * 100)}% needed a human fix).` : "."}
                  </>
                ) : (
                  "No documents read yet."
                )}
              </p>
            </div>
          );
        }}
      </SettingsSectionForm>

      <UsersPanel users={users} labels={labels} canEdit={canEdit} meId={meId} />

      <section id="integrations" className="scroll-mt-16">
        <Panel title="Integrations">
          <dl className="divide-y divide-rule text-table">
            {[
              { k: "Email", ok: status.email.driver !== "disabled", v: status.email.driver === "disabled" ? status.email.detail : `${status.email.driver.toUpperCase()}: ${status.email.detail}` },
              { k: "Term extraction", ok: status.extraction.available, v: status.extraction.available ? `Connected (${status.extraction.model})` : status.extraction.reason },
              { k: "File storage", ok: true, v: status.storage.driver === "local" ? "Local disk (private)" : status.storage.driver },
              { k: "Scheduled jobs", ok: status.cron.configured, v: status.cron.configured ? "Secret configured for /api/cron/daily and /api/cron/hourly" : "CRON_SECRET not set: scheduled jobs are rejected" },
              { k: "Registration, housing, accounting", ok: false, v: "Not connected. Pickup can be imported from CSV." },
            ].map((r) => (
              <div key={r.k} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2">
                <dt className="font-medium">{r.k}</dt>
                <dd className={cx(r.ok ? "text-ink" : "text-muted")}>
                  <span className={cx("mr-2 inline-block size-2 rounded-full align-middle", r.ok ? "bg-settled" : "bg-faint")} aria-hidden />
                  {r.v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-rule px-4 py-2 text-table">
            <a href="/api/settings/export" className="text-brand hover:underline">
              Download this configuration
            </a>{" "}
            <span className="text-muted">as a client config file for another deployment.</span>
          </p>
        </Panel>
      </section>
    </div>
  );
}

function ListEditor({ items, onChange, error, addLabel, narrow }: { items: string[]; onChange: (v: string[]) => void; error?: string; addLabel: string; narrow?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((t, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={`Item ${i + 1}`} value={t} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className={narrow ? "max-w-24" : "max-w-80"} />
          <Button size="sm" variant="ghost" aria-label={`Remove ${t}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      ))}
      {error ? <p className="text-meta text-risk">{error}</p> : null}
      <div>
        <Button size="sm" variant="ghost" onClick={() => onChange([...items, ""])}>
          <Plus size={14} aria-hidden /> {addLabel}
        </Button>
      </div>
    </div>
  );
}

function FxPanel({ fx, baseCurrency, currencies, canEdit }: { fx: Array<{ fromCcy: string; toCcy: string; rate: string; asOf: string }>; baseCurrency: string; currencies: string[]; canEdit: boolean }) {
  const router = useRouter();
  const save = useAction(upsertFxAction);
  const [from, setFrom] = useState(currencies.find((c) => c !== baseCurrency) ?? "");
  const [rate, setRate] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const missing = currencies.filter((c) => c !== baseCurrency && !fx.some((r) => (r.fromCcy === c && r.toCcy === baseCurrency) || (r.toCcy === c && r.fromCcy === baseCurrency)));
  return (
    <section id="fx" className="scroll-mt-16">
      <Panel title="Exchange rates" description={`Used to total exposure in ${baseCurrency}. Totals show the rate date.`}>
        <div className="flex flex-col gap-3 p-4 text-table">
          {missing.length ? <p className="text-watch">No rate for {missing.join(", ")}: contracts in {missing.length === 1 ? "that currency" : "those currencies"} are left out of totals.</p> : null}
          <table className="w-full max-w-lg">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">Rate</th>
                <th scope="col" className="py-1 text-right font-medium">Value</th>
                <th scope="col" className="py-1 text-right font-medium">As of</th>
              </tr>
            </thead>
            <tbody className="num">
              {fx.map((r) => (
                <tr key={`${r.fromCcy}${r.toCcy}`} className="border-t border-rule">
                  <td className="py-1 font-sans">
                    {r.fromCcy} → {r.toCcy}
                  </td>
                  <td className="py-1 text-right">{r.rate}</td>
                  <td className="py-1 text-right">{r.asOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit ? (
            <>
              <FormError message={save.error} />
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-meta text-muted">
                  1
                  <Select value={from} onChange={(e) => setFrom(e.target.value)} className="w-24">
                    {currencies.filter((c) => c !== baseCurrency).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </label>
                <label className="text-meta text-muted">
                  = {baseCurrency}
                  <Input inputMode="decimal" className="num w-32" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="1.0850" />
                </label>
                <label className="text-meta text-muted">
                  As of
                  <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                </label>
                <Button disabled={save.pending || !from} onClick={async () => {
                  const res = await save.run({ fromCcy: from, toCcy: baseCurrency, rate, asOf });
                  if (res.ok) {
                    setRate("");
                    router.refresh();
                  }
                }}>
                  Save rate
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}

function TestEmail({ driver, detail, canEdit }: { driver: string; detail: string; canEdit: boolean }) {
  const test = useAction(testEmailAction);
  const [sent, setSent] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-control border border-rule px-3 py-2 text-table">
      <span className={cx("inline-block size-2 rounded-full", driver === "disabled" ? "bg-faint" : "bg-settled")} aria-hidden />
      <span className="flex-1">{driver === "disabled" ? detail : `Sending through ${driver.toUpperCase()} (${detail})`}</span>
      {canEdit && driver !== "disabled" ? (
        <Button size="sm" disabled={test.pending} onClick={async () => {
          const r = await test.run();
          if (r.ok) setSent(r.data.to);
        }}>
          Send test email
        </Button>
      ) : null}
      {sent ? <span role="status" className="w-full text-settled">Sent to {sent}.</span> : null}
      {test.error ? <span className="w-full text-risk">{test.error}</span> : null}
    </div>
  );
}

function UsersPanel({ users, labels, canEdit, meId }: { users: Array<{ id: string; name: string; email: string; role: RoleKey; status: string }>; labels: Record<RoleKey, string>; canEdit: boolean; meId: string }) {
  const router = useRouter();
  const create = useAction(createUserAction);
  const role = useAction(setUserRoleAction);
  const active = useAction(setUserActiveAction);
  const [form, setForm] = useState({ name: "", email: "", role: "EVENT_MANAGER" as RoleKey });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  return (
    <section id="users" className="scroll-mt-16">
      <Panel title="Users and roles">
        <div className="flex flex-col gap-3 p-4">
          <FormError message={role.error ?? active.error} />
          <table className="w-full text-table">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 text-left font-medium">Name</th>
                <th scope="col" className="py-1 text-left font-medium">Role</th>
                <th scope="col" className="py-1 text-right font-medium">Access</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-rule">
                  <td className="py-1.5">
                    {u.name} <span className="block text-meta text-muted">{u.email}</span>
                  </td>
                  <td className="py-1.5">
                    {canEdit && u.id !== meId ? (
                      <Select aria-label={`Role for ${u.name}`} value={u.role} onChange={async (e) => (await role.run(u.id, e.target.value as RoleKey)).ok && router.refresh()} className="max-w-52">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {labels[r]}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      labels[u.role]
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {u.status === "DEACTIVATED" ? <span className="mr-2 text-muted">Deactivated</span> : null}
                    {canEdit && u.id !== meId ? (
                      <Button size="sm" variant="ghost" onClick={async () => (await active.run(u.id, u.status === "DEACTIVATED")).ok && router.refresh()}>
                        {u.status === "DEACTIVATED" ? "Reactivate" : "Deactivate"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit ? (
            <div className="rounded-control border border-rule p-3">
              <p className="mb-2 text-table font-medium">Add a user</p>
              <FormError message={create.error} />
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_200px_auto] sm:items-end">
                <Field label="Name" error={create.fe("name")}>
                  {(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
                </Field>
                <Field label="Email" error={create.fe("email")}>
                  {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
                </Field>
                <Field label="Role">
                  {(p) => (
                    <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleKey })}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {labels[r]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button variant="primary" disabled={create.pending} onClick={async () => {
                  const r = await create.run(form);
                  if (r.ok) {
                    setTemp({ email: form.email, password: r.data.tempPassword });
                    setForm({ name: "", email: "", role: "EVENT_MANAGER" });
                    router.refresh();
                  }
                }}>
                  Add user
                </Button>
              </div>
              {temp ? (
                <p role="status" className="mt-2 rounded-control bg-settled-bg px-3 py-2 text-table">
                  {temp.email} can sign in with the temporary password <span className="num font-semibold">{temp.password}</span>. Share it securely; it is shown only once.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>
    </section>
  );
}
