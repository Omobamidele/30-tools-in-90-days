"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLAIN, WALLPAPERS } from "@/config/imagery";
import { saveWallpaperAction } from "../../../app/(app)/workspace-actions";
import { Sheet } from "../sheet";
import { Photo } from "../photo";
import { Check } from "../icons";
import { cx } from "../cx";

/**
 * Personal wallpaper choice. Saved to the user's preferences (not the browser), so it follows
 * them across devices. Panels stay opaque whichever photo is chosen, so it never affects legibility.
 */
export function AppearanceSheet({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(key: string) {
    setSelected(key);
    setError(null);
    start(async () => {
      const res = await saveWallpaperAction(key);
      if (!res.ok) {
        setSelected(current);
        setError(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  const options = [{ key: PLAIN, label: "Plain", alt: "Warm ivory background, no photo" }, ...WALLPAPERS];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Appearance" description="Choose the photo behind your workspace. Only you see your choice.">
      <div className="p-5">
        <fieldset>
          <legend className="mb-3 text-section font-semibold">Wallpaper</legend>
          <div role="radiogroup" aria-label="Wallpaper" aria-busy={pending} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((o) => {
              const on = selected === o.key;
              const photo = WALLPAPERS.find((w) => w.key === o.key) ?? null;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => !on && choose(o.key)}
                  className={cx(
                    "group text-left outline-offset-2",
                    pending && !on ? "cursor-wait" : "",
                  )}
                >
                  <span className={cx("relative block aspect-[4/3] overflow-hidden rounded-panel border-2", on ? "border-brand" : "border-transparent group-hover:border-rule-strong")}>
                    {photo ? <Photo photo={photo} sizes="180px" /> : <span className="absolute inset-0 bg-canvas" />}
                    {on ? (
                      <span className="absolute top-1.5 right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-brand text-white">
                        <Check size={12} weight="bold" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block text-table font-medium">{o.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="mt-3 text-table text-risk">
            {error}
          </p>
        ) : null}
        <p className="mt-6 text-meta text-faint">
          Photos from Unsplash, used under the Unsplash License. Your organisation&apos;s default is set in Settings → Branding.
        </p>
      </div>
    </Sheet>
  );
}
