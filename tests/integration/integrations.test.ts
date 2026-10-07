import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeTestDb, makeAccount, makeWorld, usageRows, type World } from "./harness";
import * as schema from "@/db/schema";
import { ingestUsage } from "@/services/ingest";
import { runDetection } from "@/services/detection";
import { acceptSignal } from "@/services/signals";
import { applyCrmUpdate, getCsql } from "@/services/csqls";
import { createEndpoint, deliverDueWebhooks, RETRY_MINUTES, setWebhookFetcherForTests } from "@/services/webhooks";
import { createApiKey, resolveApiKey, revokeApiKey } from "@/services/keys";
import { importAccounts } from "@/services/accounts";
import { getRule, previewRule, updateRule } from "@/services/rules";
import { getResults } from "@/services/results";
import { sendWeeklyDigests } from "@/services/digest";
import { setEmailSenderForTests } from "@/adapters/email";
import { DomainError } from "@/services/errors";

let w: World;
const sent: string[] = [];
beforeAll(async () => {
  setEmailSenderForTests({ driver: "smtp", send: async (m) => (sent.push(m.to), { sent: true }) });
  w = await makeWorld();
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  setWebhookFetcherForTests(undefined);
  await closeTestDb();
});

const org = () => ({ id: w.org.id, timezone: w.org.timezone });
async function routedCsql() {
  const a = await makeAccount(w);
  await ingestUsage(w.db, org(), usageRows(a.crmId!, w.today(), 30, (i) => ({ activeSeats: i < 10 ? 38 : 47 })), "API", { now: w.now() });
  await runDetection(w.ctx("ADMIN"), { accountIds: [a.id] });
  const [s] = await w.db.select().from(schema.signals).where(eq(schema.signals.accountId, a.id));
  const { csqlId, csqlNumber } = await acceptSignal(w.ctx("CSM"), s.id, s.lockVersion, { handoffNote: "Handoff note for the test." });
  return { account: a, csqlId, csqlNumber };
}

describe("outbound webhooks", () => {
  it("signs each delivery with HMAC over the raw body, and retries on failure until it gives up", async () => {
    const { secret } = await createEndpoint(w.ctx("REVOPS"), { url: "https://hooks.example.com/in", events: ["csql.routed"] });
    const calls: Array<{ body: string; sig: string }> = [];
    let status = 500;
    setWebhookFetcherForTests(async (_url, init) => {
      calls.push({ body: init.body, sig: init.headers["X-Signature"] });
      return { status };
    });
    await routedCsql();
    const first = await deliverDueWebhooks(w.db, w.now(), 50, w.org.id);
    expect(first).toEqual({ delivered: 0, failed: 1 });
    expect(calls[0].sig).toBe(`sha256=${createHmac("sha256", secret).update(calls[0].body).digest("hex")}`);
    expect(JSON.parse(calls[0].body)).toMatchObject({ event: "csql.routed", data: { status: "ROUTED" } });
    // Not due again until the first backoff has passed.
    expect(await deliverDueWebhooks(w.db, w.now(), 50, w.org.id)).toEqual({ delivered: 0, failed: 0 });
    let t = w.now().getTime();
    for (const wait of RETRY_MINUTES) {
      t += wait * 60_000 + 1000;
      await deliverDueWebhooks(w.db, new Date(t), 50, w.org.id);
    }
    const [d] = await w.db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.orgId, w.org.id));
    expect(d).toMatchObject({ status: "FAILED", attempts: RETRY_MINUTES.length + 1, responseCode: 500 });
    status = 200;
  });

  it("only RevOps and admins manage webhooks, and URLs are validated", async () => {
    await expect(createEndpoint(w.ctx("CSM"), { url: "https://x.example.com", events: ["csql.routed"] })).rejects.toBeInstanceOf(DomainError);
    await expect(createEndpoint(w.ctx("REVOPS"), { url: "not a url", events: ["csql.routed"] })).rejects.toThrow(/Some fields/);
    await expect(createEndpoint(w.ctx("REVOPS"), { url: "https://x.example.com", events: [] })).rejects.toThrow(/Some fields/);
  });
});

describe("API keys and the CRM update endpoint", () => {
  it("stores only a hash, rejects the wrong kind and revoked keys", async () => {
    const { id, token } = await createApiKey(w.ctx("REVOPS"), { kind: "CRM", name: "Salesforce flow" });
    const [row] = await w.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, id));
    expect(row.hash).not.toContain(token);
    expect(await resolveApiKey(w.db, `Bearer ${token}`, "CRM")).toMatchObject({ orgId: w.org.id });
    expect(await resolveApiKey(w.db, `Bearer ${token}`, "INGEST")).toBeNull();
    expect(await resolveApiKey(w.db, "Bearer nope", "CRM")).toBeNull();
    await revokeApiKey(w.ctx("REVOPS"), id);
    expect(await resolveApiKey(w.db, `Bearer ${token}`, "CRM")).toBeNull();
  });

  it("moves a CSQL through the same state machine from CRM updates", async () => {
    const { csqlId, csqlNumber } = await routedCsql();
    const sys = w.ctx("ADMIN");
    await expect(applyCrmUpdate(sys, { csql: csqlNumber, outcome: "WON" })).rejects.toThrow(/Record an opportunity amount/);
    expect(await applyCrmUpdate(sys, { csql: csqlNumber, amount: 12000 })).toMatchObject({ status: "OPPORTUNITY" });
    expect(await applyCrmUpdate(sys, { csql: csqlNumber, outcome: "WON" })).toMatchObject({ status: "WON" });
    expect((await getCsql(sys, csqlId)).csql.outcomeAmountMinor).toBe(1_200_000);
    await expect(applyCrmUpdate(sys, { csql: 99999, amount: 1 })).rejects.toThrow(/not found/);
    await expect(applyCrmUpdate(sys, { csql: csqlNumber })).rejects.toThrow(/Some fields/);
  });
});

