import { CircleX } from "@/ui/icons";
import type { IconType } from "@/ui/icons";
import { cx } from "./cx";

// Status = text plus a small coloured dot. The words carry the meaning; colour is a quick cue,
// never the only signal (docs/04 §10). Chips stay neutral so a list of statuses reads calmly.
export type Tone = "neutral" | "active" | "settled" | "watch" | "risk" | "muted";

const tones: Record<Tone, { dot: string; text: string }> = {
  neutral: { dot: "bg-faint", text: "text-ink" },
  active: { dot: "bg-brand", text: "text-ink" },
  settled: { dot: "bg-settled", text: "text-ink" },
  watch: { dot: "bg-watch", text: "text-watch" },
  risk: { dot: "bg-risk", text: "text-risk" },
  muted: { dot: "bg-rule-strong", text: "text-muted" },
};

/** Neutral chip with a coloured dot. `plain` drops the chip for inline use. `icon` is accepted for API compatibility and ignored. */
export function Status({ tone, children, plain }: { tone: Tone; children: React.ReactNode; icon?: IconType; plain?: boolean }) {
  const t = tones[tone];
  const dot = <span aria-hidden className={cx("inline-block size-1.5 shrink-0 rounded-full", t.dot)} />;
  if (plain) {
    return (
      <span className={cx("inline-flex items-center gap-1.5 font-medium whitespace-nowrap", t.text)}>
        {dot}
        {children}
      </span>
    );
  }
  return (
    <span className={cx("inline-flex h-[22px] items-center gap-1.5 rounded-[6px] border border-rule bg-surface px-2 text-meta font-medium whitespace-nowrap", t.text)}>
      {dot}
      {children}
    </span>
  );
}

export const eventStatusTone: Record<string, Tone> = {
  PLANNING: "neutral",
  CONTRACTED: "active",
  LIVE: "active",
  DELIVERED: "settled",
  RECONCILED: "muted",
  CANCELLED: "muted",
  POSTPONED: "watch",
};

export const contractStatusTone: Record<string, Tone> = {
  DRAFT: "neutral",
  IN_REVIEW: "watch",
  ACTIVE: "settled",
  SUPERSEDED: "muted",
  CLOSED: "muted",
  CANCELLED: "muted",
};

export { CircleX };

/** Chip tone for the plain event health word (src/core/exposure/status.ts). */
export const healthTone: Record<"DECIDE" | "WATCH" | "ON_TRACK", Tone> = { DECIDE: "risk", WATCH: "watch", ON_TRACK: "settled" };
