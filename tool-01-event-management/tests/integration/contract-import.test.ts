import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { sampleExtraction } from "../fixtures/extraction";
import { createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { createImportBatch, getImportBatch, importContractFile } from "@/services/contract-import";
import { drainExtractionQueue, failStuckExtractions } from "@/services/documents";
import { setExtractorForTests, type ContractExtractor, type ExtractionOutcome } from "@/adapters/extraction";
import { setStorageForTests, type Storage } from "@/adapters/storage";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

// Bulk contract import and the extraction queue (milestone 14).
const pdf = readFileSync("fixtures/sample-hotel-contract.pdf");
const scanned = readFileSync("tests/fixtures/scanned-contract.pdf");

class MemoryStorage implements Storage {
  readonly driver = "memory";
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.files.set(k, d);
  }
  async get(k: string) {
    const f = this.files.get(k);
    if (!f) throw new Error("missing");
    return f;
  }
  async delete(k: string) {
    this.files.delete(k);
  }
}

/** A fake model that records how many calls overlap, and can fail the first N calls. */
function fakeModel(opts: { failFirst?: number; retryable?: boolean; delayMs?: number } = {}) {
  let live = 0;
  const state = { calls: 0, maxConcurrent: 0 };
  const extractor: ContractExtractor = {
    available: true,
    unavailableReason: null,
    extract: async (): Promise<ExtractionOutcome> => {
      state.calls++;
      live++;
      state.maxConcurrent = Math.max(state.maxConcurrent, live);
      await new Promise((r) => setTimeout(r, opts.delayMs ?? 30));
      live--;
      if (state.calls <= (opts.failFirst ?? 0)) {
        return { ok: false, reason: "The extraction service is busy.", model: "fake", retryable: opts.retryable ?? true };
      }
      return { ok: true, result: sampleExtraction, model: "fake", inputTokens: 1000, outputTokens: 500 };
    },
  };
  return { extractor, state };
}

let w: World;
let eventId: string;
let hotelId: string;

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Halden Import Co" });
  hotelId = (await createSupplier(ops, { name: "Hotel Miradouro Porto", type: "HOTEL", city: "Porto" })).id;
  eventId = (
    await createEvent(ops, {
      clientId: client.id,
      name: "Imported summit",
      type: "Customer event",
      startDate: "2027-10-15",
      endDate: "2027-10-16",
      timezone: "Europe/Lisbon",
      ownerId: w.people.OPS_DIRECTOR.id,
      forecastAttendance: 260,
      baseCurrency: "EUR",
    })
  ).id;
});
afterAll(async () => {
  setExtractorForTests(undefined);
  await closeTestDb();
});

const drain = (opts: Parameters<typeof drainExtractionQueue>[1] = {}) => drainExtractionQueue(w.db, { orgId: w.org.id, backoffMs: 0, ...opts });
const runsFor = async (contractIds: string[]) =>
  (await w.db.select().from(schema.extractionRuns)).filter((r) => contractIds.includes(r.contractId));

