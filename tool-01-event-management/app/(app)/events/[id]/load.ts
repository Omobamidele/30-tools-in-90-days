import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { appCtx } from "@/services/app-ctx";
import { getEvent } from "@/services/events";
import { isNotFound } from "@/services/errors";

/** Event + service context, shared by the workspace layout and its tabs within one request. */
export const loadEvent = cache(async (eventId: string) => {
  const ctx = await appCtx();
  try {
    const data = await getEvent(ctx, eventId);
    return { ctx, ...data };
  } catch (e) {
    if (isNotFound(e)) notFound();
    throw e;
  }
});
