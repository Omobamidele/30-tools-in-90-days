// Performance check (spec NFR): portfolio overview with 200 events and 2,000 contracts.
// Runs against the *test* database only. Usage: npx tsx scripts/perf-portfolio.ts
import "dotenv/config";
import { randomUUID } from "node:crypto";
import * as schema from "@/db/schema";
import { getPortfolio } from "@/services/exposure";
import { closeTestDb, makeWorld } from "../tests/integration/harness";

async function main() {
  const w = await makeWorld("perf-org");
  const db = w.db;
  const orgId = w.org.id;
  const ops = w.ctx("OPS_DIRECTOR");
  const [client] = await db.insert(schema.clients).values({ orgId, name: "Perf client" }).returning();
  const [agreement] = await db.insert(schema.clientAgreements).values({ orgId, clientId: client.id, name: "MSA", effectiveFrom: "2020-01-01" }).returning();
  await db.insert(schema.liabilityRules).values([
    { orgId, agreementId: agreement.id, category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
    { orgId, agreementId: agreement.id, category: "FB_SHORTFALL", bearer: "SPLIT", agencyPct: 50 },
  ]);
  const suppliers = await db
    .insert(schema.suppliers)
    .values(Array.from({ length: 50 }, (_, i) => ({ orgId, name: `Supplier ${i}`, type: "HOTEL" as const, normalizedKey: `s${i}|` })))
    .returning();

  const t0 = Date.now();
  for (let e = 0; e < 200; e++) {
    const start = `2027-${String((e % 12) + 1).padStart(2, "0")}-15`;
    const [ev] = await db
      .insert(schema.events)
      .values({ orgId, clientId: client.id, name: `Event ${e}`, type: "Customer event", startDate: start, endDate: start, timezone: "America/New_York", ownerId: w.people.OPS_DIRECTOR.id, forecastAttendance: 200, baseCurrency: "USD", status: "CONTRACTED" })
      .returning();
    const contractRows = Array.from({ length: 10 }, (_, k) => ({
      id: randomUUID(),
      orgId,
      eventId: ev.id,
      supplierId: suppliers[(e + k) % 50].id,
      title: `Contract ${k}`,
      status: "ACTIVE" as const,
      currency: "USD",
      contractedValueMinor: 5_000_000,
    }));
    await db.insert(schema.contracts).values(contractRows);
    const clauseRows = contractRows.flatMap((k) => [
      {
        id: randomUUID(),
        orgId,
        contractId: k.id,
        type: "ROOM_BLOCK" as const,
        label: "Block",
        status: "CONFIRMED" as const,
        data: { blockName: "Block", nights: [{ date: start, rooms: 100, rateMinor: 20_000 }], commitmentPct: 80, basis: "PER_NIGHT", damagesPct: 100, cutoffDate: "2027-01-01", cutoffTime: "17:00", reviewPoints: [] },
        inputs: { projection: "CURRENT" },
      },
      { id: randomUUID(), orgId, contractId: k.id, type: "FB_MINIMUM" as const, label: "F&B", status: "CONFIRMED" as const, data: { label: "F&B", minimumMinor: 2_000_000, basis: "PRE_TAX_PRE_SERVICE", surchargePct: 20 }, inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 8_000 } },
      { id: randomUUID(), orgId, contractId: k.id, type: "CANCELLATION" as const, label: "Cancellation", status: "CONFIRMED" as const, data: { basis: "CONTRACT_VALUE", depositTreatment: "CREDITED", tiers: [{ startsOn: "2026-01-01", penaltyPct: 25, penaltyFixedMinor: null }] }, inputs: {} },
    ]);
    await db.insert(schema.clauses).values(clauseRows);
    const blocks = clauseRows.filter((c) => c.type === "ROOM_BLOCK");
    const snaps = await db.insert(schema.pickupSnapshots).values(blocks.map((b) => ({ orgId, clauseId: b.id, capturedAt: new Date(), source: "MANUAL" as const }))).returning();
    await db.insert(schema.pickupValues).values(snaps.map((s) => ({ snapshotId: s.id, nightDate: start, roomsPickedUp: 70 })));
  }
  console.log(`Generated 200 events / 2,000 contracts / 6,000 terms in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  for (let run = 1; run <= 3; run++) {
    const t = Date.now();
    const p = await getPortfolio(ops);
    console.log(`Portfolio run ${run}: ${Date.now() - t} ms for ${p.rows.length} events, total ${p.totals.currentMinor / 100}`);
  }
  await closeTestDb();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
