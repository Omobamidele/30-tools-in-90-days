import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { organizations } from "@/db/schema";
import { orgConfigSchema } from "@/config/schema";
import { findWallpaper, WALLPAPERS } from "@/config/imagery";
import { ProductMark } from "@/ui/shell/sidebar";
import { Photo } from "@/ui/photo";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getActor()) redirect("/");
  // One organisation per deployment: brand the sign-in page with it when present.
  const [org] = await getDb().select().from(organizations).limit(1);
  const config = org ? orgConfigSchema.parse(org.config) : null;
  const productName = config?.brand.productName ?? "Exposure Register";
  // The organisation's wallpaper; "plain" still gets a venue photo here, because this side is the brand panel.
  const photo = findWallpaper(config?.brand.defaultWallpaper) ?? WALLPAPERS[0];
  return (
    <main
      className="grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]"
      style={config ? ({ "--brand": config.brand.primaryColor, "--accent": config.brand.accentColor } as CSSProperties) : undefined}
    >
      {/* Brand panel: a venue photo under a midnight scrim (docs/09 § Layout signatures). */}
      <section className="on-photo relative isolate flex min-h-44 flex-col justify-between overflow-hidden bg-midnight p-6 text-white lg:min-h-dvh lg:p-12">
        <Photo photo={photo} sizes="(min-width: 1024px) 55vw, 100vw" priority className="-z-10" />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "var(--scrim-brand)" }} />
        <div className="flex items-center gap-3">
          <ProductMark name={productName} size={36} />
          <div>
            <p className="font-display text-section font-medium">{productName}</p>
            {org ? <p className="text-meta text-[#d5dae3]">{org.name}</p> : null}
          </div>
        </div>
        <div className="hidden max-w-xl lg:block">
          <p className="font-display text-[40px] leading-[46px] font-medium">Every supplier commitment, deadline and penalty for every event, in one register.</p>
          <ul className="mt-8 grid grid-cols-3 gap-6 border-t border-white/15 pt-6 text-table text-[#d5dae3]">
            <li>
              <span className="block font-medium text-white">Obligations</span>
              Cutoffs, guarantees and payments from each contract
            </li>
            <li>
              <span className="block font-medium text-white">Live exposure</span>
              Attrition, F&amp;B and cancellation, and who carries it
            </li>
            <li>
              <span className="block font-medium text-white">Change control</span>
              Priced changes approved by the client before they apply
            </li>
          </ul>
        </div>
        <p className="hidden text-[11px] text-[#b4bccb] lg:block">
          Photo: {photo.credit} / Unsplash
        </p>
      </section>

      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <h1 className="font-display text-title font-medium">Sign in</h1>
          <p className="mt-1 text-table text-muted">Use the email your administrator invited.</p>
          <div className="mt-6 panel p-6">
            <SignInForm />
          </div>
          {config?.demo ? (
            <p className="mt-4 text-center text-meta text-faint">
              Demo workspace · <span className="font-mono">ops@northbeam.test</span> · <span className="font-mono">northbeam-demo-2026</span>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
