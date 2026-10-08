import { z } from "zod";

// Per-organisation configuration (spec §14). Seeded from config/clients/<name>.json,
// stored in organizations.config, edited in Settings. Core logic never branches on
// client identity, only on these values.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #1F4F73");
const currency = z.string().regex(/^[A-Z]{3}$/, "Use an ISO 4217 code, e.g. USD");
const noun = z.object({ singular: z.string().min(1), plural: z.string().min(1) });

export const ROLE_KEYS = ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER", "FINANCE", "MD"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const orgConfigSchema = z.object({
  demo: z.boolean().default(false),
  brand: z.object({
    productName: z.string().min(1).default("Exposure Register"),
    logoFileId: z.string().nullable().default(null),
    // Buttons, links, focus. Must reach 4.5:1 with white text (checked in Settings and seed).
    primaryColor: hex.default("#8A5D12"),
    // Highlights on the midnight chrome and photo scrims. Must reach 3:1 against midnight.
    accentColor: hex.default("#C8912E"),
    // Wallpaper key from src/config/imagery.ts, or "plain". Users can override in Appearance.
    defaultWallpaper: z.string().default("ballroom"),
  }),
  terminology: z.object({
    event: noun.default({ singular: "Event", plural: "Events" }),
    client: noun.default({ singular: "Client", plural: "Clients" }),
    supplier: noun.default({ singular: "Supplier", plural: "Suppliers" }),
    changeRequest: noun.default({ singular: "Change request", plural: "Change requests" }),
  }),
  workflow: z.object({
    eventTypes: z.array(z.string().min(1)).min(1),
  }),
  clauseDefaults: z.object({
    attritionCommitmentPct: z.number().min(0).max(100).default(80),
    attritionDamagesPct: z.number().min(0).max(100).default(100),
    fbShortfallSurchargePct: z.number().min(0).max(100).default(0),
  }),
  rules: z.object({
    reminderOffsetsDays: z.array(z.number().int().min(0).max(365)).default([30, 14, 7, 1]),
    overdueEscalationHours: z.number().int().min(1).default(24),
    exposureThresholdMinor: z.number().int().min(0),
    tierStepWarningDays: z.number().int().min(1).default(14),
    cutoffWarningDays: z.number().int().min(1).default(21),
    approvalLimitMinor: z.number().int().min(0),
    marginFloorPct: z.number().min(0).max(100).default(12),
    approvalLinkExpiryDays: z.number().int().min(1).max(60).default(14),
    escalateTo: z.array(z.enum(ROLE_KEYS)).default(["OPS_DIRECTOR"]),
    internalApproverRoles: z.array(z.enum(ROLE_KEYS)).default(["MD", "OPS_DIRECTOR"]),
  }),
  pricing: z.object({
    defaultMarkupPct: z.number().min(0).max(500).default(15),
    markupByCategoryPct: z.record(z.string(), z.number().min(0).max(500)).default({}),
    managementFeePct: z.number().min(0).max(100).default(0),
  }),
  roles: z.object({
    labels: z.record(z.enum(ROLE_KEYS), z.string()).default({
      ADMIN: "Admin",
      OPS_DIRECTOR: "Operations director",
      EVENT_MANAGER: "Event manager",
      FINANCE: "Finance",
      MD: "Managing director",
    }),
  }),
  finance: z.object({
    enabledCurrencies: z.array(currency).min(1),
  }),
  email: z.object({
    senderName: z.string().min(1),
    replyTo: z.email().nullable().default(null),
  }),
  extraction: z.object({
    enabled: z.boolean().default(false),
    effort: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
  }),
});

export type OrgConfig = z.infer<typeof orgConfigSchema>;

// Organisation-level fields that live in columns, not in config JSON.
export const orgSeedSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  baseCurrency: currency,
  timezone: z.string().min(1),
  config: orgConfigSchema,
});

export type OrgSeed = z.infer<typeof orgSeedSchema>;

export const MIDNIGHT = "#0E1726";

// WCAG relative luminance contrast, used to reject brand colours that would make
// white button text or brand links unreadable (≥ 4.5:1 against white), and accent
// colours that would disappear on the midnight chrome (≥ 3:1 against MIDNIGHT).

function luminance(hexColor: string): number {
  const n = parseInt(hexColor.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function contrastAgainstWhite(hexColor: string): number {
  return contrastRatio(hexColor, "#FFFFFF");
}
