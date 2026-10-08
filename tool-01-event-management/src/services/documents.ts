import { log } from "@/log";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { systemCtxForOrg } from "./system-ctx";
import { clauses, contracts, events, extractionRuns, files, suppliers } from "@/db/schema";
import { storage } from "@/adapters/storage";
import { isPdf, readPdfText } from "@/adapters/pdf";
import { extractor } from "@/adapters/extraction";
import { toProposals } from "@/core/extraction/proposal";
import { audit, type ServiceCtx } from "./context";
import { conflict, invalidState, notFound, validation } from "./errors";
import { authorizeEvent } from "./events";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

async function loadContract(ctx: ServiceCtx, contractId: string) {
  const [row] = await ctx.db
    .select({ contract: contracts, event: events, supplier: suppliers })
    .from(contracts)
    .innerJoin(events, eq(events.id, contracts.eventId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Contract");
  return row;
}

/** Stores a signed contract PDF against a contract and records whether it has a text layer. */
export async function uploadContractDocument(ctx: ServiceCtx, contractId: string, file: { filename: string; data: Buffer }) {
  const { contract, event } = await loadContract(ctx, contractId);
  await authorizeEvent(ctx, event.id, "contract.edit");
  if (file.data.length === 0) throw validation("The file is empty.");
  if (file.data.length > MAX_UPLOAD_BYTES) throw validation("The file is larger than 25 MB. Upload a smaller PDF.");
  if (!isPdf(file.data)) throw validation("Only PDF files can be uploaded as contracts.");

  const sha256 = createHash("sha256").update(file.data).digest("hex");
  const [dupe] = await ctx.db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.orgId, ctx.actor.orgId), eq(files.ownerType, "contract"), eq(files.ownerId, contractId), eq(files.sha256, sha256)));
  if (dupe) throw conflict("This exact file is already attached to the contract.");

  let text: Awaited<ReturnType<typeof readPdfText>>;
  try {
    text = await readPdfText(file.data);
  } catch {
    throw validation("This PDF couldn't be opened. It may be damaged or password-protected.");
  }

  const key = `${ctx.actor.orgId}/contracts/${contractId}/${randomUUID()}.pdf`;
  await storage().put(key, file.data, "application/pdf");
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(files)
      .values({
        orgId: ctx.actor.orgId,
        ownerType: "contract",
        ownerId: contractId,
        storageKey: key,
        filename: file.filename.slice(0, 200),
        mime: "application/pdf",
        size: file.data.length,
        sha256,
        hasTextLayer: text.hasTextLayer,
        pageCount: text.pageCount,
        uploadedBy: ctx.actor.userId,
      })
      .returning();
    await tx.update(contracts).set({ documentFileId: row.id }).where(eq(contracts.id, contractId));
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contractId,
      eventId: contract.eventId,
      action: "document_uploaded",
      summary: `Uploaded ${row.filename} (${text.pageCount} page${text.pageCount === 1 ? "" : "s"})`,
    });
    return row;
  });
}

/**
 * Queues term extraction for the contract's document. Returns the run; the caller runs it
 * after the response (Next `after`). Scans and disabled extraction are recorded honestly.
 */
export async function startExtraction(ctx: ServiceCtx, contractId: string) {
  const { contract, event } = await loadContract(ctx, contractId);
  await authorizeEvent(ctx, event.id, "contract.edit");
  if (!contract.documentFileId) throw invalidState("Upload the signed contract before reading terms from it.");
  if (!["DRAFT", "IN_REVIEW"].includes(contract.status)) {
    throw invalidState("Terms can only be read into a draft contract. Record an amendment to change an active contract.");
  }
  const [running] = await ctx.db
    .select({ id: extractionRuns.id })
    .from(extractionRuns)
    .where(and(eq(extractionRuns.contractId, contractId), sql`${extractionRuns.status} in ('QUEUED','RUNNING')`));
  if (running) throw conflict("Terms are already being read from this document.");

  const [file] = await ctx.db.select().from(files).where(eq(files.id, contract.documentFileId));
  const x = extractor(ctx.actor.config.extraction.enabled);
  const notApplicable = !file.hasTextLayer
    ? "This PDF has no text layer (it looks like a scan), so terms can't be read automatically. Enter them manually."
    : !x.available
      ? x.unavailableReason
      : null;

  const [run] = await ctx.db
    .insert(extractionRuns)
    .values({
      orgId: ctx.actor.orgId,
      contractId,
      fileId: file.id,
      status: notApplicable ? "NOT_APPLICABLE" : "QUEUED",
      reason: notApplicable,
      createdBy: ctx.actor.userId,
      finishedAt: notApplicable ? ctx.now() : null,
    })
    .returning();
  return run;
}

