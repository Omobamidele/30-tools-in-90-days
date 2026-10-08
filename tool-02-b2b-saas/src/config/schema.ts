import { z } from "zod";

// Client configuration (white-label). Everything that names a tenant, prices its product or
// tunes its process lives here; the core never refers to a specific company (spec §13).

export const ROLE_KEYS = ["ADMIN", "REVOPS", "CS_LEAD", "CSM", "SALES_LEAD", "SELLER", "EXEC"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const RULE_TYPES = ["SEAT_PRESSURE", "USAGE_PACE", "NEW_TEAM", "FEATURE_INTENT", "NEW_EXECUTIVE"] as const;
export type RuleType = (typeof RULE_TYPES)[number];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #0D6B6B");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const priceBookSchema = z.object({
  currency: z.string().length(3),
  /** Annual list price of one seat, in minor units. */
  seatPriceMinor: z.number().int().nonnegative(),
  /** Seat signals propose at least this many seats (vendors rarely sell one at a time). */
  minSeatAddOn: z.number().int().min(1).default(5),
  /** Extra headroom over current active seats when sizing a seat proposal. */
  seatHeadroomPct: z.number().min(0).max(100).default(10),
  /** Annual commitment tiers for the usage metric, ascending. */
  creditTiers: z.array(z.object({ committed: z.number().int().positive(), priceMinor: z.number().int().nonnegative() })).default([]),
  /** Price per 1,000 units above the commitment, used when no larger tier exists. */
  overagePer1000Minor: z.number().int().nonnegative().default(0),
  addons: z.array(z.object({ key: z.string().min(1), name: z.string().min(1), priceMinor: z.number().int().nonnegative() })).default([]),
});
export type PriceBook = z.infer<typeof priceBookSchema>;

export const ruleParamsSchemas = {
  SEAT_PRESSURE: z.object({ utilisationPct: z.number().min(1).max(200), sustainDays: z.number().int().min(1).max(90) }),
  USAGE_PACE: z.object({ projectedPct: z.number().min(50).max(500), minElapsedPct: z.number().min(0).max(100) }),
  NEW_TEAM: z.object({ withinDays: z.number().int().min(1).max(365), minActiveUsers: z.number().int().min(1) }),
  FEATURE_INTENT: z.object({ minAttempts: z.number().int().min(1), windowDays: z.number().int().min(1).max(90) }),
  NEW_EXECUTIVE: z.object({ withinDays: z.number().int().min(1).max(365), seniorities: z.array(z.enum(["EXEC", "VP", "DIRECTOR"])).min(1) }),
} as const;

export type RuleParams = { [K in RuleType]: z.infer<(typeof ruleParamsSchemas)[K]> };

export const ruleSeedSchema = z.object({
  key: z.string().min(1),
  type: z.enum(RULE_TYPES),
  name: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  weight: z.number().int().min(0).max(20).default(10),
  minArrMinor: z.number().int().nonnegative().default(0),
  segments: z.array(z.string()).default([]),
  cooldownDays: z.number().int().min(0).max(365).default(30),
  enabled: z.boolean().default(true),
});
export type RuleSeed = z.infer<typeof ruleSeedSchema>;

export const orgConfigSchema = z.object({
  brand: z.object({
    productName: z.string().default("Signal Desk"),
    logoText: z.string().max(3).default("SD"),
    primaryColor: hex.default("#0D6B6B"),
    accentColor: hex.default("#C8F03C"),
  }),
  terminology: z.object({
    csql: z.string().default("CSQL"),
    csqlPlural: z.string().default("CSQLs"),
    seats: z.string().default("Seats"),
    seatSingular: z.string().default("seat"),
    usageMetric: z.string().default("Credits"),
    usageUnit: z.string().default("credits"),
  }),
  priceBook: priceBookSchema,
  segments: z.array(z.object({ key: z.string(), name: z.string() })).default([]),
  deadlines: z.object({
    triageBusinessDays: z.number().int().min(1).max(20).default(2),
    sellerBusinessDays: z.number().int().min(1).max(20).default(1),
    /** ISO weekdays that count as business days (1 = Monday … 7 = Sunday). */
    businessDays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5]),
    holidays: z.array(isoDate).default([]),
  }),
  detection: z.object({
    staleAfterDays: z.number().int().min(1).default(3),
    expireAfterDays: z.number().int().min(1).default(7),
    materialChangePct: z.number().min(0).default(25),
    renewalBoostDays: z.number().int().min(0).default(120),
    highPriorityScore: z.number().int().min(0).max(100).default(70),
  }),
  dismissReasons: z.array(z.string().min(1)).min(1),
  returnReasons: z.array(z.string().min(1)).min(1),
  lostReasons: z.array(z.string().min(1)).min(1),
});
export type OrgConfig = z.infer<typeof orgConfigSchema>;

export const orgSeedSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  timezone: z.string().min(1),
  currency: z.string().length(3),
  demo: z.boolean().default(false),
  config: orgConfigSchema,
  rules: z.array(ruleSeedSchema).default([]),
});
export type OrgSeed = z.infer<typeof orgSeedSchema>;

/** Relative luminance contrast (WCAG 2.x) for the white-label colour checks. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const INK = "#0F2B2E";

/** White-label colour rules (docs/09): brand ≥ 4.5:1 with white text, accent ≥ 3:1 on ink. */
export function brandProblems(brand: { primaryColor: string; accentColor: string }): string[] {
  const out: string[] = [];
  if (contrastRatio(brand.primaryColor, "#FFFFFF") < 4.5) out.push("Primary colour needs at least 4.5:1 contrast with white text.");
  if (contrastRatio(brand.accentColor, INK) < 3) out.push("Accent colour needs at least 3:1 contrast on the dark top bar.");
  return out;
}
