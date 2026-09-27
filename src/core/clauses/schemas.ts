import { z } from "zod";

// Contract terms per clause type (spec §4.4). These are what a human confirms.
// Dates are local calendar dates at the supplier ("YYYY-MM-DD"); times are local "HH:mm".

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2027-10-21");
export const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 17:00");
const pct = z.number().min(0).max(100);
const minor = z.number().int().nonnegative();

export const CLAUSE_TYPES = [
  "PAYMENT",
  "ROOM_BLOCK",
  "FB_MINIMUM",
  "CANCELLATION",
  "FINAL_GUARANTEE",
  "OTHER_DEADLINE",
] as const;
export type ClauseType = (typeof CLAUSE_TYPES)[number];

export const paymentTerms = z
  .object({
    label: z.string().min(1).default("Deposit"),
    dueDate: localDate,
    dueTime: localTime.default("17:00"),
    amountMinor: minor.nullable().default(null),
    percentOfContract: pct.nullable().default(null),
    refundable: z.boolean().default(false),
  })
  .refine((v) => (v.amountMinor === null) !== (v.percentOfContract === null), {
    message: "Enter either a fixed amount or a percentage of the contract value, not both",
    path: ["amountMinor"],
  });

export const roomNight = z.object({
  date: localDate,
  rooms: z.number().int().min(0),
  rateMinor: minor,
});

export const roomBlockTerms = z
  .object({
    blockName: z.string().min(1).default("Main block"),
    nights: z.array(roomNight).min(1, "Add at least one night"),
    commitmentPct: pct,
    basis: z.enum(["PER_NIGHT", "CUMULATIVE"]),
    damagesPct: pct.default(100),
    cutoffDate: localDate,
    cutoffTime: localTime.default("17:00"),
    reviewPoints: z.array(z.object({ date: localDate, maxReductionPct: pct })).default([]),
  })
  .superRefine((v, ctx) => {
    const dates = v.nights.map((n) => n.date);
    if (new Set(dates).size !== dates.length) {
      ctx.addIssue({ code: "custom", message: "Each night can appear only once", path: ["nights"] });
    }
  });

export const fbMinimumTerms = z.object({
  label: z.string().min(1).default("Food & beverage minimum"),
  minimumMinor: minor,
  // Informational: what the minimum is measured against in the contract.
  basis: z.enum(["PRE_TAX_PRE_SERVICE", "INCLUSIVE"]).default("PRE_TAX_PRE_SERVICE"),
  // Service charge / tax the supplier adds to any shortfall.
  surchargePct: pct.default(0),
});

// Tiers are ordered steps: each applies from `startsOn` until the next tier starts.
// Before the first tier there is no penalty. A step-up date belongs to the higher tier.
// This representation cannot have gaps or overlaps by construction.
export const cancellationTier = z.object({
  startsOn: localDate,
  penaltyPct: pct.nullable().default(null),
  penaltyFixedMinor: minor.nullable().default(null),
});

export const cancellationTerms = z
  .object({
    tiers: z.array(cancellationTier).min(1, "Add at least one cancellation tier"),
    basis: z.enum(["CONTRACT_VALUE", "ROOM_REVENUE", "FB_MINIMUM", "FIXED"]),
    depositTreatment: z.enum(["CREDITED", "ADDITIONAL"]).default("CREDITED"),
  })
  .superRefine((v, ctx) => {
    v.tiers.forEach((t, i) => {
      const fixed = v.basis === "FIXED";
      if (fixed && t.penaltyFixedMinor === null)
        ctx.addIssue({ code: "custom", message: "Enter the fixed penalty", path: ["tiers", i, "penaltyFixedMinor"] });
      if (!fixed && t.penaltyPct === null)
        ctx.addIssue({ code: "custom", message: "Enter the penalty percentage", path: ["tiers", i, "penaltyPct"] });
      if (i > 0 && t.startsOn <= v.tiers[i - 1].startsOn)
        ctx.addIssue({
          code: "custom",
          message: "Each tier must start after the previous one",
          path: ["tiers", i, "startsOn"],
        });
    });
  });

export const finalGuaranteeTerms = z.object({
  dueDate: localDate,
  dueTime: localTime.default("12:00"),
  subject: z.enum(["ATTENDANCE", "FB_COVERS"]).default("FB_COVERS"),
  tolerancePct: pct.default(0),
});

export const otherDeadlineTerms = z.object({
  label: z.string().min(1),
  dueDate: localDate,
  dueTime: localTime.default("17:00"),
});

export const termsSchemaByType = {
  PAYMENT: paymentTerms,
  ROOM_BLOCK: roomBlockTerms,
  FB_MINIMUM: fbMinimumTerms,
  CANCELLATION: cancellationTerms,
  FINAL_GUARANTEE: finalGuaranteeTerms,
  OTHER_DEADLINE: otherDeadlineTerms,
} as const;

export type PaymentTerms = z.infer<typeof paymentTerms>;
export type RoomBlockTerms = z.infer<typeof roomBlockTerms>;
export type FbMinimumTerms = z.infer<typeof fbMinimumTerms>;
export type CancellationTerms = z.infer<typeof cancellationTerms>;
export type FinalGuaranteeTerms = z.infer<typeof finalGuaranteeTerms>;
export type OtherDeadlineTerms = z.infer<typeof otherDeadlineTerms>;

export type TermsByType = {
  PAYMENT: PaymentTerms;
  ROOM_BLOCK: RoomBlockTerms;
  FB_MINIMUM: FbMinimumTerms;
  CANCELLATION: CancellationTerms;
  FINAL_GUARANTEE: FinalGuaranteeTerms;
  OTHER_DEADLINE: OtherDeadlineTerms;
};

export function parseTerms<T extends ClauseType>(type: T, data: unknown): TermsByType[T] {
  return termsSchemaByType[type].parse(data) as TermsByType[T];
}

// Planner inputs (not contract terms).
export const roomBlockInputs = z.object({
  projection: z.enum(["CURRENT", "FORECAST"]).default("CURRENT"),
});
export const fbMinimumInputs = z.object({
  forecastMethod: z.enum(["MANUAL", "PER_HEAD"]).default("PER_HEAD"),
  forecastManualMinor: minor.nullable().default(null),
  perHeadMinor: minor.nullable().default(null),
});
export type RoomBlockInputs = z.infer<typeof roomBlockInputs>;
export type FbMinimumInputs = z.infer<typeof fbMinimumInputs>;
