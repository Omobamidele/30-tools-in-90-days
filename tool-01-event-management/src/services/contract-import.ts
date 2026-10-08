import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { contracts, events, extractionRuns, files, importBatches, suppliers } from "@/db/schema";
import { isPdf, readPdfText } from "@/adapters/pdf";
import { audit, type ServiceCtx } from "./context";
import { notFound, parseInput, validation } from "./errors";
import { authorizeEvent } from "./events";
import { createContract } from "./contracts";
import { createSupplier, normalizeSupplierKey, SUPPLIER_TYPES } from "./suppliers";
import { MAX_UPLOAD_BYTES, startExtraction, uploadContractDocument } from "./documents";

// Bulk contract import (milestone 14): a folder of signed PDFs becomes one draft contract each,
// with its terms queued for reading. Every file is checked before its contract is created, so a
// bad file never leaves an empty contract behind.

export async function createImportBatch(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "contract.edit");
  const [batch] = await ctx.db.insert(importBatches).values({ orgId: ctx.actor.orgId, eventId, createdBy: ctx.actor.userId }).returning();
  return batch;
}

const importFileInput = z
  .object({
    title: z.string().trim().min(1, "Enter a title for this contract").max(200),
    currency: z.string().regex(/^[A-Z]{3}$/, "Choose a currency"),
    supplierId: z.string().optional().default(""),
    newSupplier: z
      .object({
        name: z.string().trim().min(1, "Enter the supplier's name"),
        type: z.enum(SUPPLIER_TYPES),
        city: z.string().trim().max(120).optional().default(""),
      })
      .nullable()
      .optional()
      .default(null),
  })
  .refine((v) => v.supplierId || v.newSupplier, { message: "Choose a supplier, or add a new one", path: ["supplierId"] });

async function loadBatch(ctx: ServiceCtx, batchId: string) {
  const [batch] = await ctx.db
    .select({ batch: importBatches, event: events })
    .from(importBatches)
    .innerJoin(events, eq(events.id, importBatches.eventId))
    .where(and(eq(importBatches.id, batchId), eq(importBatches.orgId, ctx.actor.orgId)));
  if (!batch) throw notFound("Import");
  return batch;
}

/** One file of a batch: check it, find or add the supplier, create the draft, attach, queue reading. */
export async function importContractFile(ctx: ServiceCtx, batchId: string, raw: unknown, file: { filename: string; data: Buffer }) {
  const { event } = await loadBatch(ctx, batchId);
  await authorizeEvent(ctx, event.id, "contract.edit");
  const input = parseInput(importFileInput, raw);

  // Check the file first: nothing is created for a file that can't be used.
  if (file.data.length === 0) throw validation("The file is empty.");
  if (file.data.length > MAX_UPLOAD_BYTES) throw validation("The file is larger than 25 MB.");
  if (!isPdf(file.data)) throw validation("Only PDF files can be imported as contracts.");
  try {
    await readPdfText(file.data);
  } catch {
    throw validation("This PDF couldn't be opened. It may be damaged or password-protected.");
  }

  let supplierId = input.supplierId;
  if (!supplierId && input.newSupplier) {
    // A supplier typed twice in one batch (or already on file) is reused, not duplicated.
    const [existing] = await ctx.db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.orgId, ctx.actor.orgId), eq(suppliers.normalizedKey, normalizeSupplierKey(input.newSupplier.name, input.newSupplier.city))));
    supplierId = existing?.id ?? (await createSupplier(ctx, { ...input.newSupplier, country: "" })).id;
  }

  const contract = await createContract(ctx, event.id, { supplierId, title: input.title, currency: input.currency });
  await ctx.db.update(contracts).set({ importBatchId: batchId }).where(eq(contracts.id, contract.id));
  await uploadContractDocument(ctx, contract.id, file);
  const run = await startExtraction(ctx, contract.id);
  await audit(ctx.db, ctx, {
    entityType: "contract",
    entityId: contract.id,
    eventId: event.id,
    action: "imported",
    summary: `Imported ${file.filename} in a bulk upload`,
  });
  return { contractId: contract.id, runStatus: run.status, reason: run.reason };
}

export type BatchRow = {
  contractId: string;
  title: string;
  supplierName: string;
  contractStatus: string;
  filename: string | null;
  /** The PDF has no text layer (a scan), so terms are always entered by hand. */
  scan: boolean;
  run: {
    status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NOT_APPLICABLE";
    reason: string | null;
    attempts: number;
    proposed: number;
    confirmed: number;
    edited: number;
    rejected: number;
  } | null;
};

/** Everything the batch progress page shows, with the latest reading run per contract. */
export async function getImportBatch(ctx: ServiceCtx, batchId: string) {
  const { batch, event } = await loadBatch(ctx, batchId);
  await authorizeEvent(ctx, event.id, "event.view");
  const rows = await ctx.db
    .select({ id: contracts.id, title: contracts.title, status: contracts.status, supplierName: suppliers.name })
    .from(contracts)
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(eq(contracts.importBatchId, batchId))
    .orderBy(asc(contracts.createdAt));
  const runs = rows.length
    ? await ctx.db
        .select()
        .from(extractionRuns)
        .where(inArray(extractionRuns.contractId, rows.map((r) => r.id)))
        .orderBy(desc(extractionRuns.createdAt))
    : [];
  const fileRows = rows.length
    ? await ctx.db.select({ ownerId: files.ownerId, filename: files.filename, hasTextLayer: files.hasTextLayer }).from(files).where(inArray(files.ownerId, rows.map((r) => r.id)))
    : [];
  const out: BatchRow[] = rows.map((r) => {
    const run = runs.find((x) => x.contractId === r.id);
    return {
      contractId: r.id,
      title: r.title,
      supplierName: r.supplierName,
      contractStatus: r.status,
      filename: fileRows.find((f) => f.ownerId === r.id)?.filename ?? null,
      scan: fileRows.find((f) => f.ownerId === r.id)?.hasTextLayer === false,
      run: run
        ? {
            status: run.status,
            reason: run.reason,
            attempts: run.attempts,
            proposed: run.proposedCount,
            confirmed: run.confirmedCount,
            edited: run.editedCount,
            rejected: run.rejectedCount,
          }
        : null,
    };
  });
  const sum = (k: "proposed" | "confirmed" | "edited" | "rejected") => out.reduce((s, r) => s + (r.run?.[k] ?? 0), 0);
  return {
    batch,
    event,
    rows: out,
    summary: {
      files: out.length,
      reading: out.filter((r) => r.run?.status === "QUEUED" || r.run?.status === "RUNNING").length,
      toReview: out.filter((r) => r.contractStatus === "IN_REVIEW").length,
      manual: out.filter((r) => r.run?.status === "NOT_APPLICABLE").length,
      scans: out.filter((r) => r.run?.status === "NOT_APPLICABLE" && r.scan).length,
      readingOff: out.filter((r) => r.run?.status === "NOT_APPLICABLE" && !r.scan).length,
      failed: out.filter((r) => r.run?.status === "FAILED").length,
      proposed: sum("proposed"),
      confirmed: sum("confirmed"),
      edited: sum("edited"),
      rejected: sum("rejected"),
    },
  };
}
