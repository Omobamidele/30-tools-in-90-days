import { formatMoney } from "@/core/money";

// Paired bars per event: projected (7 days before) vs actually charged. Two validated
// categorical hues (validate_palette.js: both pass band/chroma/CVD; the lighter one is
// below 3:1 on white, so every bar carries a printed value and a table view follows).
const PROJECTED = "#2A78B5";
const ACTUAL = "#D08A2E";

type Row = { id: string; name: string; currency: string; projected: number | null; actual: number | null };

export function VarianceChart({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.projected ?? 0, r.actual ?? 0]));
  const bar = (v: number | null, color: string, label: string, ccy: string) => (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-meta text-muted">{label}</span>
      <div className="h-3 flex-1">
        {v !== null ? (
          <div
            className="h-3 rounded-r-[4px]"
            style={{ width: `${Math.max(v > 0 ? 1 : 0, (v / max) * 100)}%`, background: color }}
            title={`${label}: ${formatMoney(v, ccy)}`}
          />
        ) : null}
      </div>
      <span className="num w-32 shrink-0 text-right text-meta text-ink">{v !== null ? formatMoney(v, ccy) : "–"}</span>
    </div>
  );
  return (
    <figure aria-label="Projected versus actual penalties by event">
      <div className="mb-2 flex gap-4 text-meta text-muted" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px]" style={{ background: PROJECTED }} /> Projected 7 days before
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px]" style={{ background: ACTUAL }} /> Actually charged
        </span>
      </div>
      <ul className="flex flex-col gap-3" aria-hidden>
        {rows.map((r) => (
          <li key={r.id}>
            <p className="mb-1 text-table font-medium">{r.name}</p>
            <div className="flex flex-col gap-[2px]">
              {bar(r.projected, PROJECTED, "Projected", r.currency)}
              {bar(r.actual, ACTUAL, "Charged", r.currency)}
            </div>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-meta text-muted">Values are in each event&apos;s reporting currency. The table below has the same figures.</figcaption>
    </figure>
  );
}
