"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { listMessages, listMyThreads, markThreadRead, postMessage } from "@/services/threads";
import { updatePreferences } from "@/services/preferences";
import { users } from "@/db/schema";

// Server actions behind the team threads sheet and the Appearance sheet. Dates cross the wire
// as ISO strings.

export async function loadThreadsAction() {
  return toResult(async () => {
    const ctx = await appCtx();
    const [threads, people] = await Promise.all([
      listMyThreads(ctx),
      ctx.db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.orgId, ctx.actor.orgId), eq(users.status, "ACTIVE"))),
    ]);
    return {
      me: ctx.actor.userId,
      people: people.filter((p) => p.id !== ctx.actor.userId).map((p) => p.name),
      threads: threads.map((t) => ({ ...t, lastMessageAt: t.lastMessageAt?.toISOString() ?? null })),
    };
  });
}

export async function loadMessagesAction(eventId: string) {
  return toResult(async () => {
    const ctx = await appCtx();
    const rows = await listMessages(ctx, eventId);
    await markThreadRead(ctx, eventId);
    return rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }));
  });
}

export async function postMessageAction(eventId: string, body: string) {
  const res = await toResult(async () => {
    const m = await postMessage(await appCtx(), eventId, { body });
    return { id: m.id, mentioned: m.mentioned };
  });
  if (res.ok) revalidatePath(`/events/${eventId}/discussion`);
  return res;
}


export async function saveWallpaperAction(wallpaper: string) {
  const res = await toResult(async () => {
    const prefs = await updatePreferences(await appCtx(), { wallpaper });
    return prefs;
  });
  if (res.ok) revalidatePath("/", "layout");
  return res;
}

export async function saveWeeklyBriefAction(weeklyBrief: boolean) {
  const res = await toResult(async () => (await updatePreferences(await appCtx(), { weeklyBrief })).weeklyBrief);
  if (res.ok) revalidatePath("/account");
  return res;
}
