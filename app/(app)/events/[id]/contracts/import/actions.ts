"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult, validation } from "@/services/errors";
import { createImportBatch, importContractFile } from "@/services/contract-import";
import { drainExtractionQueue, startExtraction } from "@/services/documents";
import { getDb } from "@/db/client";

// Bulk import: the browser sends one file per call, so every request stays under the server
// action body limit however many contracts are dropped in. Reading happens in the queue.

export async function createImportBatchAction(eventId: string) {
  return toResult(async () => ({ batchId: (await createImportBatch(await appCtx(), eventId)).id }));
}

export async function importContractFileAction(batchId: string, form: FormData) {
  return toResult(async () => {
    const file = form.get("file");
    if (!(file instanceof File)) throw validation("Choose a PDF to import.");
    let meta: unknown;
    try {
      meta = JSON.parse(String(form.get("meta") ?? "{}"));
    } catch {
      throw validation("The import details couldn't be read. Reload and try again.");
    }
    const ctx = await appCtx();
    const result = await importContractFile(ctx, batchId, meta, { filename: file.name, data: Buffer.from(await file.arrayBuffer()) });
    if (result.runStatus === "QUEUED") after(() => drainExtractionQueue(getDb(), { orgId: ctx.actor.orgId }));
    return result;
  });
}

export async function retryReadingAction(eventId: string, batchId: string, contractId: string) {
  const res = await toResult(async () => {
    const ctx = await appCtx();
    const run = await startExtraction(ctx, contractId);
    if (run.status === "QUEUED") after(() => drainExtractionQueue(getDb(), { orgId: ctx.actor.orgId }));
    return { status: run.status };
  });
  if (res.ok) revalidatePath(`/events/${eventId}/contracts/import/${batchId}`);
  return res;
}
