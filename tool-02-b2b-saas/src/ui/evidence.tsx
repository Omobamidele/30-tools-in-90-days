import type { RuleType } from "@/config/schema";
import { formatDay } from "@/core/dates";
import { Avatar, TYPE_TONE } from "./bits";
import { LockKeyOpen, User } from "./icons";
import { cx } from "./cx";

// Evidence pictures (docs/09 rev. 3, the signature element). Each signal type is shown as the
// thing it is about: a seat map, a commitment meter, a team's people, a tally of attempts, a
// contact card. These are not charts over time, so they never read as a price graph. Each one
// has a sentence for screen readers, and the numbers are always in the caption as well.

type Terms = { seats: string; seatSingular: string; usageMetric: string; usageUnit: string };
type Ev = Record<string, unknown>;
type Size = "compact" | "full";

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const fmt = (v: number) => Math.round(v).toLocaleString("en-US");
const day = (v: unknown) => (typeof v === "string" ? formatDay(v) : "");

export function Evidence({ type, evidence, terms, size = "full", className }: { type: RuleType; evidence: unknown; terms: Terms; size?: Size; className?: string }) {
  const e = (evidence ?? {}) as Ev;
  const body = (() => {
    switch (type) {
      case "SEAT_PRESSURE":
        return <SeatMap active={n(e.activeSeats)} purchased={n(e.seatsPurchased)} streakDays={n(e.streakDays)} terms={terms} size={size} />;
      case "USAGE_PACE":
        return <CommitmentMeter used={n(e.usedToDate)} projected={n(e.projected)} committed={n(e.committed)} termEnd={e.termEnd} unit={terms.usageUnit} size={size} />;
      case "NEW_TEAM":
        return <TeamPeople workspace={String(e.workspace ?? "New team")} people={n(e.activeUsers)} createdOn={e.createdOn} size={size} />;
      case "FEATURE_INTENT":
        return <AttemptTally attempts={n(e.attempts)} addon={String(e.addon ?? "the add-on")} windowDays={n(e.windowDays)} size={size} />;
      case "NEW_EXECUTIVE":
        return <ContactCard name={String(e.contact ?? "New contact")} title={e.title ? String(e.title) : null} firstSeenOn={e.firstSeenOn} size={size} />;
    }
  })();
  return <div className={className}>{body}</div>;
}

function Caption({ children, size }: { children: React.ReactNode; size: Size }) {
  return <p className={cx("text-muted", size === "full" ? "mt-3 text-body" : "mt-2 text-meta")}>{children}</p>;
}

/** Every purchased seat as a square: filled when someone uses it; striped squares are people without a seat. */
export function SeatMap({ active, purchased, streakDays, terms, size }: { active: number; purchased: number; streakDays: number; terms: Terms; size: Size }) {
  const over = Math.max(0, active - purchased);
  const total = purchased + over;
  const cap = size === "full" ? 160 : 80;
  const per = Math.max(1, Math.ceil(total / cap));
  const cells = Math.ceil(total / per);
  const filled = Math.ceil(Math.min(active, purchased) / per);
  const bought = Math.ceil(purchased / per);
  const cell = size === "full" ? 14 : 9;
  const gap = size === "full" ? 4 : 3;
  const t = TYPE_TONE.SEAT_PRESSURE;
  const seat = terms.seatSingular;
  const sentence = `${fmt(active)} people active on ${fmt(purchased)} ${terms.seats.toLowerCase()}${over ? `; ${fmt(over)} more than they pay for` : ""}.`;
  return (
    <figure>
      <div role="img" aria-label={sentence} className="flex flex-wrap" style={{ gap, maxWidth: size === "full" ? 40 * (cell + gap) : undefined }}>
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            className={cx("shrink-0", i < filled ? t.fill : i < bought ? "bg-surface ring-1 ring-rule-strong ring-inset" : "")}
            style={{
              width: cell,
              height: cell,
              borderRadius: size === "full" ? 4 : 2.5,
              ...(i >= bought ? { background: "repeating-linear-gradient(135deg, var(--t-exec) 0 2px, var(--t-exec-bg) 2px 4px)" } : {}),
            }}
          />
        ))}
      </div>
      <Caption size={size}>
        <span className="font-medium text-text">{fmt(active)} active</span> on {fmt(purchased)} {seat}s{over ? <>, <span className="font-medium text-t-exec">{fmt(over)} without a seat of their own</span></> : null}
        {streakDays ? ` for ${fmt(streakDays)} days` : ""}.{per > 1 ? ` Each square is ${per} ${seat}s.` : ""}
      </Caption>
    </figure>
  );
}

