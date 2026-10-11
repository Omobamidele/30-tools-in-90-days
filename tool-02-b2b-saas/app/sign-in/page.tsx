import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { orgConfigSchema } from "@/config/schema";
import { ProductMark } from "@/ui/shell";
import { Avatar } from "@/ui/bits";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

// One calm, centred card (docs/09 rev. 3): the way the CRMs people pay for sign you in.
export default async function SignInPage() {
  if (await getActor()) redirect("/");
  const [org] = await getDb().select().from(organizations).limit(1);
  const config = org ? orgConfigSchema.parse(org.config) : null;
  const demo = org?.slug === "fernway";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-sidebar px-4 py-12" style={config ? ({ "--brand": config.brand.primaryColor } as CSSProperties) : undefined}>
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <ProductMark text={config?.brand.logoText ?? "SD"} size={44} />
          <h1 className="mt-5 text-display font-semibold">Sign in to {org?.name ?? "Signal Desk"}</h1>
          <p className="mt-1.5 text-body text-muted">See which customers are ready for more, and hand them to sales.</p>
        </div>
        <div className="panel p-6 shadow-pop">
          <SignInForm />
        </div>
        {demo ? (
          <div className="mt-5 rounded-panel border border-rule bg-surface px-5 py-4">
            <p className="text-table font-medium">Demo workspace</p>
            <p className="mt-0.5 text-meta text-muted">Fictional company with simulated usage. Everyone&apos;s password is fernway-demo-2026.</p>
            <ul className="mt-3 space-y-2">
              {[
                { name: "Priya Nair", email: "priya@fernway.test", role: "customer success" },
                { name: "Tomás Rivera", email: "tomas@fernway.test", role: "sales" },
                { name: "Sam Okafor", email: "revops@fernway.test", role: "RevOps" },
              ].map((u) => (
                <li key={u.email} className="flex items-center gap-2.5 text-table">
                  <Avatar name={u.name} size={26} className="ring-0" />
                  <span>
                    {u.email} <span className="text-muted">({u.role})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
