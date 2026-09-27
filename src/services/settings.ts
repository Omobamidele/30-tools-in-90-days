import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { accounts, extractionRuns, organizations, sessions, users } from "@/db/schema";
import { contrastAgainstWhite, contrastRatio, MIDNIGHT, orgConfigSchema, ROLE_KEYS, type OrgConfig, type RoleKey } from "@/config/schema";
import { parseMoney } from "@/core/money";
import { emailSender, renderEmail } from "@/adapters/email";
import { extractor } from "@/adapters/extraction";
import { storage } from "@/adapters/storage";
import { env } from "@/env";
import { PLAIN, WALLPAPERS } from "@/config/imagery";
import { assertCan, audit, changes, type ServiceCtx } from "./context";
import { conflict, invalidState, notFound, parseInput, validation } from "./errors";

export async function getSettings(ctx: ServiceCtx) {
  assertCan(ctx, "settings.view");
  const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.actor.orgId));
  return { org, config: orgConfigSchema.parse(org.config) };
}

const pct = z.coerce.number().min(0, "Can't be negative").max(100, "At most 100");
const money = z.string().refine((s) => parseMoney(s) !== null && (parseMoney(s) ?? -1) >= 0, "Enter an amount like 50,000.00");
const noun = z.object({ singular: z.string().trim().min(1, "Required").max(40), plural: z.string().trim().min(1, "Required").max(40) });

export const sectionSchemas = {
  organisation: z.object({
    name: z.string().trim().min(1, "Enter the organisation name").max(120),
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
  }),
  branding: z.object({
    productName: z.string().trim().min(1, "Enter a product name").max(60),
    primaryColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #1F4F73")
      .refine((c) => contrastAgainstWhite(c) >= 4.5, "This colour is too light: white text on it would be unreadable (needs 4.5:1)."),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #C8912E")
      .refine((c) => contrastRatio(c, MIDNIGHT) >= 3, "This colour is too dark to see on the navigation bar (needs 3:1)."),
    defaultWallpaper: z.enum([PLAIN, ...WALLPAPERS.map((w) => w.key)] as [string, ...string[]], { error: "Choose one of the listed wallpapers" }),
  }),
  terminology: z.object({ event: noun, client: noun, supplier: noun, changeRequest: noun }),
  workflow: z.object({ eventTypes: z.array(z.string().trim().min(1)).min(1, "Keep at least one event type") }),
  rules: z.object({
    reminderOffsetsDays: z.string().refine((s) => s.split(",").every((x) => /^\s*\d{1,3}\s*$/.test(x)), "Use whole days separated by commas, e.g. 30, 14, 7, 1"),
    overdueEscalationHours: z.coerce.number().int().min(1).max(720),
    exposureThreshold: money,
    tierStepWarningDays: z.coerce.number().int().min(1).max(120),
    cutoffWarningDays: z.coerce.number().int().min(1).max(120),
    approvalLimit: money,
    marginFloorPct: pct,
    approvalLinkExpiryDays: z.coerce.number().int().min(1).max(60),
    escalateTo: z.array(z.enum(ROLE_KEYS)).min(1, "Choose at least one role"),
    internalApproverRoles: z.array(z.enum(ROLE_KEYS)).min(1, "Choose at least one role"),
  }),
  pricing: z.object({
    defaultMarkupPct: z.coerce.number().min(0).max(500),
    managementFeePct: pct,
    categories: z.array(z.object({ name: z.string().trim().min(1, "Name the category"), markupPct: z.coerce.number().min(0).max(500) })),
  }),
  clauseDefaults: z.object({ attritionCommitmentPct: pct, attritionDamagesPct: pct, fbShortfallSurchargePct: pct }),
  currencies: z.object({ enabledCurrencies: z.array(z.string().regex(/^[A-Z]{3}$/)).min(1) }),
  email: z.object({ senderName: z.string().trim().min(1).max(80), replyTo: z.union([z.literal(""), z.email("Enter a valid email")]) }),
  extraction: z.object({ enabled: z.boolean(), effort: z.enum(["low", "medium", "high", "xhigh"]) }),
} as const;
export type SettingsSection = keyof typeof sectionSchemas;

