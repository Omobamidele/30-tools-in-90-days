"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult } from "@/services/errors";
import { createEvent, setEventStatus, updateEvent, type EventStatus } from "@/services/events";

export async function createEventAction(values: Record<string, unknown>) {
  return toResult(async () => {
    const row = await createEvent(await appCtx(), values);
    revalidatePath("/events");
    return { id: row.id };
  });
}

export async function updateEventAction(eventId: string, values: Record<string, unknown>, lockVersion: number) {
  return toResult(async () => {
    await updateEvent(await appCtx(), eventId, values, lockVersion);
    revalidatePath(`/events/${eventId}`, "layout");
    return undefined;
  });
}

export async function setEventStatusAction(eventId: string, status: EventStatus) {
  return toResult(async () => {
    await setEventStatus(await appCtx(), eventId, status);
    revalidatePath(`/events/${eventId}`, "layout");
    revalidatePath("/events");
    return undefined;
  });
}
