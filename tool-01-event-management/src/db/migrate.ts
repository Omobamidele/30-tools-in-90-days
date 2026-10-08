import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb, closeDb } from "./client";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations applied.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
