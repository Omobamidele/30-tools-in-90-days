import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb, closeDb } from "./client";
import { organizations, users, accounts } from "./schema";
import { orgSeedSchema, contrastAgainstWhite, type RoleKey } from "@/config/schema";
import { seedDemoWorkspace, seedRecordedRelease, type SeededUser } from "./seed-demo";

// Usage:
//   npm run db:seed             → organisation from CLIENT_CONFIG + demo users (+ demo records when config.demo)
//   npm run db:seed -- --org-only → organisation and a single admin only (real deployments).
//     Needs SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_NAME). A random password is printed once;
//     the admin changes it after first sign-in. The demo password is never used here.

const DEMO_PASSWORD = "northbeam-demo-2026";

const demoUsers: Array<{ name: string; email: string; role: RoleKey }> = [
  { name: "Avery Collins", email: "admin@northbeam.test", role: "ADMIN" },
  { name: "Jordan Mendes", email: "ops@northbeam.test", role: "OPS_DIRECTOR" },
  { name: "Priya Nair", email: "priya@northbeam.test", role: "EVENT_MANAGER" },
  { name: "Sam Okafor", email: "sam@northbeam.test", role: "EVENT_MANAGER" },
  { name: "Lee Park", email: "finance@northbeam.test", role: "FINANCE" },
  { name: "Morgan Reyes", email: "md@northbeam.test", role: "MD" },
];

async function main() {
  const orgOnly = process.argv.includes("--org-only");
  const name = process.env.CLIENT_CONFIG ?? "demo";
  const file = path.join(process.cwd(), "config", "clients", `${name}.json`);
  const seed = orgSeedSchema.parse(JSON.parse(readFileSync(file, "utf8")));

  const ratio = contrastAgainstWhite(seed.config.brand.primaryColor);
  if (ratio < 4.5) {
    throw new Error(
      `Brand colour ${seed.config.brand.primaryColor} has ${ratio.toFixed(2)}:1 contrast on white; 4.5:1 is required.`,
    );
  }

  // Validate everything before writing, so a bad input never leaves a half-seeded org.
  let people = demoUsers;
  let password = DEMO_PASSWORD;
  if (orgOnly) {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Set SEED_ADMIN_EMAIL to the first administrator's email address.");
    }
    people = [{ name: process.env.SEED_ADMIN_NAME?.trim() || "Administrator", email, role: "ADMIN" }];
    password = randomBytes(12).toString("base64url");
  }

  const db = getDb();
  const existing = await db.select().from(organizations).where(eq(organizations.slug, seed.slug)).limit(1);
  if (existing.length) {
    console.log(`Organisation "${seed.slug}" already exists. Run npm run db:reset first to reseed.`);
    return;
  }

  const [org] = await db
    .insert(organizations)
    .values({
      name: seed.name,
      slug: seed.slug,
      baseCurrency: seed.baseCurrency,
      timezone: seed.timezone,
      config: seed.config,
    })
    .returning();

  const passwordHash = await hashPassword(password);
  const created: SeededUser[] = [];
  for (const person of people) {
    const [u] = await db
      .insert(users)
      .values({ ...person, orgId: org.id, emailVerified: true, status: "ACTIVE" })
      .returning();
    await db.insert(accounts).values({
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: passwordHash,
    });
    created.push({ id: u.id, name: u.name, role: u.role, email: u.email });
  }

  console.log(`Seeded organisation "${org.name}" with ${people.length} user(s).`);
  console.log(`Sign in at ${process.env.APP_URL ?? "http://localhost:3001"} with any of:`);
  for (const p of people) console.log(`  ${p.email.padEnd(26)} ${p.role}`);
  console.log(orgOnly ? `Temporary password (shown once): ${password}` : `Password (demo only): ${password}`);

  if (seed.config.demo && !orgOnly) {
    await seedDemoWorkspace(db, org.id, created);
    // Run the daily rules once so the demo opens with its real alerts and snapshots.
    const { runDaily } = await import("@/jobs/monitor");
    console.log("Daily rules:", await runDaily(db));
    await seedRecordedRelease(db, org.id, created);
    console.log("Recorded one room release on the London summit (contract amended, decision recorded).");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