/** Two-decimal currencies only: money is stored in hundredths. */
const TWO_DECIMAL = new Set(["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "NZD", "SGD", "HKD", "ZAR", "AED", "MXN", "BRL", "PLN", "CZK", "INR"]);

export async function saveSettings(ctx: ServiceCtx, section: SettingsSection, raw: unknown) {
  assertCan(ctx, "settings.edit");
  const { org, config } = await getSettings(ctx);
  const v = parseInput(sectionSchemas[section] as z.ZodType, raw) as Record<string, unknown>;
  const next: OrgConfig = structuredClone(config);
  const orgFields: Partial<typeof organizations.$inferInsert> = {};

  switch (section) {
    case "organisation":
      orgFields.name = v.name as string;
      orgFields.timezone = v.timezone as string;
      break;
    case "branding":
      next.brand.productName = v.productName as string;
      next.brand.primaryColor = (v.primaryColor as string).toUpperCase();
      next.brand.accentColor = (v.accentColor as string).toUpperCase();
      next.brand.defaultWallpaper = v.defaultWallpaper as string;
      break;
    case "terminology":
      next.terminology = v as OrgConfig["terminology"];
      break;
    case "workflow":
      next.workflow.eventTypes = [...new Set(v.eventTypes as string[])];
      break;
    case "rules": {
      const offsets = [...new Set((v.reminderOffsetsDays as string).split(",").map((x) => Number(x.trim())))].sort((a, b) => b - a);
      next.rules = {
        ...next.rules,
        reminderOffsetsDays: offsets,
        overdueEscalationHours: v.overdueEscalationHours as number,
        exposureThresholdMinor: parseMoney(v.exposureThreshold as string)!,
        tierStepWarningDays: v.tierStepWarningDays as number,
        cutoffWarningDays: v.cutoffWarningDays as number,
        approvalLimitMinor: parseMoney(v.approvalLimit as string)!,
        marginFloorPct: v.marginFloorPct as number,
        approvalLinkExpiryDays: v.approvalLinkExpiryDays as number,
        escalateTo: v.escalateTo as RoleKey[],
        internalApproverRoles: v.internalApproverRoles as RoleKey[],
      };
      break;
    }
    case "pricing": {
      const cats = v.categories as Array<{ name: string; markupPct: number }>;
      if (new Set(cats.map((c) => c.name.toLowerCase())).size !== cats.length) throw validation("Each category can appear only once.");
      next.pricing = {
        defaultMarkupPct: v.defaultMarkupPct as number,
        managementFeePct: v.managementFeePct as number,
        markupByCategoryPct: Object.fromEntries(cats.map((c) => [c.name, c.markupPct])),
      };
      break;
    }
    case "clauseDefaults":
      next.clauseDefaults = v as OrgConfig["clauseDefaults"];
      break;
    case "currencies": {
      const list = [...new Set(v.enabledCurrencies as string[])];
      const unsupported = list.filter((c) => !TWO_DECIMAL.has(c));
      if (unsupported.length) throw validation(`${unsupported.join(", ")} isn't supported yet (only currencies with two decimal places).`);
      if (!list.includes(org.baseCurrency)) throw validation(`${org.baseCurrency} is the reporting currency and must stay enabled.`);
      next.finance.enabledCurrencies = list;
      break;
    }
    case "email":
      next.email = { senderName: v.senderName as string, replyTo: (v.replyTo as string) || null };
      break;
    case "extraction":
      next.extraction = { enabled: v.enabled as boolean, effort: v.effort as OrgConfig["extraction"]["effort"] };
      break;
  }

  const validated = orgConfigSchema.parse(next);
  await ctx.db.transaction(async (tx) => {
    await tx.update(organizations).set({ config: validated, ...orgFields }).where(eq(organizations.id, org.id));
    await audit(tx, ctx, {
      entityType: "settings",
      entityId: org.id,
      action: `settings_${section}`,
      summary: `Changed ${section === "clauseDefaults" ? "term defaults" : section} settings`,
      diff: section === "organisation" ? changes(org, orgFields) : { before: (config as Record<string, unknown>)[sectionKey(section)], after: (validated as Record<string, unknown>)[sectionKey(section)] },
    });
  });
}

function sectionKey(s: SettingsSection) {
  return { organisation: "", branding: "brand", terminology: "terminology", workflow: "workflow", rules: "rules", pricing: "pricing", clauseDefaults: "clauseDefaults", currencies: "finance", email: "email", extraction: "extraction" }[s];
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function listUsers(ctx: ServiceCtx) {
  assertCan(ctx, "settings.view");
  return ctx.db.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt }).from(users).where(eq(users.orgId, ctx.actor.orgId)).orderBy(asc(users.name));
}

export const newUserInput = z.object({
  name: z.string().trim().min(1, "Enter their name").max(120),
  email: z.email("Enter a valid email"),
  role: z.enum(ROLE_KEYS),
});

/** Creates an account with a one-time temporary password shown to the admin once. */
export async function createUser(ctx: ServiceCtx, raw: unknown) {
  assertCan(ctx, "settings.edit");
  const input = parseInput(newUserInput, raw);
  const email = input.email.toLowerCase();
  const [exists] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) throw conflict("Someone with that email already has an account.");
  const tempPassword = randomBytes(9).toString("base64url");
  const hash = await hashPassword(tempPassword);
  await ctx.db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ name: input.name, email, role: input.role, orgId: ctx.actor.orgId, emailVerified: false, status: "ACTIVE" }).returning();
    await tx.insert(accounts).values({ accountId: u.id, providerId: "credential", userId: u.id, password: hash });
    await audit(tx, ctx, { entityType: "user", entityId: u.id, action: "user_created", summary: `Added ${input.name} (${email}) as ${ctx.actor.config.roles.labels[input.role]}` });
  });
  return { tempPassword };
}

