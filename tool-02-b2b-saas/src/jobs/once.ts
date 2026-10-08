import "dotenv/config";
import { getDb, closeDb } from "@/db/client";
import { runDaily, runHourly, runWeekly } from "./jobs";

// Run one job now: npm run jobs:once -- daily | hourly | weekly
async function main() {
  const job = process.argv[2];
  const db = getDb();
  const result = job === "daily" ? await runDaily(db) : job === "hourly" ? await runHourly(db) : job === "weekly" ? await runWeekly(db) : null;
  if (!result) throw new Error("Usage: npm run jobs:once -- daily | hourly | weekly");
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
