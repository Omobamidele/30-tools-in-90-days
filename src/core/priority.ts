import { formatMoney } from "./money";

// Priority is a transparent sum, shown line by line on the signal (spec FR-11). No hidden model:
// RevOps has to be able to explain why one signal sits above another.

export type PriorityInput = {
  valueMinor: number | null;
  currency: string;
  ruleWeight: number;
  renewalInDays: number | null;
  renewalBoostDays: number;
  openEscalations: number;
};

export type Priority = { score: number; lines: string[] };

const BANDS: Array<{ upToMinor: number; points: number }> = [
  { upToMinor: 500_000, points: 20 },
  { upToMinor: 1_500_000, points: 35 },
  { upToMinor: 4_000_000, points: 50 },
  { upToMinor: Number.POSITIVE_INFINITY, points: 65 },
];

export function scorePriority(p: PriorityInput): Priority {
  const lines: string[] = [];
  let score = 0;
  if (p.valueMinor === null) {
    score += 10;
    lines.push("+10 value not estimated");
  } else {
    const band = BANDS.find((b) => p.valueMinor! <= b.upToMinor)!;
    score += band.points;
    lines.push(`+${band.points} estimated ${formatMoney(p.valueMinor, p.currency)} a year`);
  }
  if (p.ruleWeight) {
    score += p.ruleWeight;
    lines.push(`+${p.ruleWeight} rule weight`);
  }
  if (p.renewalInDays !== null && p.renewalInDays >= 0 && p.renewalInDays <= p.renewalBoostDays) {
    score += 10;
    lines.push(`+10 renewal in ${p.renewalInDays} days: the expansion can ride the renewal`);
  }
  if (p.openEscalations > 0) {
    score -= 15;
    lines.push(`−15 ${p.openEscalations} open support escalation${p.openEscalations === 1 ? "" : "s"}: talk to support first`);
  }
  return { score: Math.max(0, Math.min(100, score)), lines };
}