describe("CSV import", () => {
  it("creates and updates by crm_id, and rejects bad rows with the line and reason", async () => {
    const good = { name: "Imported Co", domain: "imported.example", crm_id: "IMP-1", segment: "mid", csm_email: `csm@${w.org.slug}.test`, owner_email: `seller@${w.org.slug}.test`, plan: "Growth", seats: "20", credits: "25000", term_start: "2026-01-01", term_end: "2026-12-31", arr: "45,000", addons: "forecasting" };
    const res = await importAccounts(w.ctx("REVOPS"), "accounts.csv", [
      good,
      { ...good, crm_id: "IMP-2", domain: "imp2.example", segment: "galactic" },
      { ...good, crm_id: "IMP-3", domain: "imp3.example", csm_email: "nobody@x.test" },
      { ...good, crm_id: "IMP-4", domain: "imp4.example", term_end: "2025-01-01" },
      { ...good, crm_id: "", domain: "" },
    ]);
    expect(res.created).toBe(1);
    expect(res.errors.map((e) => e.row)).toEqual([3, 4, 5, 6]);
    expect(res.errors[0].reason).toContain('unknown segment "galactic"');
    const again = await importAccounts(w.ctx("REVOPS"), "accounts.csv", [{ ...good, seats: "25" }]);
    expect(again).toMatchObject({ created: 0, updated: 1 });
    const [a] = await w.db.select().from(schema.accounts).where(and(eq(schema.accounts.orgId, w.org.id), eq(schema.accounts.crmId, "IMP-1")));
    const [s] = await w.db.select().from(schema.subscriptions).where(eq(schema.subscriptions.accountId, a.id));
    expect(s).toMatchObject({ seatsPurchased: 25, arrMinor: 4_500_000, addons: ["forecasting"] });
    await expect(importAccounts(w.ctx("CSM"), "x.csv", [good])).rejects.toBeInstanceOf(DomainError);
  });
});

describe("rules", () => {
  it("versions every edit with a note, and previews without writing", async () => {
    const [seat] = await w.db.select().from(schema.signalRules).where(and(eq(schema.signalRules.orgId, w.org.id), eq(schema.signalRules.type, "SEAT_PRESSURE")));
    const before = await w.db.select().from(schema.signals).where(eq(schema.signals.orgId, w.org.id));
    const preview = await previewRule(w.ctx("REVOPS"), seat.id, { name: seat.name, params: { utilisationPct: 50, sustainDays: 3 }, weight: 10, cooldownDays: 30, enabled: true, segments: [] });
    expect(preview.count).toBeGreaterThan(0);
    expect(await w.db.select().from(schema.signals).where(eq(schema.signals.orgId, w.org.id))).toHaveLength(before.length);
    await expect(updateRule(w.ctx("REVOPS"), seat.id, seat.version, { name: seat.name, params: { utilisationPct: 95, sustainDays: 14 }, weight: 10, cooldownDays: 30, enabled: true, segments: [], note: "" })).rejects.toThrow(/Some fields/);
    await expect(updateRule(w.ctx("REVOPS"), seat.id, seat.version, { name: seat.name, params: { utilisationPct: 0, sustainDays: 14 }, weight: 10, cooldownDays: 30, enabled: true, segments: [], note: "Bad value" })).rejects.toThrow(/settings need attention/);
    await updateRule(w.ctx("REVOPS"), seat.id, seat.version, { name: seat.name, params: { utilisationPct: 95, sustainDays: 14 }, weight: 12, cooldownDays: 30, enabled: true, segments: [], note: "Too many contractor dismissals" });
    const d = await getRule(w.ctx("REVOPS"), seat.id);
    expect(d.rule.version).toBe(seat.version + 1);
    expect(d.versions[0]).toMatchObject({ version: seat.version + 1, note: "Too many contractor dismissals" });
    await expect(updateRule(w.ctx("REVOPS"), seat.id, seat.version, { name: seat.name, params: { utilisationPct: 90, sustainDays: 14 }, weight: 10, cooldownDays: 30, enabled: true, segments: [], note: "Stale tab" })).rejects.toThrow(/changed this rule/);
    await expect(updateRule(w.ctx("CSM"), seat.id, d.rule.version, {})).rejects.toBeInstanceOf(DomainError);
  });
});

describe("results and the weekly digest", () => {
  it("counts only recorded outcomes, never estimates", async () => {
    const r = await getResults(w.ctx("EXEC"), "all");
    // Estimates exist for every raised signal, but only the CSQL won through the CRM counts as won.
    expect(r.funnel.estimatedMinor).toBeGreaterThan(0);
    expect(r.funnel.wonMinor).toBe(1_200_000);
    expect(r.funnel.won).toBe(1);
  });

  it("sends one digest per person per week, and respects the opt-out", async () => {
    await w.db.update(schema.users).set({ preferences: { digest: false } }).where(eq(schema.users.id, w.people.EXEC.id));
    const first = await sendWeeklyDigests(w.ctx("ADMIN"));
    const again = await sendWeeklyDigests(w.ctx("ADMIN"));
    expect(first.sent).toBe(8); // 9 people, one opted out
    expect(again.sent).toBe(0);
    expect(sent.filter((to) => to.startsWith("exec@"))).toHaveLength(0);
  });
});
