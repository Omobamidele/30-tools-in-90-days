"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import {
  approveInternally,
  completeTask,
  createChange,
  previewChangeImpact,
  reissueLink,
  sendBack,
  submitChange,
  updateChange,
  withdrawChange,
} from "@/services/changes";

function refresh(id?: string) {
  if (id) revalidatePath(`/changes/${id}`);
  revalidatePath("/changes");
  revalidatePath("/events", "layout");
}

export async function previewImpactAction(eventId: string, draft: unknown) {
  return toResult(async () => previewChangeImpact(await appCtx(), eventId, draft));
}

export async function saveChangeAction(eventId: string, id: string | null, draft: unknown, lockVersion: number) {
  return toResult(async () => {
    const ctx = await appCtx();
    if (id) {
      await updateChange(ctx, id, draft, lockVersion);
      refresh(id);
      return { id };
    }
    const row = await createChange(ctx, eventId, draft);
    refresh(row.id);
    return { id: row.id };
  });
}

export async function submitChangeAction(id: string, recipientEmail: string) {
  return toResult(async () => {
    const res = await submitChange(await appCtx(), id, { recipientEmail });
    refresh(id);
    return { status: res.status, link: res.link ? { url: res.link.url, emailed: res.link.emailed } : null };
  });
}

export async function approveInternallyAction(id: string, note: string) {
  return toResult(async () => {
    const res = await approveInternally(await appCtx(), id, note);
    refresh(id);
    return { link: res.link ? { url: res.link.url, emailed: res.link.emailed } : null };
  });
}

export async function sendBackAction(id: string, note: string) {
  return toResult(async () => {
    await sendBack(await appCtx(), id, note);
    refresh(id);
    return undefined;
  });
}

export async function withdrawChangeAction(id: string) {
  return toResult(async () => {
    await withdrawChange(await appCtx(), id);
    refresh(id);
    return undefined;
  });
}

export async function reissueLinkAction(id: string, recipientEmail: string) {
  return toResult(async () => {
    const res = await reissueLink(await appCtx(), id, { recipientEmail });
    refresh(id);
    return { link: res.link ? { url: res.link.url, emailed: res.link.emailed } : null };
  });
}

export async function completeTaskAction(taskId: string, done: boolean) {
  return toResult(async () => {
    await completeTask(await appCtx(), taskId, done);
    revalidatePath("/events", "layout");
    revalidatePath("/changes", "layout");
    return undefined;
  });
}
