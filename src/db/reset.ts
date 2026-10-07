import "dotenv/config";
import postgres from "postgres";

// Drops and recreates the public schema, then you run db:migrate and db:seed.
// Refuses to run against anything that isn't a local database.
async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
    throw new Error("db:reset only runs against a local database.");
  }
  const sql = postgres(url, { max: 1 });
  await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;");
  await sql.end();
  console.log("Database reset. Now run: npm run db:migrate && npm run db:seed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