describe("bulk contract import", () => {
  it("turns five PDFs into five draft contracts, reads four at most two at a time, and routes the scan to manual entry", async () => {
    // Long enough that the two workers' calls overlap even when claims are slow.
    const model = fakeModel({ delayMs: 400 });
    setExtractorForTests(model.extractor);
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) {
      // The same PDF bytes on different contracts is allowed (duplicates are per contract).
      const r = await importContractFile(ops, batch.id, { title: `Agreement ${i}`, currency: "EUR", supplierId: hotelId }, { filename: `contract-${i}.pdf`, data: pdf });
      expect(r.runStatus).toBe("QUEUED");
      ids.push(r.contractId);
    }
    const scan = await importContractFile(
      ops,
      batch.id,
      { title: "Coaches", currency: "EUR", newSupplier: { name: "Rota Norte Coaches", type: "TRANSPORT", city: "Porto" } },
      { filename: "coaches-scanned.pdf", data: scanned },
    );
    expect(scan.runStatus).toBe("NOT_APPLICABLE");

    const { processed } = await drain({ concurrency: 2 });
    expect(processed).toBe(4);
    expect(model.state.maxConcurrent).toBeLessThanOrEqual(2);
    expect(model.state.maxConcurrent).toBe(2);

    const view = await getImportBatch(ops, batch.id);
    expect(view.summary).toMatchObject({ files: 5, reading: 0, toReview: 4, manual: 1, failed: 0 });
    expect(view.summary.proposed).toBeGreaterThan(0);
    expect(view.rows.find((r) => r.contractId === scan.contractId)?.supplierName).toBe("Rota Norte Coaches");
  });

  it("reuses a supplier typed twice instead of creating a duplicate", async () => {
    setExtractorForTests(fakeModel().extractor);
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    const supplier = { newSupplier: { name: "Rota Norte Coaches", type: "TRANSPORT", city: "porto" } };
    await importContractFile(ops, batch.id, { title: "Return transfers", currency: "EUR", ...supplier }, { filename: "a.pdf", data: pdf });
    const all = await w.db.select().from(schema.suppliers).where(eq(schema.suppliers.orgId, w.org.id));
    expect(all.filter((s) => s.name === "Rota Norte Coaches")).toHaveLength(1);
    await drain();
  });

  it("creates nothing for a file that isn't a usable PDF", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    const before = (await w.db.select().from(schema.contracts).where(eq(schema.contracts.eventId, eventId))).length;
    await expect(
      importContractFile(ops, batch.id, { title: "Not a PDF", currency: "EUR", supplierId: hotelId }, { filename: "notes.pdf", data: Buffer.from("hello, not a pdf") }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      importContractFile(ops, batch.id, { title: "No supplier", currency: "EUR" }, { filename: "x.pdf", data: pdf }),
    ).rejects.toMatchObject({ fieldErrors: { supplierId: "Choose a supplier, or add a new one" } });
    expect((await w.db.select().from(schema.contracts).where(eq(schema.contracts.eventId, eventId))).length).toBe(before);
  });
});

describe("extraction queue", () => {
  it("retries a busy model and succeeds on a later attempt", async () => {
    const model = fakeModel({ failFirst: 2 });
    setExtractorForTests(model.extractor);
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    const { contractId } = await importContractFile(ops, batch.id, { title: "Busy day", currency: "EUR", supplierId: hotelId }, { filename: "busy.pdf", data: pdf });
    await drain({ concurrency: 1 });
    const [run] = await runsFor([contractId]);
    expect(run.status).toBe("SUCCEEDED");
    expect(run.attempts).toBe(3);
  });

  it("gives up after three attempts, and fails at once when the error isn't temporary", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    setExtractorForTests(fakeModel({ failFirst: 99 }).extractor);
    const a = await importContractFile(ops, batch.id, { title: "Always busy", currency: "EUR", supplierId: hotelId }, { filename: "a.pdf", data: pdf });
    await drain({ concurrency: 1 });
    setExtractorForTests(fakeModel({ failFirst: 99, retryable: false }).extractor);
    const b = await importContractFile(ops, batch.id, { title: "Rejected key", currency: "EUR", supplierId: hotelId }, { filename: "b.pdf", data: pdf });
    await drain({ concurrency: 1 });
    const runs = await runsFor([a.contractId, b.contractId]);
    expect(runs.find((r) => r.contractId === a.contractId)).toMatchObject({ status: "FAILED", attempts: 3 });
    expect(runs.find((r) => r.contractId === b.contractId)).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("fails runs lost mid-call, but leaves runs that are only waiting their turn", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const batch = await createImportBatch(ops, eventId);
    setExtractorForTests(fakeModel().extractor);
    const lost = await importContractFile(ops, batch.id, { title: "Lost", currency: "EUR", supplierId: hotelId }, { filename: "l.pdf", data: pdf });
    const waiting = await importContractFile(ops, batch.id, { title: "Waiting", currency: "EUR", supplierId: hotelId }, { filename: "w.pdf", data: pdf });
    const now = new Date();
    await w.db
      .update(schema.extractionRuns)
      .set({ status: "RUNNING", startedAt: new Date(now.getTime() - 20 * 60_000) })
      .where(eq(schema.extractionRuns.contractId, lost.contractId));
    await w.db
      .update(schema.extractionRuns)
      .set({ createdAt: new Date(now.getTime() - 2 * 3600_000) })
      .where(eq(schema.extractionRuns.contractId, waiting.contractId));
    await failStuckExtractions(w.db, now);
    const runs = await runsFor([lost.contractId, waiting.contractId]);
    expect(runs.find((r) => r.contractId === lost.contractId)?.status).toBe("FAILED");
    expect(runs.find((r) => r.contractId === waiting.contractId)?.status).toBe("QUEUED");
    await drain();
  });
});
