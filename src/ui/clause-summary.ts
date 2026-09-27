import type { ClauseType } from "@/core/clauses/schemas";
import { formatMoney, sum } from "@/core/money";
import { formatDate } from "./format";

type Obj = Record<string, unknown>;
const money = (m: unknown, ccy: string) => (typeof m === "number" ? formatMoney(m, ccy) : "Not set");
const date = (d: unknown) => (typeof d === "string" && d ? formatDate(d) : "Not set");

/** Plain-language summary rows of a clause's terms, for record pages and review. */
export function summarizeClause(type: ClauseType, t: Obj, currency: string): Array<[string, string]> {
  switch (type) {
    case "PAYMENT":
      return [
        ["Due", `${date(t.dueDate)} ${t.dueTime ?? ""}`.trim()],
        ["Amount", t.amountMinor !== null && t.amountMinor !== undefined ? money(t.amountMinor, currency) : `${t.percentOfContract}% of contract value`],
        ["Refundable", t.refundable ? "Yes" : "No"],
      ];
    case "ROOM_BLOCK": {
      const nights = (t.nights as Array<{ date: string; rooms: number; rateMinor: number }>) ?? [];
      const roomNights = sum(nights.map((n) => n.rooms));
      const first = nights[0]?.date;
      const last = nights[nights.length - 1]?.date;
      return [
        ["Nights", nights.length ? `${nights.length} (${date(first)}${nights.length > 1 ? ` – ${date(last)}` : ""})` : "None"],
        ["Room nights", roomNights.toLocaleString("en-US")],
        ["Committed", `${t.commitmentPct}% ${t.basis === "CUMULATIVE" ? "across all nights" : "per night"}`],
        ["Damages", `${t.damagesPct ?? 100}% of rate`],
        ["Room revenue", money(sum(nights.map((n) => n.rooms * n.rateMinor)), currency)],
        ["Cutoff", `${date(t.cutoffDate)} ${t.cutoffTime ?? ""}`.trim()],
        ...((t.reviewPoints as Array<{ date: string; maxReductionPct: number }>) ?? []).map(
          (r, i) => [`Review ${i + 1}`, `${date(r.date)}: reduce up to ${r.maxReductionPct}%`] as [string, string],
        ),
      ];
    }
    case "FB_MINIMUM":
      return [
        ["Minimum", money(t.minimumMinor, currency)],
        ["Measured on", t.basis === "INCLUSIVE" ? "Total including tax and service" : "F&B before tax and service"],
        ["Shortfall surcharge", `${t.surchargePct ?? 0}%`],
      ];
    case "CANCELLATION": {
      const basis: Record<string, string> = {
        CONTRACT_VALUE: "contracted value",
        ROOM_REVENUE: "room revenue",
        FB_MINIMUM: "F&B minimum",
        FIXED: "fixed amounts",
      };
      const tiers = (t.tiers as Array<{ startsOn: string; penaltyPct: number | null; penaltyFixedMinor: number | null }>) ?? [];
      return [
        ["Calculated on", basis[String(t.basis)] ?? "Not set"],
        ["Deposits", t.depositTreatment === "ADDITIONAL" ? "Forfeited in addition" : "Credited against the penalty"],
        ...tiers.map(
          (tier) =>
            [`From ${date(tier.startsOn)}`, tier.penaltyPct !== null ? `${tier.penaltyPct}%` : money(tier.penaltyFixedMinor, currency)] as [string, string],
        ),
      ];
    }
    case "FINAL_GUARANTEE":
      return [
        ["Covers", t.subject === "ATTENDANCE" ? "Attendance" : "F&B covers"],
        ["Due", `${date(t.dueDate)} ${t.dueTime ?? ""}`.trim()],
        ["Allowed variance", `${t.tolerancePct ?? 0}%`],
      ];
    case "OTHER_DEADLINE":
      return [["Due", `${date(t.dueDate)} ${t.dueTime ?? ""}`.trim()]];
  }
}

const FIELD_LABELS: Record<string, string> = {
  label: "Name",
  dueDate: "Due date",
  dueTime: "Due time",
  amount: "Amount",
  amountMinor: "Amount",
  percentOfContract: "Percentage of contract",
  refundable: "Refundable",
  blockName: "Block name",
  nights: "Nights",
  date: "date",
  rooms: "rooms",
  rate: "rate",
  rateMinor: "rate",
  commitmentPct: "Committed pickup",
  basis: "Basis",
  damagesPct: "Damages",
  cutoffDate: "Cutoff date",
  cutoffTime: "Cutoff time",
  reviewPoints: "Review points",
  minimum: "Minimum spend",
  minimumMinor: "Minimum spend",
  surchargePct: "Shortfall surcharge",
  depositTreatment: "Deposit treatment",
  tiers: "Cancellation tiers",
  startsOn: "start date",
  penaltyPct: "penalty",
  penaltyFixedMinor: "penalty",
  subject: "Covers",
  tolerancePct: "Allowed variance",
};

/** "nights.1.date" → "Nights, row 2: date"; "dueDate" → "Due date". */
export function fieldLabel(path: string): string {
  const parts = path.split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^\d+$/.test(p)) out[out.length - 1] += `, row ${Number(p) + 1}:`;
    else out.push(FIELD_LABELS[p] ?? p);
  }
  return out.join(" ").replace(/: $/, "").replace(/:$/, "");
}
