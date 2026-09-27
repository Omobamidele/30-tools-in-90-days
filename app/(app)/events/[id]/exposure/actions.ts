"use server";

import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult, validation } from "@/services/errors";
import { authorizeEvent } from "@/services/events";
import { rotateInbound, setUpInbound, turnOffInbound } from "@/services/inbound-pickup";
import { isReportFile, readReportRows, UnsupportedReport } from "@/adapters/spreadsheet";
import { recordPickup } from "@/services/pickup";
import { updateClauseInputs } from "@/services/contracts";
import { reevaluateAfterResponse } from "@/services/reevaluate";

export async function recordPickupAction(eventId: string, clauseId: string, values: unknown, source: "MANUAL" | "CSV" = "MANUAL") {
  return toResult(async () => {
    const ctx = await appCtx();
    await recordPickup(ctx, clauseId, values, source);
    reevaluateAfterResponse(ctx.actor.orgId, { eventId });
    revalidatePath(`/events/${eventId}`, "layout");
    revalidatePath("/");
    return undefined;
  });
}

export async function updateInputsAction(eventId: string, clauseId: string, inputs: unknown) {
  return toResult(async () => {
    const ctx = await appCtx();
    await updateClauseInputs(ctx, clauseId, inputs);
    reevaluateAfterResponse(ctx.actor.orgId, { eventId });
    revalidatePath(`/events/${eventId}`, "layout");
    revalidatePath("/");
    return undefined;
  });
}

// Emailed hotel reports (milestone 14) ---------------------------------------------------------

/** Reads a sample report on the server (CSV or Excel) so its columns can be mapped once. */
export async function previewReportAction(eventId: string, clauseId: string, form: FormData) {
  return toResult(async () => {
    const ctx = await appCtx();
    await authorizeEvent(ctx, eventId, "pickup.edit");
    const file = form.get("file");
    if (!(file instanceof File)) throw validation("Choose the hotel's report.");
    if (file.size > 5 * 1024 * 1024) throw validation("The report is larger than 5 MB.");
    if (!isReportFile(file.name, file.type)) throw validation("Choose a CSV or Excel (.xlsx) report.");
    try {
      const report = await readReportRows({ filename: file.name, contentType: file.type, data: Buffer.from(await file.arrayBuffer()) });
      if (report.headers.length < 2) throw validation("Couldn't find columns in this report. It needs a header row.");
      return { fileName: file.name, headers: report.headers, rows: report.rows.slice(0, 200) };
    } catch (e) {
      if (e instanceof UnsupportedReport) throw validation(e.message);
      throw e;
    }
  });
}

export async function setUpInboundAction(eventId: string, clauseId: string, values: unknown) {
  return toResult(async () => {
    const res = await setUpInbound(await appCtx(), clauseId, values);
    revalidatePath(`/events/${eventId}/exposure`);
    return res;
  });
}

export async function rotateInboundAction(eventId: string, clauseId: string) {
  return toResult(async () => {
    const res = await rotateInbound(await appCtx(), clauseId);
    revalidatePath(`/events/${eventId}/exposure`);
    return res;
  });
}

export async function turnOffInboundAction(eventId: string, clauseId: string) {
  return toResult(async () => {
    await turnOffInbound(await appCtx(), clauseId);
    revalidatePath(`/events/${eventId}/exposure`);
    return undefined;
  });
}
