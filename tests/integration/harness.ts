import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "@/db/schema";
import { orgSeedSchema, type RoleKey } from "@/config/schema";
import type { Db } from "@/db/client";
import type { ServiceCtx } from "@/services/context";
import { seedRules } from "@/services/rules";
import { addDays } from "@/core/dates";

const url = process.env.TEST_DATABASE_URL ?? "postgres://esd:esd@localhost:5402/signal_desk_test";
if (!/_test(\?|$)/.test(url)) throw new Error("Integration tests only run against a *_test database.");

let sql: postgres.Sql | undefined;
let db: Db | undefined;

export async function testDb(): Promise<Db> {
  if (db) return db;
  sql = postgres(url, { max: 4, onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  db = drizzle(sql, { schema });
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  return db;
}

export async function closeTestDb() {
  await sql?.end();
  sql = undefined;
  db = undefined;
}

export const seed = orgSeedSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "config/clients/demo.json"), "utf8")));

const PEOPLE = ["ADMIN", "REVOPS", "CS_LEAD", "CSM", "CSM_2", "SALES_LEAD", "SELLER", "SELLER_2", "EXEC"] as const;
type PersonKey = (typeof PEOPLE)[number];

export type World = Awaited<ReturnType<typeof makeWorld>>;

/** A fresh organisation with the demo config and rules, one user per role, and a settable clock. */
export async function makeWorld(slug = `org-${Math.random().toString(36).slice(2, 8)}`) {
  const d = await testDb();
  const [org] = await d.insert(schema.organizations).values({ name: "Test Co", slug, currency: "USD", timezone: "America/New_York", config: seed.config }).returning();
  const people = {} as Record<PersonKey, { id: string; name: string; role: RoleKey }>;
  for (const key of PEOPLE) {
    const role = key.replace(/_2$/, "") as RoleKey;
    const [u] = await d.insert(schema.users).values({ name: `${key} person`, email: `${key.toLowerCase()}@${slug}.test`, orgId: org.id, role }).returning();
    people[key] = { id: u.id, name: u.name, role };
  }
  await seedRules(d, org.id, seed.rules, people.ADMIN.id);
  // Wednesday 10:00 New York.
  let clock = new Date("2026-07-01T14:00:00.000Z");
  const ctx = (key: PersonKey): ServiceCtx => ({
    db: d,
    now: () => clock,
    actor: { userId: people[key].id, name: people[key].name, role: people[key].role, orgId: org.id, timezone: org.timezone, currency: "USD", config: seed.config },
  });
  return {
    db: d,
    org,
    people,
    ctx,
    now: () => clock,
    today: () => clock.toISOString().slice(0, 10),
    setNow: (iso: string) => {
      clock = new Date(iso);
    },
    advanceDays: (n: number) => {
      clock = new Date(clock.getTime() + n * 86_400_000);
    },
  };
}

/** An account with a subscription. Defaults: 50 seats, 50k credits, term started 200 days ago. */
export async function makeAccount(w: World, over: Partial<typeof schema.accounts.$inferInsert> = {}, sub: Partial<typeof schema.subscriptions.$inferInsert> = {}) {
  const n = Math.random().toString(36).slice(2, 7);
  const [a] = await w.db
    .insert(schema.accounts)
    .values({ orgId: w.org.id, name: `Acme ${n}`, domain: `acme-${n}.example`, crmId: `CRM-${n}`, segment: "mid", csmId: w.people.CSM.id, ownerId: w.people.SELLER.id, ...over })
    .returning();
  const termStart = addDays(w.today(), -200);
  await w.db.insert(schema.subscriptions).values({
    orgId: w.org.id,
    accountId: a.id,
    plan: "Growth",
    seatsPurchased: 50,
    creditsCommitted: 50_000,
    termStart,
    termEnd: addDays(termStart, 364),
    arrMinor: 8_000_000,
    addons: [],
    ...sub,
  });
  return a;
}

/** Daily usage rows for the last `days` days ending today, built by `f(i)` where i = 0 is oldest. */
export function usageRows(crmId: string, today: string, days: number, f: (i: number) => Partial<{ activeSeats: number; creditsUsedTerm: number; gatedAttempts: Record<string, number>; openEscalations: number; workspaces: unknown[]; contacts: unknown[] }>) {
  return Array.from({ length: days }, (_, i) => ({ account: { crmId }, date: addDays(today, i - days + 1), activeSeats: 30, creditsUsedTerm: 0, ...f(i) }));
}
