"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { deleteActualPenalty, recordActualPenalty } from "@/services/post-event";

export async function recordPenaltyAction(eventId: string, contractId: string, values: Record<string, unknown>) {
  return toResult(async () => {
    await recordActualPenalty(await appCtx(), contractId, values);
    revalidatePath(`/events/${eventId}/post-event`);
    revalidatePath("/reports");
    return undefined;
  });
}

export async function deletePenaltyAction(eventId: string, id: string) {
  return toResult(async () => {
    await deleteActualPenalty(await appCtx(), id);
    revalidatePath(`/events/${eventId}/post-event`);
    revalidatePath("/reports");
    return undefined;
  });
}
