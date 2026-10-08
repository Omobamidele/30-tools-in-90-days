import { readFileSync } from "node:fs";
import path from "node:path";
import { addDays, daysBetween } from "@/core/dates";
import { DEMO_ACCOUNTS } from "@/demo/accounts";
import { rowFor } from "@/demo/model";

// Demo usage simulator (spec §10). Posts simulated daily usage for the fictional demo accounts
// through the REAL ingest API, exactly as a customer's warehouse job would, marked SIMULATED so the
// interface labels it. Usage: npm run usage:simulate [-- --date=YYYY-MM-DD] [-- --days=N]
//
// The seed writes .demo/simulator.json with the model's anchor date and a demo ingest key.

type Cfg = { anchor: string; key: string; appUrl: string };

async function main() {
  const cfg = JSON.parse(readFileSync(path.join(process.cwd(), ".demo", "simulator.json"), "utf8")) as Cfg;
  const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const end = arg("date") ?? today;
  const days = Number(arg("days") ?? 1);
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    const t = daysBetween(cfg.anchor, date);
    for (const s of DEMO_ACCOUNTS) {
      const r = rowFor(s, cfg.anchor, t);
      if (r) rows.push(r);
    }
  }
  const res = await fetch(`${cfg.appUrl}/api/ingest/usage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "SIMULATED", rows }),
  });
  const body = (await res.json()) as { accepted?: number; rejected?: unknown[]; error?: string };
  if (!res.ok) throw new Error(`Ingest answered ${res.status}: ${body.error}`);
  console.log(`Posted ${rows.length} simulated rows for ${days} day(s) ending ${end}: ${body.accepted} accepted, ${body.rejected?.length ?? 0} rejected. Detection runs for these accounts now.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
