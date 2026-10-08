import "dotenv/config";
import { closeDb, getDb } from "@/db/client";
import { runDaily, runHourly, runWeekly } from "./monitor";

// npm run jobs:once -- daily | hourly | weekly
const jobs = { daily: runDaily, hourly: runHourly, weekly: runWeekly } as const;

async function main() {
  const job = process.argv[2] as keyof typeof jobs;
  if (!(job in jobs)) throw new Error("Usage: npm run jobs:once -- daily|hourly|weekly");
  console.log(job, await jobs[job](getDb()));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