export async function setUserRole(ctx: ServiceCtx, userId: string, role: RoleKey) {
  assertCan(ctx, "settings.edit");
  const [u] = await ctx.db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.actor.orgId)));
  if (!u) throw notFound("User");
  if (u.id === ctx.actor.userId && role !== "ADMIN") throw invalidState("You can't remove your own admin role. Ask another admin.");
  await ctx.db.transaction(async (tx) => {
    await tx.update(users).set({ role }).where(eq(users.id, userId));
    await audit(tx, ctx, { entityType: "user", entityId: userId, action: "role_changed", summary: `Changed ${u.name}'s role to ${ctx.actor.config.roles.labels[role]}` });
  });
}

export async function setUserActive(ctx: ServiceCtx, userId: string, active: boolean) {
  assertCan(ctx, "settings.edit");
  const [u] = await ctx.db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.actor.orgId)));
  if (!u) throw notFound("User");
  if (u.id === ctx.actor.userId) throw invalidState("You can't deactivate your own account.");
  await ctx.db.transaction(async (tx) => {
    await tx.update(users).set({ status: active ? "ACTIVE" : "DEACTIVATED" }).where(eq(users.id, userId));
    if (!active) await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, ctx, { entityType: "user", entityId: userId, action: active ? "user_reactivated" : "user_deactivated", summary: `${active ? "Reactivated" : "Deactivated"} ${u.name}` });
  });
}

// ---------------------------------------------------------------------------
// Integrations and extraction status
// ---------------------------------------------------------------------------

export async function integrationStatus(ctx: ServiceCtx) {
  const e = env();
  const sender = emailSender();
  const x = extractor(ctx.actor.config.extraction.enabled);
  const [stats] = await ctx.db
    .select({
      runs: sql<number>`count(*)`.mapWith(Number),
      succeeded: sql<number>`count(*) filter (where ${extractionRuns.status} = 'SUCCEEDED')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${extractionRuns.status} = 'FAILED')`.mapWith(Number),
      proposed: sql<number>`coalesce(sum(${extractionRuns.proposedCount}),0)`.mapWith(Number),
      confirmed: sql<number>`coalesce(sum(${extractionRuns.confirmedCount}),0)`.mapWith(Number),
      edited: sql<number>`coalesce(sum(${extractionRuns.editedCount}),0)`.mapWith(Number),
      rejected: sql<number>`coalesce(sum(${extractionRuns.rejectedCount}),0)`.mapWith(Number),
    })
    .from(extractionRuns)
    .where(eq(extractionRuns.orgId, ctx.actor.orgId));
  return {
    email: { driver: sender.driver, detail: sender.driver === "smtp" ? e.SMTP_URL ?? "" : sender.driver === "resend" ? "Resend API" : "Not configured: emails aren't sent. Approval links can still be copied." },
    extraction: { available: x.available, reason: x.unavailableReason, model: e.EXTRACTION_MODEL, hasKey: Boolean(e.ANTHROPIC_API_KEY), stats },
    storage: { driver: storage().driver },
    cron: { configured: Boolean(e.CRON_SECRET) },
  };
}

export async function sendTestEmail(ctx: ServiceCtx) {
  assertCan(ctx, "settings.edit");
  const [me] = await ctx.db.select({ email: users.email }).from(users).where(eq(users.id, ctx.actor.userId));
  const cfg = ctx.actor.config;
  const { text, html } = renderEmail({ productName: cfg.brand.productName, brandColor: cfg.brand.primaryColor, heading: "Test email", lines: ["Email delivery is working for this workspace."] });
  const res = await emailSender().send({ to: me.email, subject: `${cfg.brand.productName}: test email`, text, html, fromName: cfg.email.senderName, replyTo: cfg.email.replyTo });
  if (!res.sent) throw validation(`The test email wasn't sent: ${res.reason}`);
  return { to: me.email };
}

/** The organisation's configuration as a deployable client config file. */
export async function exportConfig(ctx: ServiceCtx) {
  const { org, config } = await getSettings(ctx);
  return { name: org.name, slug: org.slug, baseCurrency: org.baseCurrency, timezone: org.timezone, config };
}
