import { z } from "zod";
import { termsSchemaByType, type ClauseType } from "../clauses/schemas";

// What the model must return. Deliberately simple and permissive (every value nullable,
// amounts in major units) so structured output can express it; the result is mapped to the
// strict domain schemas afterwards and a human confirms every value.

const source = z.object({
  field: z.string().describe("Which value this quote supports, e.g. dueDate, commitmentPct, tiers"),
  quote: z.string().describe("Verbatim text copied from the document, 5–40 words"),
  page: z.number().int().describe("1-based page number where the quote appears"),
});

const date = z.string().nullable().describe("YYYY-MM-DD, resolved to an absolute date; null if not stated");
const time = z.string().nullable().describe("24h HH:mm local to the supplier; null if not stated");
const money = z.number().nullable().describe("Amount in major currency units, e.g. 48000.00; null if not stated");
const pct = z.number().nullable().describe("Percentage as a number, e.g. 80 for 80%; null if not stated");

export const extractionSchema = z.object({
  contract: z.object({
    currency: z.string().nullable().describe("ISO 4217 code of the contract's amounts"),
    contractedValue: money,
    signedDate: date,
  }),
  payments: z.array(
    z.object({
      label: z.string(),
      dueDate: date,
      dueTime: time,
      amount: money,
      percentOfContract: pct,
      refundable: z.boolean().nullable(),
      sources: z.array(source),
    }),
  ),
  roomBlocks: z.array(
    z.object({
      blockName: z.string(),
      nights: z.array(z.object({ date: z.string(), rooms: z.number().int(), rate: z.number() })),
      commitmentPct: pct,
      basis: z.enum(["PER_NIGHT", "CUMULATIVE"]).nullable(),
      damagesPct: pct,
      cutoffDate: date,
      cutoffTime: time,
      reviewPoints: z.array(z.object({ date: z.string(), maxReductionPct: z.number() })),
      sources: z.array(source),
    }),
  ),
  fbMinimums: z.array(
    z.object({
      label: z.string(),
      minimum: money,
      basis: z.enum(["PRE_TAX_PRE_SERVICE", "INCLUSIVE"]).nullable(),
      surchargePct: pct,
      sources: z.array(source),
    }),
  ),
  cancellations: z.array(
    z.object({
      basis: z.enum(["CONTRACT_VALUE", "ROOM_REVENUE", "FB_MINIMUM", "FIXED"]).nullable(),
      depositTreatment: z.enum(["CREDITED", "ADDITIONAL"]).nullable(),
      tiers: z.array(z.object({ startsOn: z.string(), penaltyPct: pct, penaltyFixed: money })),
      sources: z.array(source),
    }),
  ),
  finalGuarantees: z.array(
    z.object({
      subject: z.enum(["ATTENDANCE", "FB_COVERS"]).nullable(),
      dueDate: date,
      dueTime: time,
      tolerancePct: pct,
      sources: z.array(source),
    }),
  ),
  otherDeadlines: z.array(z.object({ label: z.string(), dueDate: date, dueTime: time, sources: z.array(source) })),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;
export type SourceRef = { quote: string; page: number; verified: boolean };

export type ProposedClause = {
  type: ClauseType;
  label: string;
  terms: Record<string, unknown>;
  /** Terms pass the domain schema as proposed (they can still be edited before confirming). */
  valid: boolean;
  problems: string[];
  sources: Record<string, SourceRef>;
};

const minor = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.round(v * 100));

/** Case/whitespace/quote-insensitive form for matching quotes against page text. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks each quote against the document text: on the stated page first, then any page.
 * Confidence comes from this check, never from the model's opinion of itself.
 */
export function verifySources(
  sources: Array<{ field: string; quote: string; page: number }>,
  pages: string[],
): Record<string, SourceRef> {
  const normPages = pages.map(normalizeForMatch);
  const out: Record<string, SourceRef> = {};
  for (const s of sources) {
    const q = normalizeForMatch(s.quote);
    let page = s.page;
    let verified = q.length >= 8 && (normPages[s.page - 1] ?? "").includes(q);
    if (!verified && q.length >= 8) {
      const found = normPages.findIndex((p) => p.includes(q));
      if (found >= 0) {
        verified = true;
        page = found + 1;
      }
    }
    // Keep the first source per field; a verified one wins over an unverified one.
    if (!out[s.field] || (!out[s.field].verified && verified)) out[s.field] = { quote: s.quote, page, verified };
  }
  return out;
}

function check(type: ClauseType, terms: Record<string, unknown>): { valid: boolean; problems: string[] } {
  const res = termsSchemaByType[type].safeParse(terms);
  return res.success ? { valid: true, problems: [] } : { valid: false, problems: res.error.issues.map((i) => `${i.path.join(".") || type}: ${i.message}`) };
}

/** Maps the model's output to domain clause proposals with verified sources. */
export function toProposals(result: ExtractionResult, pages: string[]): ProposedClause[] {
  const out: ProposedClause[] = [];
  const push = (type: ClauseType, label: string, terms: Record<string, unknown>, sources: ExtractionResult["payments"][number]["sources"]) => {
    out.push({ type, label, terms, ...check(type, terms), sources: verifySources(sources, pages) });
  };

  for (const p of result.payments) {
    push("PAYMENT", p.label || "Payment", {
      label: p.label || "Payment",
      dueDate: p.dueDate ?? "",
      dueTime: p.dueTime ?? "17:00",
      amountMinor: p.percentOfContract !== null ? null : minor(p.amount),
      percentOfContract: p.percentOfContract,
      refundable: p.refundable ?? false,
    }, p.sources);
  }
  for (const b of result.roomBlocks) {
    push("ROOM_BLOCK", b.blockName || "Room block", {
      blockName: b.blockName || "Room block",
      nights: b.nights.map((n) => ({ date: n.date, rooms: n.rooms, rateMinor: minor(n.rate) ?? 0 })),
      commitmentPct: b.commitmentPct,
      basis: b.basis ?? "PER_NIGHT",
      damagesPct: b.damagesPct ?? 100,
      cutoffDate: b.cutoffDate ?? "",
      cutoffTime: b.cutoffTime ?? "17:00",
      reviewPoints: b.reviewPoints,
    }, b.sources);
  }
  for (const f of result.fbMinimums) {
    push("FB_MINIMUM", f.label || "Food & beverage minimum", {
      label: f.label || "Food & beverage minimum",
      minimumMinor: minor(f.minimum),
      basis: f.basis ?? "PRE_TAX_PRE_SERVICE",
      surchargePct: f.surchargePct ?? 0,
    }, f.sources);
  }
  for (const c of result.cancellations) {
    push("CANCELLATION", "Cancellation schedule", {
      basis: c.basis ?? "CONTRACT_VALUE",
      depositTreatment: c.depositTreatment ?? "CREDITED",
      tiers: c.tiers
        .slice()
        .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
        .map((t) => ({ startsOn: t.startsOn, penaltyPct: t.penaltyPct, penaltyFixedMinor: minor(t.penaltyFixed) })),
    }, c.sources);
  }
  for (const g of result.finalGuarantees) {
    push("FINAL_GUARANTEE", "Final guarantee", {
      dueDate: g.dueDate ?? "",
      dueTime: g.dueTime ?? "12:00",
      subject: g.subject ?? "FB_COVERS",
      tolerancePct: g.tolerancePct ?? 0,
    }, g.sources);
  }
  for (const d of result.otherDeadlines) {
    push("OTHER_DEADLINE", d.label || "Deadline", { label: d.label || "Deadline", dueDate: d.dueDate ?? "", dueTime: d.dueTime ?? "17:00" }, d.sources);
  }
  return out;
}
