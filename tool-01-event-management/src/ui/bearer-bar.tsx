import { formatMoney } from "@/core/money";

// One stacked bar: agency / client / unassigned (hatched). The split is the point, so this
// is the one chart on the overview (docs/04 §5.1). Exact figures are always printed below.
export function BearerBar({
  agencyMinor,
  clientMinor,
  unassignedMinor,
  currency,
  compact,
}: {
  agencyMinor: number;
  clientMinor: number;
  unassignedMinor: number;
  currency: string;
  compact?: boolean;
}) {
  const total = agencyMinor + clientMinor + unassignedMinor;
  const pct = (v: number) => (total === 0 ? 0 : (v / total) * 100);
  const label = `Agency ${formatMoney(agencyMinor, currency)}, client ${formatMoney(clientMinor, currency)}, unassigned ${formatMoney(unassignedMinor, currency)}`;
  return (
    <div>
      <div
        role="img"
        aria-label={label}
        className={`flex w-full gap-px overflow-hidden rounded-full bg-sunken ${compact ? "h-1.5" : "h-2"}`}
      >
        {total === 0 ? null : (
          <>
            <span style={{ width: `${pct(agencyMinor)}%` }} className="bg-agency" />
            <span style={{ width: `${pct(clientMinor)}%` }} className="bg-client" />
            <span style={{ width: `${pct(unassignedMinor)}%` }} className="hatch" />
          </>
        )}
      </div>
      {compact ? null : (
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-meta">
          <Legend swatch="bg-agency" label="Agency" value={formatMoney(agencyMinor, currency)} />
          <Legend swatch="bg-client" label="Client" value={formatMoney(clientMinor, currency)} />
          <Legend swatch="hatch" label="Unassigned" value={formatMoney(unassignedMinor, currency)} />
        </dl>
      )}
    </div>
  );
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-2 rounded-full ${swatch}`} aria-hidden />
      <dt className="text-muted">{label}</dt>
      <dd className="num font-medium text-ink">{value}</dd>
    </div>
  );
}
