import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { getDb, closeDb } from "./client";
import { authAccounts, organizations, users } from "./schema";
import { brandProblems, orgSeedSchema, type RoleKey } from "@/config/schema";
import { seedRules } from "@/services/rules";
import { seedDemoWorkspace, type SeededUser } from "./seed-demo";

// Usage:
//   npm run db:seed               → organisation from CLIENT_CONFIG + demo users (+ demo data when config.demo)
//   npm run db:seed -- --org-only → organisation, its rules and a single admin (real deployments).
//     Needs SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_NAME). A random password is printed once.

const DEMO_PASSWORD = "fernway-demo-2026";

const demoUsers: Array<{ key: string; name: string; email: string; role: RoleKey }> = [
  { key: "admin", name: "Alex Morgan", email: "admin@fernway.test", role: "ADMIN" },
  { key: "revops", name: "Sam Okafor", email: "revops@fernway.test", role: "REVOPS" },
  { key: "cslead", name: "Jordan Ellis", email: "cslead@fernway.test", role: "CS_LEAD" },
  { key: "priya", name: "Priya Nair", email: "priya@fernway.test", role: "CSM" },
  { key: "marcus", name: "Marcus Bell", email: "marcus@fernway.test", role: "CSM" },
  { key: "lena", name: "Lena Park", email: "lena@fernway.test", role: "CSM" },
  { key: "saleslead", name: "Dana Reyes", email: "saleslead@fernway.test", role: "SALES_LEAD" },
  { key: "tomas", name: "Tomás Rivera", email: "tomas@fernway.test", role: "SELLER" },
  { key: "aisha", name: "Aisha Bello", email: "aisha@fernway.test", role: "SELLER" },
  { key: "exec", name: "Morgan Hale", email: "exec@fernway.test", role: "EXEC" },
];

async function main() {
  const orgOnly = process.argv.includes("--org-only");
  const name = process.env.CLIENT_CONFIG ?? "demo";
  const seed = orgSeedSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "config", "clients", `${name}.json`), "utf8")));
  const problems = brandProblems(seed.config.brand);
  if (problems.length) throw new Error(`Brand colours fail the white-label checks:\n  - ${problems.join("\n  - ")}`);

  let people = demoUsers;
  let password = DEMO_PASSWORD;
  if (orgOnly) {
    const email = process.env.SEED_ADMIN_EMAIL?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set SEED_ADMIN_EMAIL to the first administrator's email address.");
    people = [{ key: "admin", name: process.env.SEED_ADMIN_NAME?.trim() || "Administrator", email, role: "ADMIN" }];
    password = randomBytes(12).toString("base64url");
  }

  const db = getDb();
  if ((await db.select().from(organizations).where(eq(organizations.slug, seed.slug)).limit(1)).length) {
    console.log(`Organisation "${seed.slug}" already exists. Run npm run db:reset first to reseed.`);
    return;
  }
  const [org] = await db.insert(organizations).values({ name: seed.name, slug: seed.slug, currency: seed.currency, timezone: seed.timezone, config: seed.config }).returning();

  const hash = await hashPassword(password);
  const created: SeededUser[] = [];
  for (const p of people) {
    const [u] = await db.insert(users).values({ name: p.name, email: p.email, role: p.role, orgId: org.id, emailVerified: true, status: "ACTIVE" }).returning();
    await db.insert(authAccounts).values({ accountId: u.id, providerId: "credential", userId: u.id, password: hash });
    created.push({ id: u.id, name: u.name, role: u.role, email: u.email, key: p.key });
  }
  await seedRules(db, org.id, seed.rules, created[0].id);

  console.log(`Seeded organisation "${org.name}" with ${people.length} user(s) and ${seed.rules.length} signal rules.`);
  console.log(`Sign in at ${process.env.APP_URL ?? "http://localhost:3002"} with any of:`);
  for (const p of people) console.log(`  ${p.email.padEnd(26)} ${p.role}`);
  console.log(orgOnly ? `Temporary password (shown once): ${password}` : `Password (demo only): ${password}`);

  if (seed.demo && !orgOnly) await seedDemoWorkspace(db, org.id, created);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