/** A busy or overloaded model is tried this many times in total before the run fails. */
export const MAX_EXTRACTION_ATTEMPTS = 3;

type Run = typeof extractionRuns.$inferSelect;

/**
 * Runs one specific queued extraction now (used by tests and "Read terms" on a single contract
 * when nothing else is queued). Bulk work goes through drainExtractionQueue.
 */
export async function runExtraction(ctx: ServiceCtx, runId: string, opts: { backoffMs?: number } = {}) {
  const [run] = await ctx.db
    .update(extractionRuns)
    .set({ status: "RUNNING", startedAt: ctx.now(), attempts: sql`${extractionRuns.attempts} + 1` })
    .where(and(eq(extractionRuns.id, runId), eq(extractionRuns.orgId, ctx.actor.orgId), eq(extractionRuns.status, "QUEUED")))
    .returning();
  if (run) await processRun(ctx, run, opts.backoffMs ?? DEFAULT_BACKOFF_MS);
}

const DEFAULT_BACKOFF_MS = 30_000;

/** Claims the oldest due queued run, skipping rows another worker holds (FOR UPDATE SKIP LOCKED). */
async function claimNextRun(db: Db, now: Date, minAgeMs: number, orgId?: string): Promise<Run | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: extractionRuns.id })
      .from(extractionRuns)
      .where(
        and(
          eq(extractionRuns.status, "QUEUED"),
          orgId ? eq(extractionRuns.orgId, orgId) : undefined,
          or(isNull(extractionRuns.nextAttemptAt), lte(extractionRuns.nextAttemptAt, now)),
          // No age check for the immediate drain: the database and app clocks can differ slightly.
          minAgeMs > 0 ? lte(extractionRuns.createdAt, new Date(now.getTime() - minAgeMs)) : undefined,
        ),
      )
      .orderBy(asc(extractionRuns.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [run] = await tx
      .update(extractionRuns)
      .set({ status: "RUNNING", startedAt: now, attempts: sql`${extractionRuns.attempts} + 1` })
      .where(eq(extractionRuns.id, next.id))
      .returning();
    return run;
  });
}

/**
 * Works through queued extractions with at most `concurrency` model calls at once, so a bulk
 * import of 20 contracts doesn't fire 20 calls together. Safe to call from several places at
 * once (after an upload, from the contract and batch pages, from the hourly job): each run is
 * claimed by exactly one worker. Runs as the organisation's system context.
 */
export async function drainExtractionQueue(
  db: Db,
  opts: {
    concurrency?: number;
    now?: () => Date;
    backoffMs?: number;
    /** Only runs queued at least this long ago; the hourly safety net uses 5 minutes. */
    minAgeMs?: number;
    /** Limit to one organisation's queue. */
    orgId?: string;
  } = {},
) {
  const concurrency = opts.concurrency ?? 2;
  const now = opts.now ?? (() => new Date());
  const [{ running }] = await db
    .select({ running: sql<number>`count(*)`.mapWith(Number) })
    .from(extractionRuns)
    .where(and(eq(extractionRuns.status, "RUNNING"), opts.orgId ? eq(extractionRuns.orgId, opts.orgId) : undefined));
  const workers = Math.max(0, concurrency - running);
  let processed = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const run = await claimNextRun(db, now(), opts.minAgeMs ?? 0, opts.orgId);
        if (!run) return;
        const ctx = await systemCtxForOrg(db, run.orgId, now());
        await processRun(ctx, run, opts.backoffMs ?? DEFAULT_BACKOFF_MS);
        processed++;
      }
    }),
  );
  return { processed };
}

