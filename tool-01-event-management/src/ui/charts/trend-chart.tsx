import { formatMoney } from "@/core/money";
import { formatDate } from "../format";

/** `value: null` = no snapshot yet that day (the chart starts at the first real point). */
export type TrendSeriesPoint = { date: string; value: number | null };

// Line + light area of one money series over time, drawn from stored snapshots.
// Scales uniformly with its container (fixed aspect ratio), labels stay readable.
// A "View as table" disclosure gives the same numbers without the chart.
const W = 640;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 28, left: 64 };

function niceMax(v: number) {
  if (v <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

function shortMoney(minor: number, currency: string) {
  const major = minor / 100;
  const sym = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).formatToParts(0).find((p) => p.type === "currency")?.value ?? "";
  if (Math.abs(major) >= 1_000_000) return `${sym}${(major / 1_000_000).toFixed(1)}m`;
  if (Math.abs(major) >= 1_000) return `${sym}${Math.round(major / 1_000)}k`;
  return `${sym}${Math.round(major)}`;
}

export function TrendChart({
  points: raw,
  currency,
  label,
  color = "var(--brand)",
}: {
  points: TrendSeriesPoint[];
  currency: string;
  label: string;
  color?: string;
}) {
  const first = raw.findIndex((p) => p.value !== null);
  const points = (first < 0 ? [] : raw.slice(first)).map((p) => ({ date: p.date, value: p.value ?? 0 }));
  if (points.length < 2) {
    return <p className="px-5 py-10 text-center text-table text-muted">No history yet. Snapshots are taken daily, so the trend fills in over time.</p>;
  }
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * iw;
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, max / 2, max];
  const xLabels = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const last = points[points.length - 1];

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${label}: ${formatMoney(points[0].value, currency)} on ${formatDate(points[0].date)} to ${formatMoney(last.value, currency)} on ${formatDate(last.date)}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--ink-faint)">
              {shortMoney(t, currency)}
            </text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--ink-faint)">
            {formatDate(points[i].date).replace(/, \d{4}$/, "")}
          </text>
        ))}
        <path d={area} fill={color} opacity="0.06" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.value)} r="3.5" fill="var(--surface)" stroke={color} strokeWidth="2" />
      </svg>
      <details className="border-t border-rule px-5 py-2 text-table">
        <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 font-medium">Date</th>
              <th scope="col" className="py-1 text-right font-medium">{label}</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.date} className="border-t border-rule">
                <td className="py-1">{formatDate(p.date)}</td>
                <td className="num py-1 text-right">{formatMoney(p.value, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
