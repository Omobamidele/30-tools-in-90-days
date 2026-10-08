"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { decideAlert } from "@/services/alerts";
import { markNotificationsRead } from "@/services/notifications";

export async function decideAlertAction(alertId: string, values: Record<string, unknown>) {
  return toResult(async () => {
    await decideAlert(await appCtx(), alertId, values);
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function markReadAction(ids?: string[]) {
  return toResult(async () => {
    await markNotificationsRead(await appCtx(), ids);
    revalidatePath("/", "layout");
    return undefined;
  });
}