/** The model call and its results for a claimed (RUNNING) run. */
async function processRun(ctx: ServiceCtx, run: Run, backoffMs: number) {
  const runId = run.id;
  const fail = async (reason: string, extra: Partial<typeof extractionRuns.$inferInsert> = {}) => {
    await ctx.db.update(extractionRuns).set({ status: "FAILED", reason, finishedAt: ctx.now(), ...extra }).where(eq(extractionRuns.id, runId));
  };

  try {
    const { contract, event, supplier } = await loadContract(ctx, run.contractId);
    const [file] = await ctx.db.select().from(files).where(eq(files.id, run.fileId));
    const text = await readPdfText(await storage().get(file.storageKey));
    const outcome = await extractor(ctx.actor.config.extraction.enabled).extract(
      text.pages,
      {
        supplierName: supplier.name,
        contractTitle: contract.title,
        eventName: event.name,
        eventStartDate: event.startDate,
        eventEndDate: event.endDate,
        timezone: event.timezone,
        currencyHint: contract.currency,
      },
      ctx.actor.config.extraction.effort,
    );
    if (!outcome.ok) {
      if (outcome.retryable && run.attempts < MAX_EXTRACTION_ATTEMPTS) {
        // Busy or overloaded: back to the queue, waiting a little longer after each attempt.
        await ctx.db
          .update(extractionRuns)
          .set({
            status: "QUEUED",
            reason: "The extraction service is busy. Trying again automatically.",
            nextAttemptAt: new Date(ctx.now().getTime() + backoffMs * run.attempts),
          })
          .where(eq(extractionRuns.id, runId));
        return;
      }
      await fail(outcome.reason, { model: outcome.model, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens });
      return;
    }
    const proposals = toProposals(outcome.result, text.pages);
    await ctx.db.transaction(async (tx) => {
      if (proposals.length) {
        await tx.insert(clauses).values(
          proposals.map((p) => ({
            orgId: ctx.actor.orgId,
            contractId: contract.id,
            type: p.type,
            label: p.label,
            status: "PROPOSED" as const,
            data: p.terms,
            sources: p.sources,
            extractionRunId: runId,
          })),
        );
      }
      await tx.update(contracts).set({ status: proposals.length ? "IN_REVIEW" : contract.status }).where(eq(contracts.id, contract.id));
      await tx
        .update(extractionRuns)
        .set({
          status: "SUCCEEDED",
          finishedAt: ctx.now(),
          model: outcome.model,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
          proposedCount: proposals.length,
        })
        .where(eq(extractionRuns.id, runId));
      await audit(tx, ctx, {
        entityType: "contract",
        entityId: contract.id,
        eventId: event.id,
        action: "terms_read",
        actorType: "SYSTEM",
        actorLabel: "Term extraction",
        summary: proposals.length
          ? `Read ${proposals.length} proposed term${proposals.length === 1 ? "" : "s"} from ${file.filename} for review`
          : `Found no financial terms in ${file.filename}`,
      });
    });
  } catch (err) {
    log.error({ err, runId }, "extraction failed");
    await fail("Something went wrong reading this document. Try again, or enter terms manually.");
  }
}

export async function latestExtraction(ctx: ServiceCtx, contractId: string) {
  const [run] = await ctx.db
    .select()
    .from(extractionRuns)
    .where(and(eq(extractionRuns.contractId, contractId), eq(extractionRuns.orgId, ctx.actor.orgId)))
    .orderBy(desc(extractionRuns.createdAt))
    .limit(1);
  return run ?? null;
}

/**
 * Hourly job. A run RUNNING for over 15 minutes was lost (the process stopped mid-call) and is
 * failed. A run still QUEUED after 24 hours never got a worker and is failed too. Queued runs
 * waiting their turn behind a bulk import are left alone: waiting isn't being stuck.
 */
export async function failStuckExtractions(db: ServiceCtx["db"], now: Date) {
  const lost = new Date(now.getTime() - 15 * 60 * 1000);
  const abandoned = new Date(now.getTime() - 24 * 3600 * 1000);
  return db
    .update(extractionRuns)
    .set({ status: "FAILED", reason: "Reading this document took too long and was stopped. Try again.", finishedAt: now })
    .where(
      or(
        and(eq(extractionRuns.status, "RUNNING"), lt(extractionRuns.startedAt, lost)),
        and(eq(extractionRuns.status, "QUEUED"), lt(extractionRuns.createdAt, abandoned)),
      ),
    )
    .returning({ id: extractionRuns.id });
}

export async function loadFileForDownload(ctx: ServiceCtx, fileId: string) {
  const [file] = await ctx.db.select().from(files).where(and(eq(files.id, fileId), eq(files.orgId, ctx.actor.orgId)));
  if (!file) throw notFound("File");
  if (file.ownerType === "contract" && file.ownerId) {
    const { event } = await loadContract(ctx, file.ownerId);
    await authorizeEvent(ctx, event.id, "event.view");
  }
  return { file, data: await storage().get(file.storageKey) };
}
