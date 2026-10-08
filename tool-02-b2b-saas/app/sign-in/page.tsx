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

// One calm, centred card (docs/09 rev. 2): the way the CRMs people pay for sign you in.
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
          <h1 className="mt-4 text-title font-semibold">Sign in to {org?.name ?? "Signal Desk"}</h1>
          <p className="mt-1 text-table text-muted">{config?.brand.productName ?? "Signal Desk"}: expansion signals for customer success and sales</p>
        </div>
        <div className="panel p-6 shadow-pop">
          <SignInForm />
        </div>
        {demo ? (
          <div className="mt-4 rounded-panel border border-rule bg-surface px-4 py-3 text-meta text-muted">
            <p className="font-medium text-text">Demo workspace</p>
            <p className="mt-1">Fictional company, simulated usage. Password for everyone: fernway-demo-2026</p>
            <p className="mt-1">Try priya@fernway.test (customer success), tomas@fernway.test (sales) or revops@fernway.test.</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
