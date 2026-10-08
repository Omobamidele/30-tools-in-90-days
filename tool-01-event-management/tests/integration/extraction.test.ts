import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { sampleExtraction } from "../fixtures/extraction";
import { createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, confirmClause, createContract, getContract, rejectClause, updateClauseTerms } from "@/services/contracts";
import { latestExtraction, runExtraction, startExtraction, uploadContractDocument } from "@/services/documents";
import { listObligations } from "@/services/obligations";
import { setExtractorForTests, type ContractExtractor } from "@/adapters/extraction";
import { setStorageForTests, type Storage } from "@/adapters/storage";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

const pdf = readFileSync("fixtures/sample-hotel-contract.pdf");

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

const fake = (outcome: Awaited<ReturnType<ContractExtractor["extract"]>>): ContractExtractor => ({
  available: true,
  unavailableReason: null,
  extract: async () => outcome,
});

let w: World;
let contractId: string;

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Halden Analytics" });
  const supplier = await createSupplier(ops, { name: "Hotel Miradouro Porto", type: "HOTEL", city: "Porto" });
  const event = await createEvent(ops, {
    clientId: client.id,
    name: "Customer Summit",
    type: "Customer event",
    startDate: "2027-10-15",
    endDate: "2027-10-16",
    timezone: "Europe/Lisbon",
    ownerId: w.people.OPS_DIRECTOR.id,
    forecastAttendance: 260,
    baseCurrency: "EUR",
  });
  const k = await createContract(ops, event.id, { supplierId: supplier.id, title: "Group sales agreement", currency: "EUR", contractedValue: "118,560.00" });
  contractId = k.id;
});
afterAll(async () => {
  setExtractorForTests(undefined);
  await closeTestDb();
});

describe("contract documents", () => {
  it("rejects non-PDF files", async () => {
    await expect(
      uploadContractDocument(w.ctx("OPS_DIRECTOR"), contractId, { filename: "x.pdf", data: Buffer.from("not a pdf") }),
    ).rejects.toSatisfy((e: unknown) => e instanceof DomainError && /Only PDF/.test(e.message));
  });

  it("stores a PDF, records pages and text layer, and blocks duplicate uploads", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const f = await uploadContractDocument(ops, contractId, { filename: "Miradouro group agreement.pdf", data: pdf });
    expect(f.pageCount).toBe(2);
    expect(f.hasTextLayer).toBe(true);
    await expect(uploadContractDocument(ops, contractId, { filename: "again.pdf", data: pdf })).rejects.toSatisfy(
      (e: unknown) => e instanceof DomainError && e.code === "CONFLICT",
    );
  });
});

describe("term extraction", () => {
  it("records honestly when extraction isn't available", async () => {
    setExtractorForTests({ available: false, unavailableReason: "Not set up", extract: async () => ({ ok: false, reason: "Not set up", model: null }) });
    const run = await startExtraction(w.ctx("OPS_DIRECTOR"), contractId);
    expect(run.status).toBe("NOT_APPLICABLE");
    expect(run.reason).toBe("Not set up");
  });

  it("records a failed model call with its reason and creates nothing", async () => {
    setExtractorForTests(fake({ ok: false, reason: "The model declined to read this document. Enter the terms manually.", model: "claude-opus-5" }));
    const ops = w.ctx("OPS_DIRECTOR");
    const run = await startExtraction(ops, contractId);
    await runExtraction(ops, run.id);
    const latest = await latestExtraction(ops, contractId);
    expect(latest?.status).toBe("FAILED");
    expect(latest?.reason).toMatch(/declined/);
    expect((await getContract(ops, contractId)).clauses).toHaveLength(0);
  });

  it("creates proposed terms with verified sources; nothing counts until confirmed", async () => {
    setExtractorForTests(fake({ ok: true, result: sampleExtraction, model: "claude-opus-5", inputTokens: 5000, outputTokens: 900 }));
    const ops = w.ctx("OPS_DIRECTOR");
    const run = await startExtraction(ops, contractId);
    expect(run.status).toBe("QUEUED");
    await runExtraction(ops, run.id);

    const { contract, clauses } = await getContract(ops, contractId);
    expect(contract.status).toBe("IN_REVIEW");
    expect(clauses.every((c) => c.status === "PROPOSED")).toBe(true);
    expect(clauses.map((c) => c.type).sort()).toEqual(
      ["CANCELLATION", "FB_MINIMUM", "FINAL_GUARANTEE", "OTHER_DEADLINE", "PAYMENT", "PAYMENT", "ROOM_BLOCK"].sort(),
    );

    const block = clauses.find((c) => c.type === "ROOM_BLOCK")!;
    const sources = block.sources as Record<string, { page: number; verified: boolean }>;
    expect(sources.commitmentPct).toMatchObject({ verified: true, page: 1 }); // across a line break
    expect(sources.cutoffDate).toMatchObject({ verified: true, page: 1 }); // corrected from page 2
    expect(sources.damagesPct.verified).toBe(false); // paraphrase
    expect((block.data as { nights: Array<{ rateMinor: number }> }).nights[0].rateMinor).toBe(17_600);

    // Tiers are sorted into order regardless of how they were returned.
    const cxl = clauses.find((c) => c.type === "CANCELLATION")!;
    expect((cxl.data as { tiers: Array<{ startsOn: string }> }).tiers.map((t) => t.startsOn)).toEqual(["2027-03-12", "2027-06-01", "2027-09-01"]);

    // Activation is blocked until every proposal is resolved; no deadlines exist yet.
    await expect(activateContract(ops, contractId)).rejects.toSatisfy((e: unknown) => e instanceof DomainError && e.code === "INVALID_STATE");
    expect(await listObligations(ops, {})).toHaveLength(0);
  });

  it("won't confirm an invalid proposal as-is, but accepts it once corrected", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const second = (await getContract(ops, contractId)).clauses.find((c) => c.label === "Second deposit")!;
    await expect(confirmClause(ops, second.id)).rejects.toBeInstanceOf(DomainError);
    await updateClauseTerms(ops, second.id, { terms: { ...(second.data as object), dueDate: "2027-08-15" } }, second.lockVersion);
  });

  it("confirms the rest, activates, and records extraction accuracy", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const { clauses } = await getContract(ops, contractId);
    const guarantee = clauses.find((c) => c.type === "FINAL_GUARANTEE")!;
    await rejectClause(ops, guarantee.id);
    for (const c of clauses.filter((x) => x.status === "PROPOSED" && x.id !== guarantee.id)) await confirmClause(ops, c.id);
    await activateContract(ops, contractId);

    const run = await latestExtraction(ops, contractId);
    expect(run).toMatchObject({ status: "SUCCEEDED", proposedCount: 7, confirmedCount: 5, editedCount: 1, rejectedCount: 1 });
    const deadlines = await listObligations(ops, {});
    expect(deadlines.some((o) => o.label === "Rooming list")).toBe(true);
    expect(deadlines.some((o) => o.kind === "GUARANTEE")).toBe(false); // rejected
  });

  it("logs the extraction as a system action", async () => {
    const rows = await w.db.select().from(schema.activityLog).where(eq(schema.activityLog.action, "terms_read"));
    expect(rows[0]).toMatchObject({ actorType: "SYSTEM", actorLabel: "Term extraction" });
  });
});
