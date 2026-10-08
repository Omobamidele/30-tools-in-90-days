import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { orgConfigSchema } from "@/config/schema";
import { ProductMark } from "@/ui/shell";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

const STEPS = [
  { title: "Signal", body: "Usage crosses a rule you set: seats nearly full, usage ahead of commitment, a new team, an add-on they keep trying." },
  { title: "Triage", body: "The account's CSM accepts it with a note, snoozes it, or dismisses it with a reason the rule learns from." },
  { title: "Routed", body: "Accepted signals reach the right seller as a CSQL, with the evidence and a deadline." },
  { title: "Recorded", body: "Sellers record the opportunity and the outcome, so you can see which signals turn into revenue." },
];

export default async function SignInPage() {
  if (await getActor()) redirect("/");
  // One organisation per deployment: brand the sign-in page with it when present.
  const [org] = await getDb().select().from(organizations).limit(1);
  const config = org ? orgConfigSchema.parse(org.config) : null;
  const productName = config?.brand.productName ?? "Signal Desk";
  const demo = org?.slug === "fernway";
  return (
    <main
      className="grid min-h-dvh lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]"
      style={config ? ({ "--brand": config.brand.primaryColor, "--accent": config.brand.accentColor } as CSSProperties) : undefined}
    >
      <section className="on-ink flex flex-col justify-between gap-10 bg-ink p-6 text-on-ink lg:min-h-dvh lg:p-12">
        <div className="flex items-center gap-3">
          <ProductMark text={config?.brand.logoText ?? "SD"} />
          <div>
            <p className="text-section font-semibold">{productName}</p>
            {org ? <p className="text-meta text-on-ink-muted">{org.name}</p> : null}
          </div>
        </div>
        <div className="hidden max-w-xl lg:block">
          <p className="text-[38px] leading-[44px] font-medium tracking-[-0.015em]">Expansion revenue your customers are already signalling, triaged and routed to the right seller.</p>
          <ol className="mt-10 grid gap-0">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[28px_1fr] gap-4">
                <div className="flex flex-col items-center">
                  <span aria-hidden className={i === 0 ? "mt-1.5 size-3 rounded-full bg-signal" : "mt-1.5 size-3 rounded-full border-2 border-on-ink-muted"} />
                  {i < STEPS.length - 1 ? <span aria-hidden className="w-px flex-1 bg-white/20" /> : null}
                </div>
                <div className="pb-6">
                  <p className="text-tag tracking-[0.08em] text-on-ink-muted uppercase">Step {i + 1}</p>
                  <p className="text-section font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-table text-on-ink-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="hidden text-meta text-on-ink-muted lg:block">Signals are deterministic rules you can read and tune. Nothing is scored by a hidden model.</p>
      </section>

      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <h1 className="text-title font-semibold">Sign in</h1>
          <p className="mt-1 text-table text-muted">Use the email your administrator set up for you.</p>
          <div className="mt-6 panel p-6">
            <SignInForm />
          </div>
          {demo ? (
            <div className="mt-4 rounded-panel border border-dashed border-field bg-surface px-4 py-3 text-meta text-muted">
              <p className="font-medium text-text">Demo workspace (fictional company, simulated usage)</p>
              <p className="mt-1">
                CSM <span>priya@fernway.test</span> · seller <span>tomas@fernway.test</span> · RevOps <span>revops@fernway.test</span>
              </p>
              <p className="mt-0.5">
                Password <span>fernway-demo-2026</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
