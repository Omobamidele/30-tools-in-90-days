"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { appCtx } from "@/services/app-ctx";
import { toResult, validation } from "@/services/errors";
import { drainExtractionQueue, startExtraction, uploadContractDocument } from "@/services/documents";
import { getDb } from "@/db/client";

export async function uploadDocumentAction(contractId: string, form: FormData) {
  return toResult(async () => {
    const file = form.get("file");
    if (!(file instanceof File)) throw validation("Choose a PDF to upload.");
    const ctx = await appCtx();
    await uploadContractDocument(ctx, contractId, { filename: file.name, data: Buffer.from(await file.arrayBuffer()) });
    revalidatePath(`/contracts/${contractId}`);
    return undefined;
  });
}

export async function readTermsAction(contractId: string) {
  return toResult(async () => {
    const ctx = await appCtx();
    const run = await startExtraction(ctx, contractId);
    if (run.status === "QUEUED") {
      // Runs after the response through the queue (at most two model calls at once); the page polls.
      after(() => drainExtractionQueue(getDb(), { orgId: ctx.actor.orgId }));
    }
    revalidatePath(`/contracts/${contractId}`);
    return { status: run.status, reason: run.reason };
  });
}
