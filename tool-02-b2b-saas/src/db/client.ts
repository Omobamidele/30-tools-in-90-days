import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";

export type Db = PostgresJsDatabase<typeof schema>;

// One pool per process. In dev, Next's hot reload re-evaluates modules,
// so the client is kept on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __esdSql?: postgres.Sql; __esdDb?: Db };

export function getDb(): Db {
  if (globalForDb.__esdDb) return globalForDb.__esdDb;
  const sql = postgres(env().DATABASE_URL, { max: 10 });
  const db = drizzle(sql, { schema });
  globalForDb.__esdSql = sql;
  globalForDb.__esdDb = db;
  return db;
}

export async function closeDb() {
  await globalForDb.__esdSql?.end();
  globalForDb.__esdSql = undefined;
  globalForDb.__esdDb = undefined;
}

export { schema };
