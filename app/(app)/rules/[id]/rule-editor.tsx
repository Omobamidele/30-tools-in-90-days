"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RuleType } from "@/config/schema";
import { formatMoney } from "@/core/money";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/field";
import { previewRuleAction, saveRuleAction } from "../actions";

type Rule = { id: string; type: RuleType; name: string; params: Record<string, unknown>; weight: number; minArr: string; segments: string[]; cooldownDays: number; enabled: boolean; version: number };

/** Parameter fields per rule type, with plain-English labels (docs/04 § Rules). */
const PARAMS: Record<RuleType, Array<{ key: string; label: string; suffix?: string; help?: string }>> = {
  SEAT_PRESSURE: [
    { key: "utilisationPct", label: "Active seats at least", suffix: "% of purchased" },
    { key: "sustainDays", label: "For at least", suffix: "days in a row", help: "Shorter catches spikes; longer waits for a real trend." },
  ],
  USAGE_PACE: [
    { key: "projectedPct", label: "Projected use at least", suffix: "% of commitment" },
    { key: "minElapsedPct", label: "Once this much of the term has passed", suffix: "%", help: "Early in a term, projections swing a lot." },
  ],
  NEW_TEAM: [
    { key: "withinDays", label: "Workspace created in the last", suffix: "days" },
    { key: "minActiveUsers", label: "With at least", suffix: "active users" },
  ],
  FEATURE_INTENT: [
    { key: "minAttempts", label: "At least", suffix: "attempts on an add-on they don't own" },
    { key: "windowDays", label: "Within", suffix: "days" },
  ],
  NEW_EXECUTIVE: [{ key: "withinDays", label: "First active in the last", suffix: "days" }],
};

type Preview = { count: number; totalMinor: number; sample: Array<{ accountId: string; account: string; explanation: string; valueMinor: number | null }> };

export function RuleEditor({ rule, segments, currency, current }: { rule: Rule; segments: Array<{ key: string; name: string }>; currency: string; usageUnit: string; current: string }) {
  const router = useRouter();
  const [params, setParams] = useState<Record<string, unknown>>(rule.params);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const collect = (form: HTMLFormElement) => {
    const f = new FormData(form);
    return {
      name: String(f.get("name") ?? ""),
      params,
      weight: Number(f.get("weight")),
      minArr: String(f.get("minArr") ?? ""),
      segments: segments.filter((s) => f.get(`seg-${s.key}`)).map((s) => s.key),
      cooldownDays: Number(f.get("cooldownDays")),
      enabled: f.get("enabled") === "on",
      note: String(f.get("note") ?? ""),
    };
  };

  return (
    <form
      className="panel flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const input = collect(e.currentTarget);
        start(async () => {
          setError(null);
          setFe({});
          setSaved(false);
          const res = await saveRuleAction(rule.id, rule.version, input);
          if (!res.ok) {
            setError(res.error.message);
            setFe(res.error.fieldErrors);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="border-b border-rule px-4 py-3">
        <h2 className="text-section font-semibold">Settings</h2>
        <p className="mt-0.5 text-table text-muted">Now: {current}.</p>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {error ? (
          <p role="alert" className="rounded-control border border-risk/30 bg-risk-bg px-3 py-2 text-table text-risk">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className="rounded-control bg-won-bg px-3 py-2 text-table text-won">
            Saved as a new version. New signals use it from the next detection run.
          </p>
        ) : null}
        <Field label="Name" error={fe.name}>
          {(a) => <Input {...a} name="name" defaultValue={rule.name} />}
        </Field>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-table font-medium">Condition</legend>
          {PARAMS[rule.type].map((p) => (
            <Field key={p.key} label={p.label} help={p.help} error={fe[`params.${p.key}`]}>
              {(a) => (
                <span className="flex items-center gap-2">
                  <Input {...a} type="number" className="max-w-28" value={String(params[p.key] ?? "")} onChange={(e) => setParams({ ...params, [p.key]: Number(e.target.value) })} />
                  {p.suffix ? <span className="text-table text-muted">{p.suffix}</span> : null}
                </span>
              )}
            </Field>
          ))}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Weight in priority" help="0–20 points" error={fe.weight}>
            {(a) => <Input {...a} type="number" name="weight" min={0} max={20} defaultValue={rule.weight} />}
          </Field>
          <Field label="Minimum ARR" help="Leave empty for any size" error={fe.minArr}>
            {(a) => <Input {...a} name="minArr" inputMode="decimal" defaultValue={rule.minArr} placeholder="e.g. 20,000" />}
          </Field>
          <Field label="Cooldown after a dismissal" help="days" error={fe.cooldownDays}>
            {(a) => <Input {...a} type="number" name="cooldownDays" min={0} max={365} defaultValue={rule.cooldownDays} />}
          </Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-table font-medium">Segments</legend>
          <p className="mb-2 text-meta text-muted">None ticked means every segment.</p>
          <div className="flex flex-wrap gap-4">
            {segments.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-table">
                <input type="checkbox" name={`seg-${s.key}`} defaultChecked={rule.segments.includes(s.key)} className="size-4 accent-[var(--brand)]" /> {s.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-table">
          <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="size-4 accent-[var(--brand)]" /> Rule is on
        </label>

        <div className="rounded-panel border border-rule bg-sunken/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-table font-medium">What would this raise today?</p>
            <Button
              size="sm"
              disabled={pending}
              onClick={(e) => {
                const form = (e.currentTarget as HTMLButtonElement).form!;
                const input = collect(form);
                start(async () => {
                  setError(null);
                  const res = await previewRuleAction(rule.id, input);
                  if (!res.ok) {
                    setError(res.error.message);
                    setFe(res.error.fieldErrors);
                    return;
                  }
                  setPreview(res.data as Preview);
                });
              }}
            >
              Preview
            </Button>
          </div>
          {preview ? (
            <div className="mt-2" aria-live="polite">
              <p className="text-table">
                With these settings, <span className="num font-mono font-semibold">{preview.count}</span> account{preview.count === 1 ? "" : "s"} would have a signal today
                {preview.totalMinor ? (
                  <>
                    , about <span className="font-mono">{formatMoney(preview.totalMinor, currency)}</span> a year estimated
                  </>
                ) : null}
                . Nothing is saved or raised by previewing.
              </p>
              {preview.sample.length ? (
                <ul className="mt-2 divide-y divide-rule rounded-control border border-rule bg-surface">
                  {preview.sample.map((s) => (
                    <li key={s.accountId} className="flex flex-wrap justify-between gap-2 px-3 py-1.5 text-table">
                      <span>
                        <span className="font-medium">{s.account}</span> <span className="text-muted">{s.explanation}</span>
                      </span>
                      <span className="font-mono">{s.valueMinor === null ? "—" : formatMoney(s.valueMinor, currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-1 text-meta text-muted">Runs the same rule code as detection against today&apos;s usage, without saving anything.</p>
          )}
        </div>

        <Field label="What changed and why" required error={fe.note} help="Saved with the version, so others can see why the rule behaves differently.">
          {(a) => <Textarea {...a} name="note" rows={2} placeholder="e.g. Raised to 95%: too many dismissals for contractors" />}
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save new version"}
          </Button>
        </div>
      </div>
    </form>
  );
}
