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

const url = process.env.TEST_DATABASE_URL ?? "postgres://er:er@localhost:5401/exposure_register_test";
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

export type World = Awaited<ReturnType<typeof makeWorld>>;

/** A fresh organisation with one user per role, and ctx builders for each. */
export async function makeWorld(slug = `org-${Math.random().toString(36).slice(2, 8)}`) {
  const d = await testDb();
  const seed = orgSeedSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "config/clients/demo.json"), "utf8")));
  const [org] = await d
    .insert(schema.organizations)
    .values({ name: seed.name, slug, baseCurrency: "USD", timezone: "America/New_York", config: seed.config })
    .returning();
  const roles: RoleKey[] = ["ADMIN", "OPS_DIRECTOR", "EVENT_MANAGER", "FINANCE", "MD"];
  const people: Record<string, { id: string; name: string; role: RoleKey }> = {};
  for (const role of [...roles, "EVENT_MANAGER_2" as const]) {
    const r = (role === "EVENT_MANAGER_2" ? "EVENT_MANAGER" : role) as RoleKey;
    const [u] = await d
      .insert(schema.users)
      .values({ name: `${role} person`, email: `${role.toLowerCase()}@${slug}.test`, orgId: org.id, role: r })
      .returning();
    people[role] = { id: u.id, name: u.name, role: r };
  }
  let clock = new Date("2027-09-01T12:00:00.000Z");
  const ctxFor = (key: keyof typeof people): ServiceCtx => ({
    db: d,
    now: () => clock,
    actor: {
      userId: people[key].id,
      name: people[key].name,
      role: people[key].role,
      orgId: org.id,
      orgTimezone: org.timezone,
      baseCurrency: "USD",
      config: seed.config,
    },
  });
  return {
    db: d,
    org,
    people,
    ctx: ctxFor,
    setNow: (iso: string) => {
      clock = new Date(iso);
    },
  };
}
