"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { markObligationDone, recordPayment, reopenObligation, waiveObligation } from "@/services/obligations";

function refresh() {
  revalidatePath("/deadlines");
  revalidatePath("/events", "layout");
  revalidatePath("/contracts", "layout");
}

export async function markDoneAction(id: string) {
  return toResult(async () => {
    await markObligationDone(await appCtx(), id);
    refresh();
    return undefined;
  });
}

export async function reopenAction(id: string) {
  return toResult(async () => {
    await reopenObligation(await appCtx(), id);
    refresh();
    return undefined;
  });
}

export async function waiveAction(id: string, reason: string) {
  return toResult(async () => {
    await waiveObligation(await appCtx(), id, reason);
    refresh();
    return undefined;
  });
}

export async function recordPaymentAction(id: string, values: Record<string, unknown>) {
  return toResult(async () => {
    await recordPayment(await appCtx(), id, values);
    refresh();
    return undefined;
  });
}

export async function issueCalendarTokenAction() {
  return toResult(async () => {
    const { issueCalendarToken } = await import("@/services/calendar");
    return { token: await issueCalendarToken(await appCtx()) };
  });
}
