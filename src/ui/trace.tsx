import type { Trace } from "@/core/rules/types";
import { formatDay } from "@/core/dates";

// The signal trace (docs/09, signature component): a metric over the last 30 days against its
// threshold. The segment above the line is drawn in signal-ink with a live dot at the latest
// point. It always carries a sentence for screen readers and never appears without a threshold.

export function traceSentence(t: Trace): string {
  const first = t.points[0];
  const last = t.points.at(-1);
  if (!first || !last) return `${t.label}: no data`;
  const move = last.value > first.value ? "rose" : last.value < first.value ? "fell" : "held";
  return `${t.label} ${move} from ${fmt(first.value)} to ${fmt(last.value)} between ${formatDay(first.date)} and ${formatDay(last.date)}; threshold ${fmt(t.threshold)}.`;
}

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1));

export function SignalTrace({ trace, width = 120, height = 32, axes = false, fluid = false }: { trace: Trace | null; width?: number; height?: number; axes?: boolean; fluid?: boolean }) {
  if (!trace || trace.points.length < 2) return <span className="text-meta text-faint">No trace</span>;
  const pad = axes ? { l: 36, r: 8, t: 8, b: 20 } : { l: 1, r: 4, t: 3, b: 3 };
  const values = trace.points.map((p) => p.value);
  const lo = Math.min(...values, trace.threshold);
  const hi = Math.max(...values, trace.threshold);
  const span = hi - lo || 1;
  const x = (i: number) => pad.l + (i / (trace.points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (height - pad.t - pad.b);
  const path = trace.points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  // The over-threshold part: same path, clipped to the area above the threshold line.
  const ty = y(trace.threshold);
  const id = `clip-${Math.round(trace.threshold * 100)}-${trace.points.length}-${Math.round(values.at(-1)! * 10)}`;
  const last = trace.points.length - 1;
  const over = values.at(-1)! >= trace.threshold;
  return (
    <svg
      role="img"
      aria-label={traceSentence(trace)}
      width={fluid ? "100%" : width}
      height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMinYMid meet"
      className={fluid ? "block h-auto w-full overflow-visible" : "block shrink-0 overflow-visible"}
    >
      <defs>
        <clipPath id={id}>
          <rect x={0} y={0} width={width} height={Math.max(0, ty)} />
        </clipPath>
      </defs>
      {axes ? (
        <g className="fill-faint font-mono" fontSize={10}>
          {Math.abs(y(hi) - ty) > 10 ? (
            <text x={pad.l - 6} y={y(hi) + 3} textAnchor="end">
              {fmt(hi)}
            </text>
          ) : null}
          {Math.abs(y(lo) - ty) > 10 ? (
            <text x={pad.l - 6} y={y(lo) + 3} textAnchor="end">
              {fmt(lo)}
            </text>
          ) : null}
          <text x={pad.l} y={height - 4}>
            {formatDay(trace.points[0].date)}
          </text>
          <text x={width - pad.r} y={height - 4} textAnchor="end">
            {formatDay(trace.points[last].date)}
          </text>
        </g>
      ) : null}
      <line x1={pad.l} x2={width - pad.r} y1={ty} y2={ty} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
      {axes ? (
        <text x={width - pad.r} y={ty - 4} textAnchor="end" className="fill-muted font-mono" fontSize={10}>
          threshold {fmt(trace.threshold)}
        </text>
      ) : null}
      <path d={path} fill="none" stroke="var(--text)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <path d={path} fill="none" stroke="var(--signal-ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id})`} />
      {over ? (
        <>
          <circle cx={x(last)} cy={y(values[last])} r={axes ? 5 : 3.5} fill="var(--accent)" stroke="var(--signal-ink)" strokeWidth={1.5} />
        </>
      ) : (
        <circle cx={x(last)} cy={y(values[last])} r={2.5} fill="var(--text)" />
      )}
    </svg>
  );
}