/** Usage this term against what they committed to: used so far, then where this pace ends. */
export function CommitmentMeter({ used, projected, committed, termEnd, unit, size }: { used: number; projected: number; committed: number; termEnd: unknown; unit: string; size: Size }) {
  const max = Math.max(projected, committed) * 1.04 || 1;
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const h = size === "full" ? 18 : 10;
  const sentence = `Used ${fmt(used)} of ${fmt(committed)} ${unit} so far; on pace for ${fmt(projected)} by ${day(termEnd)}.`;
  return (
    <figure>
      {size === "full" ? (
        <div className="relative mb-2 h-5 text-meta text-muted" aria-hidden>
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: pct(committed) }}>
            Committed {fmt(committed)}
          </span>
        </div>
      ) : null}
      <div role="img" aria-label={sentence} className="relative w-full overflow-visible rounded-full bg-sunken ring-1 ring-rule ring-inset" style={{ height: h }}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(projected), background: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--t-usage) 55%, white) 0 3px, var(--t-usage-bg) 3px 6px)" }} />
        <span className="absolute inset-y-0 left-0 rounded-full bg-t-usage" style={{ width: pct(used) }} />
        <span className="absolute -inset-y-1 w-0.5 rounded-full bg-text" style={{ left: pct(committed) }} />
      </div>
      <Caption size={size}>
        <span className="font-medium text-text">{fmt(used)} used</span> so far. At this pace they reach <span className="font-medium text-t-usage">{fmt(projected)}</span> by {day(termEnd)}, against {fmt(committed)} committed.
      </Caption>
    </figure>
  );
}

/** The people in a new team, one figure each. */
function TeamPeople({ workspace, people, createdOn, size }: { workspace: string; people: number; createdOn: unknown; size: Size }) {
  const show = Math.min(people, size === "full" ? 24 : 12);
  const s = size === "full" ? 30 : 20;
  return (
    <figure>
      <div role="img" aria-label={`${people} people active in the new ${workspace} workspace.`} className="flex flex-wrap items-center gap-1">
        {Array.from({ length: show }, (_, i) => (
          <span key={i} className="inline-flex items-center justify-center rounded-full bg-t-team-bg text-t-team ring-1 ring-t-team/25 ring-inset" style={{ width: s, height: s }}>
            <User size={Math.round(s * 0.55)} weight="fill" />
          </span>
        ))}
        {people > show ? <span className="ml-1 text-meta font-medium text-t-team">+{people - show}</span> : null}
      </div>
      <Caption size={size}>
        <span className="font-medium text-text">{workspace}</span> was set up {day(createdOn)} and has {fmt(people)} people working in it.
      </Caption>
    </figure>
  );
}

/** Each attempt to open an add-on they don't own, as a mark. */
function AttemptTally({ attempts, addon, windowDays, size }: { attempts: number; addon: string; windowDays: number; size: Size }) {
  const show = Math.min(attempts, size === "full" ? 48 : 24);
  const s = size === "full" ? 22 : 15;
  return (
    <figure>
      <div role="img" aria-label={`${attempts} attempts to open ${addon} in ${windowDays} days.`} className="flex flex-wrap gap-1">
        {Array.from({ length: show }, (_, i) => (
          <span key={i} className="inline-flex items-center justify-center rounded-md bg-t-addon-bg text-t-addon" style={{ width: s, height: s }}>
            <LockKeyOpen size={Math.round(s * 0.62)} weight="bold" />
          </span>
        ))}
        {attempts > show ? <span className="ml-1 self-center text-meta font-medium text-t-addon">+{attempts - show}</span> : null}
      </div>
      <Caption size={size}>
        <span className="font-medium text-text">{fmt(attempts)} attempts</span> to open {addon} in the last {fmt(windowDays)} days. Their plan doesn&apos;t include it.
      </Caption>
    </figure>
  );
}

/** A new senior person on the account. */
function ContactCard({ name, title, firstSeenOn, size }: { name: string; title: string | null; firstSeenOn: unknown; size: Size }) {
  return (
    <figure className="flex items-center gap-3 rounded-panel bg-t-exec-bg/60 px-3 py-2.5 ring-1 ring-t-exec/15 ring-inset">
      <Avatar name={name} size={size === "full" ? 40 : 30} className="ring-0" />
      <figcaption className="min-w-0">
        <span className="block font-medium">{name}</span>
        <span className="block text-meta text-muted">
          {title ?? "Title unknown"}
          {firstSeenOn ? `, first active ${day(firstSeenOn)}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}
