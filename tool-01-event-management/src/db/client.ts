import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";

export type Db = PostgresJsDatabase<typeof schema>;

// One pool per process. In dev, Next's hot reload re-evaluates modules,
// so the client is kept on globalThis to avoid leaking connections.
const globalForDb = globalThis as unknown as { __erSql?: postgres.Sql; __erDb?: Db };

export function getDb(): Db {
  if (globalForDb.__erDb) return globalForDb.__erDb;
  const sql = postgres(env().DATABASE_URL, { max: 10 });
  const db = drizzle(sql, { schema });
  globalForDb.__erSql = sql;
  globalForDb.__erDb = db;
  return db;
}

export async function closeDb() {
  await globalForDb.__erSql?.end();
  globalForDb.__erSql = undefined;
  globalForDb.__erDb = undefined;
}

export { schema };
