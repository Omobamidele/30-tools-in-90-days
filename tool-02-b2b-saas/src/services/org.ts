import type { OrgConfig } from "@/config/schema";
import type { Terms } from "@/core/rules/types";
import type { BusinessCalendar } from "@/core/business-time";
import type { ServiceCtx } from "./context";

/** Tenant wording for rule explanations (spec §13: terminology is configuration). */
export function termsOf(config: OrgConfig): Terms {
  return {
    seats: config.terminology.seats,
    seatSingular: config.terminology.seatSingular,
    usageMetric: config.terminology.usageMetric,
    usageUnit: config.terminology.usageUnit,
    addonName: (key) => config.priceBook.addons.find((a) => a.key === key)?.name ?? key,
  };
}

export function calendarOf(ctx: ServiceCtx): BusinessCalendar {
  return { timezone: ctx.actor.timezone, businessDays: ctx.actor.config.deadlines.businessDays, holidays: ctx.actor.config.deadlines.holidays };
}
