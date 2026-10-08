import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { accounts, contacts, ingestBatches, usageSnapshots } from "@/db/schema";
import { addDays, daysBetween } from "@/core/dates";
import { seniorityFromTitle } from "@/core/seniority";
import { localDate } from "@/core/business-time";

// Usage ingest (spec FR-2): daily aggregates per account, pushed by the vendor's warehouse job,
// a CSV upload, or the demo simulator. Every row is validated on its own: one bad row never
// rejects the batch, and each rejection says why. Upserts make re-sends safe (edge case 3).

export const MAX_ROWS = 5000;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");
const count = z.number({ error: "must be a number" }).int("must be a whole number").nonnegative("must be 0 or more");

export const usageRowSchema = z.object({
  account: z
    .object({ crmId: z.string().trim().min(1).optional(), domain: z.string().trim().toLowerCase().min(3).optional() })
    .refine((a) => a.crmId || a.domain, "account needs crmId or domain"),
  date: isoDate,
  activeSeats: count,
  creditsUsedTerm: count.default(0),
  workspaces: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), createdOn: isoDate, activeUsers: count })).max(200).default([]),
  gatedAttempts: z.record(z.string().min(1), count).default({}),
  openEscalations: count.default(0),
  contacts: z
    .array(z.object({ name: z.string().trim().min(1), title: z.string().trim().max(120).nullish(), email: z.email().toLowerCase(), firstSeenOn: isoDate.nullish() }))
    .max(500)
    .default([]),
});
export type UsageRow = z.infer<typeof usageRowSchema>;

export type IngestResult = { batchId: string; accepted: number; rejected: Array<{ index: number; reason: string }>; accountIds: string[] };

export async function ingestUsage(
  db: Db,
  org: { id: string; timezone: string },
  rawRows: unknown,
  source: "API" | "CSV" | "SIMULATED",
  opts: { keyId?: string | null; now?: Date } = {},
): Promise<IngestResult> {
  const now = opts.now ?? new Date();
  const today = localDate(now, org.timezone);
  if (!Array.isArray(rawRows)) throw new Error("rows must be an array");
  if (rawRows.length > MAX_ROWS) throw new Error(`Send at most ${MAX_ROWS} rows per request.`);

  const rejected: IngestResult["rejected"] = [];
  const valid: Array<{ index: number; row: UsageRow }> = [];
  rawRows.forEach((raw, index) => {
    const r = usageRowSchema.safeParse(raw);
    if (!r.success) return rejected.push({ index, reason: r.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`).join("; ") });
    if (r.data.date > addDays(today, 1)) return rejected.push({ index, reason: `date ${r.data.date} is in the future` });
    if (daysBetween(r.data.date, today) > 400) return rejected.push({ index, reason: `date ${r.data.date} is more than 400 days old` });
    valid.push({ index, row: r.data });
  });

  // Resolve accounts in one query (edge case 4: unknown accounts are rejected, never created).
  const crmIds = [...new Set(valid.map((v) => v.row.account.crmId).filter(Boolean))] as string[];
  const domains = [...new Set(valid.map((v) => v.row.account.domain).filter(Boolean))] as string[];
  const known = crmIds.length || domains.length
    ? await db
        .select({ id: accounts.id, crmId: accounts.crmId, domain: accounts.domain })
        .from(accounts)
        .where(and(eq(accounts.orgId, org.id), or(crmIds.length ? inArray(accounts.crmId, crmIds) : undefined, domains.length ? inArray(accounts.domain, domains) : undefined)))
    : [];
  const byCrm = new Map(known.filter((k) => k.crmId).map((k) => [k.crmId!, k.id]));
  const byDomain = new Map(known.filter((k) => k.domain).map((k) => [k.domain!, k.id]));

  const rows: Array<typeof usageSnapshots.$inferInsert> = [];
  const contactRows = new Map<string, typeof contacts.$inferInsert>();
  const seen = new Set<string>();
  for (const { index, row } of valid) {
    const accountId = (row.account.crmId && byCrm.get(row.account.crmId)) || (row.account.domain && byDomain.get(row.account.domain));
    if (!accountId) {
      rejected.push({ index, reason: `no account with ${row.account.crmId ? `crmId "${row.account.crmId}"` : `domain "${row.account.domain}"`}` });
      continue;
    }
    const key = `${accountId}:${row.date}`;
    if (seen.has(key)) {
      rejected.push({ index, reason: `duplicate row for this account and date in the same request` });
      continue;
    }
    seen.add(key);
    rows.push({
      orgId: org.id,
      accountId,
      date: row.date,
      activeSeats: row.activeSeats,
      creditsUsedTerm: row.creditsUsedTerm,
      workspaces: row.workspaces,
      gatedAttempts: row.gatedAttempts,
      openEscalations: row.openEscalations,
      source,
      receivedAt: now,
    });
    for (const c of row.contacts) {
      // The same person appears on many daily rows: keep one, with the earliest sighting.
      const firstSeenOn = c.firstSeenOn ?? row.date;
      const prev = contactRows.get(c.email);
      if (!prev || (prev.firstSeenOn ?? "") > firstSeenOn) contactRows.set(c.email, { orgId: org.id, accountId, name: c.name, title: c.title ?? null, email: c.email, seniority: seniorityFromTitle(c.title), firstSeenOn });
    }
  }

  return db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) {
      await tx
        .insert(usageSnapshots)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [usageSnapshots.accountId, usageSnapshots.date],
          set: {
            activeSeats: sql`excluded.active_seats`,
            creditsUsedTerm: sql`excluded.credits_used_term`,
            workspaces: sql`excluded.workspaces`,
            gatedAttempts: sql`excluded.gated_attempts`,
            openEscalations: sql`excluded.open_escalations`,
            source: sql`excluded.source`,
            receivedAt: sql`excluded.received_at`,
          },
        });
    }
    // Contacts: first sighting wins for first_seen_on; title updates keep seniority in step.
    const people = [...contactRows.values()];
    for (let i = 0; i < people.length; i += 500) {
      await tx
        .insert(contacts)
        .values(people.slice(i, i + 500))
        .onConflictDoUpdate({
          target: [contacts.orgId, contacts.email],
          set: { name: sql`excluded.name`, firstSeenOn: sql`least(${contacts.firstSeenOn}, excluded.first_seen_on)`, title: sql`coalesce(excluded.title, ${contacts.title})`, seniority: sql`coalesce(excluded.seniority, ${contacts.seniority})` },
        });
    }
    const [batch] = await tx
      .insert(ingestBatches)
      .values({ orgId: org.id, source, keyId: opts.keyId ?? null, accepted: rows.length, rejected: rejected.length, errors: rejected.slice(0, 100), receivedAt: now })
      .returning({ id: ingestBatches.id });
    return { batchId: batch.id, accepted: rows.length, rejected: rejected.sort((a, b) => a.index - b.index), accountIds: [...new Set(rows.map((r) => r.accountId))] };
  });
}
