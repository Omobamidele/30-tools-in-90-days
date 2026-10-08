import Link from "next/link";
import { ChevronLeft, ChevronRight } from "@/ui/icons";
import { addDays } from "@/core/time";
import { cx } from "./cx";

export type CalendarItem = {
  id: string;
  /** Local dates (YYYY-MM-DD); `end` defaults to `start`. */
  start: string;
  end?: string;
  label: string;
  href: string;
  color: string;
  sub?: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthStart(month: string) {
  return `${month}-01`;
}
function dow(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
}
export function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Month grid (Monday first). Multi-day items show their label on the first day and on Mondays. */
export function MonthCalendar({ month, today, items, hrefFor }: { month: string; today: string; items: CalendarItem[]; hrefFor: (month: string) => string }) {
  const first = monthStart(month);
  const gridStart = addDays(first, -dow(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const title = new Date(`${first}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const lastRowNeeded = days.slice(35).some((d) => d.startsWith(month));
  const shown = lastRowNeeded ? days : days.slice(0, 35);

  return (
    <section className="panel overflow-hidden" aria-label={`Calendar, ${title}`}>
      <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <h2 className="text-section font-semibold">{title}</h2>
        <div className="flex items-center gap-1">
          <Link href={hrefFor(shiftMonth(month, -1))} aria-label="Previous month" className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink">
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <Link href={hrefFor(today.slice(0, 7))} className="rounded-control border border-rule px-2.5 py-1 text-table hover:bg-sunken">
            Today
          </Link>
          <Link href={hrefFor(shiftMonth(month, 1))} aria-label="Next month" className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink">
            <ChevronRight size={18} aria-hidden />
          </Link>
        </div>
      </header>
      <div className="grid grid-cols-7 border-b border-rule text-meta text-faint">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-2 py-2">
            {w}
          </div>
        ))}
      </div>
      <ol className="grid grid-cols-7">
        {shown.map((day, i) => {
          const inMonth = day.startsWith(month);
          const onDay = items.filter((it) => it.start <= day && (it.end ?? it.start) >= day);
          const visible = onDay.slice(0, 3);
          return (
            <li key={day} className={cx("min-h-28 border-b border-rule p-1.5", i % 7 !== 6 && "border-r", !inMonth && "bg-canvas")}>
              <p className={cx("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-meta", day === today ? "bg-brand font-medium text-white" : inMonth ? "text-ink" : "text-faint")}>
                {Number(day.slice(8))}
              </p>
              <ul className="flex flex-col gap-1">
                {visible.map((it) => {
                  const startsHere = it.start === day || dow(day) === 0;
                  return (
                    <li key={it.id}>
                      <Link
                        href={it.href}
                        title={`${it.label}${it.sub ? ` · ${it.sub}` : ""}`}
                        className="flex items-center gap-1.5 truncate rounded-[4px] bg-sunken px-1.5 py-0.5 text-[11.5px] leading-4 text-ink hover:bg-rule"
                      >
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: it.color }} />
                        {startsHere ? <span className="truncate">{it.label}</span> : <span className="sr-only">{it.label} continues</span>}
                        {startsHere ? null : <span aria-hidden className="text-faint">…</span>}
                      </Link>
                    </li>
                  );
                })}
                {onDay.length > visible.length ? <li className="px-1 text-meta text-faint">+{onDay.length - visible.length} more</li> : null}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
