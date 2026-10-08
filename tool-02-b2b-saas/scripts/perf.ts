import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import * as schema from "@/db/schema";
import { orgSeedSchema } from "@/config/schema";
import type { Db } from "@/db/client";
import type { ServiceCtx } from "@/services/context";
import { seedRules } from "@/services/rules";
import { ingestUsage } from "@/services/ingest";
import { runDetection } from "@/services/detection";
import { listSignals } from "@/services/signals";
import { listAccounts } from "@/services/accounts";
import { getResults } from "@/services/results";
import { addDays } from "@/core/dates";

// Performance check for spec NFR-1: 2,000 accounts × 90 days of usage (180,000 rows).
// Runs against the TEST database only: npx tsx scripts/perf.ts
const url = process.env.TEST_DATABASE_URL ?? "";
if (!/_test(\?|$)/.test(url)) throw new Error("Runs against a *_test database only.");

const N = 2000;
const DAYS = Number(process.env.PERF_DAYS ?? 90);

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now();
  const r = await fn();
  console.log(`${label.padEnd(44)} ${Math.round(performance.now() - t).toString().padStart(6)} ms`);
  return r;
}

async function main() {
  const sql = postgres(url, { max: 8, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  const db = drizzle(sql, { schema }) as unknown as Db;
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  const seed = orgSeedSchema.parse(JSON.parse(readFileSync("config/clients/demo.json", "utf8")));
  const [org] = await db.insert(schema.organizations).values({ name: "Perf", slug: "perf", currency: "USD", timezone: "America/New_York", config: seed.config }).returning();
  const [csm] = await db.insert(schema.users).values({ name: "CSM", email: "csm@perf.test", orgId: org.id, role: "CSM" }).returning();
  const [admin] = await db.insert(schema.users).values({ name: "Admin", email: "admin@perf.test", orgId: org.id, role: "ADMIN" }).returning();
  await seedRules(db, org.id, seed.rules, admin.id);
  const today = "2026-07-01";
  const now = new Date("2026-07-01T14:00:00Z");
  const ctx: ServiceCtx = { db, now: () => now, actor: { userId: admin.id, name: "Admin", role: "ADMIN", orgId: org.id, timezone: org.timezone, currency: "USD", config: seed.config } };

  await time(`create ${N} accounts + subscriptions`, async () => {
    for (let i = 0; i < N; i += 500) {
      const accts = await db
        .insert(schema.accounts)
        .values(Array.from({ length: Math.min(500, N - i) }, (_, j) => ({ orgId: org.id, name: `Account ${i + j}`, crmId: `P-${i + j}`, segment: "mid", csmId: csm.id })))
        .returning({ id: schema.accounts.id });
      await db.insert(schema.subscriptions).values(accts.map((a) => ({ orgId: org.id, accountId: a.id, plan: "Growth", seatsPurchased: 50, creditsCommitted: 50_000, termStart: "2026-01-01", termEnd: "2026-12-31", arrMinor: 8_000_000 })));
    }
  });
  await time(`ingest ${N * DAYS} usage rows`, async () => {
    const rows: unknown[] = [];
    for (let i = 0; i < N; i++) {
      // One account in ten trends over the seat line.
      for (let d = 0; d < DAYS; d++) rows.push({ account: { crmId: `P-${i}` }, date: addDays(today, d - DAYS + 1), activeSeats: i % 10 === 0 && d > 60 ? 47 : 30 + (d % 7), creditsUsedTerm: 100 * d });
    }
    for (let k = 0; k < rows.length; k += 5000) await ingestUsage(db, { id: org.id, timezone: org.timezone }, rows.slice(k, k + 5000), "API", { now });
  });
  const summary = await time("detection, all accounts (target < 60s)", () => runDetection(ctx));
  console.log("  ", summary);
  await time("detection again (refresh, idempotent)", () => runDetection(ctx));
  await time("signals queue (target < 1s)", () => listSignals(ctx, { status: ["NEW"] }));
  await time("accounts list (target < 1s)", () => listAccounts(ctx));
  await time("results, all time (target < 1s)", () => getResults(ctx, "all"));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
