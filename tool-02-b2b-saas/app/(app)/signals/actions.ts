"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { acceptSignal, bulkDismiss, dismissSignal, reassignSignal, snoozeSignal } from "@/services/signals";

const refresh = (id?: string) => {
  revalidatePath("/signals");
  revalidatePath("/");
  if (id) revalidatePath(`/signals/${id}`);
};

export async function acceptAction(id: string, lockVersion: number, input: unknown) {
  const res = await toResult(async () => acceptSignal(await appCtx(), id, lockVersion, input));
  if (res.ok) {
    refresh(id);
    revalidatePath("/csqls");
  }
  return res;
}

export async function dismissAction(id: string, lockVersion: number, input: unknown) {
  const res = await toResult(async () => dismissSignal(await appCtx(), id, lockVersion, input));
  if (res.ok) refresh(id);
  return res;
}

export async function snoozeAction(id: string, lockVersion: number, input: unknown) {
  const res = await toResult(async () => snoozeSignal(await appCtx(), id, lockVersion, input));
  if (res.ok) refresh(id);
  return res;
}

export async function reassignAction(id: string, lockVersion: number, input: unknown) {
  const res = await toResult(async () => reassignSignal(await appCtx(), id, lockVersion, input));
  if (res.ok) refresh(id);
  return res;
}

export async function bulkDismissAction(items: Array<{ id: string; lockVersion: number }>, input: unknown) {
  const res = await toResult(async () => bulkDismiss(await appCtx(), items, input));
  if (res.ok) refresh();
  return res;
}
