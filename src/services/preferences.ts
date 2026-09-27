import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema";
import { PLAIN, WALLPAPERS } from "@/config/imagery";
import type { ServiceCtx } from "./context";
import { parseInput } from "./errors";

// Per-user preferences: appearance and the Monday money brief. Stored in users.preferences (jsonb). Anything unknown in the
// stored value is ignored on read, so a removed wallpaper falls back to the org default.

const wallpaper = z.enum([PLAIN, ...WALLPAPERS.map((w) => w.key)] as [string, ...string[]], {
  error: "Choose one of the listed wallpapers",
});
const prefsSchema = z.object({ wallpaper: wallpaper.optional(), weeklyBrief: z.boolean().optional() });

/** weeklyBrief defaults to on: the brief is the product's value for people who rarely log in. */
export type Preferences = { wallpaper: string | null; weeklyBrief: boolean };

const read = (raw: unknown): Preferences => {
  const parsed = prefsSchema.safeParse(raw ?? {});
  if (parsed.success) return { wallpaper: parsed.data.wallpaper ?? null, weeklyBrief: parsed.data.weeklyBrief ?? true };
  // One bad field (e.g. a wallpaper that was removed) must not reset the others.
  const r = (raw ?? {}) as Record<string, unknown>;
  return { wallpaper: null, weeklyBrief: typeof r.weeklyBrief === "boolean" ? r.weeklyBrief : true };
};

export async function getPreferences(ctx: ServiceCtx): Promise<Preferences> {
  const [row] = await ctx.db.select({ preferences: users.preferences }).from(users).where(eq(users.id, ctx.actor.userId));
  return read(row?.preferences);
}

export async function updatePreferences(ctx: ServiceCtx, raw: unknown): Promise<Preferences> {
  const input = parseInput(prefsSchema, raw);
  const current = await getPreferences(ctx);
  const next = { ...current, ...input };
  await ctx.db.update(users).set({ preferences: next }).where(eq(users.id, ctx.actor.userId));
  return next;
}

/** The wallpaper to render: the user's choice, else the organisation default. Null means plain. */
export function resolveWallpaper(prefs: Preferences, orgDefault: string) {
  const key = prefs.wallpaper ?? orgDefault;
  return key === PLAIN ? null : (WALLPAPERS.find((w) => w.key === key) ?? null);
}
