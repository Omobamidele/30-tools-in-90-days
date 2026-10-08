import type { ReactNode } from "react";
import { findCover } from "@/config/imagery";
import { Breadcrumbs, type Crumb } from "./page";
import { Photo } from "./photo";

/**
 * Event workspace header (docs/09 § Layout signatures): the event's cover photo under a
 * left-weighted midnight scrim, with the name in the display serif and the facts a planner
 * checks first. Without a cover it is the same banner on plain midnight.
 */
export function EventCover({
  cover,
  title,
  crumbs,
  status,
  facts,
  countdown,
  actions,
}: {
  cover: string | null;
  title: string;
  crumbs: Crumb[];
  status: ReactNode;
  facts: ReactNode[];
  countdown?: { value: string; label: string } | null;
  actions?: ReactNode;
}) {
  const photo = findCover(cover);
  return (
    <header className="on-photo relative mb-6 overflow-hidden rounded-panel bg-midnight text-white shadow-[var(--shadow-photo)]" data-canvas="photo">
      <Photo photo={photo} sizes="(min-width: 1280px) 1216px, 100vw" priority />
      <div aria-hidden className="absolute inset-0" style={{ background: "var(--scrim-banner)" }} />
      <div className="relative flex min-h-[200px] flex-col justify-between gap-6 p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Breadcrumbs items={crumbs} />
          {actions ? (
            <div data-surface className="flex flex-wrap items-center gap-2 text-ink">
              {actions}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <div className="mb-2">{status}</div>
            <h1 className="font-display text-hero font-medium text-white">{title}</h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-table text-[#d5dae3]">
              {facts.map((f, i) => (
                <span key={i} className="flex items-center gap-3">
                  {i > 0 ? <span aria-hidden className="text-[#b4bccb]">·</span> : null}
                  {f}
                </span>
              ))}
            </p>
          </div>
          {countdown ? (
            <p className="shrink-0 text-right">
              <span className="num block font-display text-hero font-medium text-white">{countdown.value}</span>
              <span className="text-meta text-[#d5dae3]">{countdown.label}</span>
            </p>
          ) : null}
        </div>
      </div>
      {photo ? (
        <p className="absolute right-3 bottom-2 hidden rounded-[4px] bg-midnight/75 px-1.5 text-[10px] leading-4 text-white/90 md:block">
          Photo: {photo.credit} / Unsplash
        </p>
      ) : null}
    </header>
  );
}

/** "12 days to go", "Today", "Day 2 of 3", or null once the event has finished. */
export function eventCountdown(today: string, start: string, end: string): { value: string; label: string } | null {
  const day = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
  const t = day(today);
  const s = day(start);
  const e = day(end);
  if (t < s) return { value: String(s - t), label: s - t === 1 ? "day to go" : "days to go" };
  if (t <= e) return { value: `Day ${t - s + 1}`, label: `of ${e - s + 1}` };
  return null;
}
