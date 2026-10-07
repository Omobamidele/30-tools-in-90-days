import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "./client";
import { accounts, csqls, notifications, organizations, sellerQueues, signals, subscriptions, users } from "./schema";
import { orgConfigSchema, type RoleKey } from "@/config/schema";
import type { ServiceCtx } from "@/services/context";
import { ingestUsage } from "@/services/ingest";
import { runDetection } from "@/services/detection";
import { acceptSignal, dismissSignal, snoozeSignal } from "@/services/signals";
import { acceptCsql, closeNoOpp, loseCsql, recordOpportunity, returnCsql, winCsql } from "@/services/csqls";
import { setEmailSenderForTests } from "@/adapters/email";
import { addDays } from "@/core/dates";
import { localDate } from "@/core/business-time";
import { formatMoney } from "@/core/money";
import { DEMO_ACCOUNTS } from "@/demo/accounts";
import { createApiKey } from "@/services/keys";
import { mkdirSync, writeFileSync } from "node:fs";
import { rowFor, termOf, type AccountSpec } from "@/demo/model";

// Demo workspace for the fictional vendor "Fernway" (spec §1). Usage comes only from the
// simulated model, through the real ingest service. Three months of team work are then replayed
// through the real services with the clock set back, so every number on screen was produced by
// the same code that a customer would run.

export type SeededUser = { id: string; name: string; role: RoleKey; email: string; key: string };

const NOTES: Record<string, string> = {
  SEAT_PRESSURE: "They're at the seat limit and adding analysts every week. The controller asked me about adding seats on our last call.",
  USAGE_PACE: "Document volume is well ahead of their commitment. Worth moving them up a tier before overage invoices start.",
  NEW_TEAM: "A second team has started using the product on its own. Good moment to talk about a team rollout.",
  FEATURE_INTENT: "Several users keep opening the add-on. They asked support how to turn it on.",
  NEW_EXECUTIVE: "New finance leader joined and is already logging in. Worth an intro before renewal planning starts.",
};

export async function seedDemoWorkspace(db: Db, orgId: string, people: SeededUser[]) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const config = orgConfigSchema.parse(org.config);
  const byKey = (k: string) => people.find((p) => p.key === k)!;
  const ctxAs = (key: string, at: Date): ServiceCtx => {
    const u = byKey(key);
    return { db, now: () => at, actor: { userId: u.id, name: u.name, role: u.role, orgId, timezone: org.timezone, currency: org.currency, config } };
  };
  // The demo's "today" is the organisation's local date, not UTC (late evening in New York is already tomorrow in UTC).
  const anchor = localDate(new Date(), org.timezone);
  // Local 06:00 and 10:30 on day t relative to the anchor (New York, UTC−4/−5; close enough for a demo clock).
  const at = (t: number, hour = 10, min = 30) => new Date(`${addDays(anchor, t)}T${String(hour + 4).padStart(2, "0")}:${String(min).padStart(2, "0")}:00Z`);

  // Routing: segment round-robin queues for accounts without an owner.
  await db.insert(sellerQueues).values([
    { orgId, segment: "mid", name: "Mid-market", memberIds: [byKey("tomas").id, byKey("aisha").id] },
    { orgId, segment: "upper", name: "Upper mid-market", memberIds: [byKey("aisha").id] },
  ]);

  // Accounts and subscriptions (as a CRM import would create them).
  const priceOf = (s: AccountSpec) => {
    const pb = config.priceBook;
    const platform = s.plan === "Scale" ? 2_400_000 : 1_200_000;
    const tier = pb.creditTiers.find((t) => t.committed === s.credits)?.priceMinor ?? 0;
    const addons = s.addons.reduce((n, a) => n + (pb.addons.find((x) => x.key === a)?.priceMinor ?? 0), 0);
    return platform + s.seats * pb.seatPriceMinor + tier + addons;
  };
  const accountIds = new Map<string, string>();
  for (const s of DEMO_ACCOUNTS) {
    const [a] = await db
      .insert(accounts)
      .values({ orgId, name: s.name, domain: s.domain, crmId: s.crmId, segment: s.segment, industry: s.industry, csmId: byKey(s.csm).id, ownerId: s.owner ? byKey(s.owner).id : null })
      .returning();
    accountIds.set(s.crmId, a.id);
    const { termStart, termEnd } = termOf(s, anchor);
    await db.insert(subscriptions).values({ orgId, accountId: a.id, plan: s.plan, seatsPurchased: s.seats, creditsCommitted: s.credits, termStart, termEnd, arrMinor: priceOf(s), addons: s.addons });
  }

  // 91 days of simulated usage through the real ingest service.
  const rows = DEMO_ACCOUNTS.flatMap((s) => Array.from({ length: 91 }, (_, i) => rowFor(s, anchor, i - 90)).filter((r) => r !== null));
  const ing = await ingestUsage(db, { id: orgId, timezone: org.timezone }, rows, "SIMULATED", { now: at(0, 2) });
  if (ing.rejected.length) throw new Error(`Seed usage rejected: ${JSON.stringify(ing.rejected.slice(0, 3))}`);

  // Replay: weekly detection runs, with each account's story acted out by its CSM and seller.
  setEmailSenderForTests({ driver: "disabled", send: async () => ({ sent: false, reason: "seed" }) });
  type Ev = { at: Date; run: () => Promise<void> };
  const queue: Ev[] = [];
  const schedule = (e: Ev) => {
    queue.push(e);
    queue.sort((a, b) => a.at.getTime() - b.at.getTime());
  };
  const now = at(0, 9, 0);
  const handled = new Set<string>();
  const storyOf = new Map(DEMO_ACCOUNTS.map((s) => [accountIds.get(s.crmId)!, s]));

  const csqlOf = async (signalId: string) => {
    const [s] = await db.select({ csqlId: signals.csqlId }).from(signals).where(eq(signals.id, signalId));
    const [c] = await db.select().from(csqls).where(eq(csqls.id, s.csqlId!));
    return c;
  };
  const sellerKey = (c: typeof csqls.$inferSelect) => people.find((p) => p.id === c.ownerId)!.key;
  const roundTo = (m: number, step = 50_000) => Math.max(step, Math.round(m / step) * step);

  const act = async (signal: typeof signals.$inferSelect, t0: Date) => {
    const spec = storyOf.get(signal.accountId)!;
    const story = spec.story;
    const day = (n: number, h = 10) => new Date(t0.getTime() + n * 86_400_000 + (h - 6) * 3_600_000);
    const csm = spec.csm;
    const later = (n: number, h: number, run: () => Promise<void>) => {
      const when = day(n, h);
      if (when <= now) schedule({ at: when, run });
    };
    const fresh = async () => (await db.select().from(signals).where(eq(signals.id, signal.id)))[0];
    const accept = (n: number) =>
      later(n, 9, async () => {
        const s = await fresh();
        await acceptSignal(ctxAs(csm, day(n, 9)), s.id, s.lockVersion, { handoffNote: NOTES[s.type] });
      });
    const sellerStep = (n: number, h: number, f: (ctx: ServiceCtx, c: typeof csqls.$inferSelect) => Promise<unknown>) =>
      later(n, h, async () => {
        const c = await csqlOf(signal.id);
        await f(ctxAs(sellerKey(c), day(n, h)), c);
      });
    const opp = (n: number, factor: number) =>
      sellerStep(n, 14, (ctx, c) =>
        recordOpportunity(ctx, c.id, c.lockVersion, {
          amount: formatMoney(roundTo((c.adjustedValueMinor ?? c.estValueMinor ?? 1_200_000) * factor), "USD"),
          kind: signal.type === "USAGE_PACE" ? "USAGE_TIER" : signal.type === "FEATURE_INTENT" ? "ADDON" : "SEATS",
          crmRef: `OPP-${20000 + (c.number * 37) % 9000}`,
          expectedClose: addDays(anchor, 10),
        }),
      );
    switch (story.kind) {
      case "pending":
        return;
      case "snoozed":
        return later(1, 11, async () => {
          const s = await fresh();
          await snoozeSignal(ctxAs(csm, day(1, 11)), s.id, s.lockVersion, { until: addDays(anchor, Math.round((day(1).getTime() - now.getTime()) / 86_400_000) + story.days) });
        });
      case "dismissed":
        return later(1, 11, async () => {
          const s = await fresh();
          await dismissSignal(ctxAs(csm, day(1, 11)), s.id, s.lockVersion, { reason: story.reason, note: story.note ?? "" });
        });
      case "routed":
        return accept(1);
      case "accepted":
        accept(1);
        return sellerStep(2, 11, (ctx, c) => acceptCsql(ctx, c.id, c.lockVersion));
      case "returned":
        accept(1);
        return sellerStep(2, 15, (ctx, c) => returnCsql(ctx, c.id, c.lockVersion, { reason: story.reason, note: story.note }));
      case "noopp":
        accept(1);
        sellerStep(2, 11, (ctx, c) => acceptCsql(ctx, c.id, c.lockVersion));
        return sellerStep(5, 16, (ctx, c) => closeNoOpp(ctx, c.id, c.lockVersion, { reason: "Already working this deal", note: "Renewal conversation already covers seats." }));
      case "opportunity":
        accept(1);
        sellerStep(2, 11, (ctx, c) => acceptCsql(ctx, c.id, c.lockVersion));
        return opp(7, story.factor);
      case "lost":
        accept(1);
        sellerStep(2, 11, (ctx, c) => acceptCsql(ctx, c.id, c.lockVersion));
        opp(6, 1);
        return sellerStep(18, 15, (ctx, c) => loseCsql(ctx, c.id, c.lockVersion, { reason: story.reason }));
      case "won":
        accept(1);
        sellerStep(2, 11, (ctx, c) => acceptCsql(ctx, c.id, c.lockVersion));
        opp(6, story.factor);
        return sellerStep(20, 15, async (ctx, c) => {
          const amount = (c.opportunity as { amountMinor: number }).amountMinor;
          await winCsql(ctx, c.id, c.lockVersion, { amount: formatMoney(amount, "USD") });
          // The customer bought it: the subscription changes, so the signal's condition clears.
          const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, c.accountId));
          const pb = config.priceBook;
          const change =
            story.buy === "seats"
              ? { seatsPurchased: sub.seatsPurchased + Math.round(amount / pb.seatPriceMinor) }
              : story.buy === "credits"
                ? { creditsCommitted: pb.creditTiers.find((t) => t.committed > sub.creditsCommitted)?.committed ?? sub.creditsCommitted }
                : { addons: [...sub.addons, spec.feature!.addon] };
          await db.update(subscriptions).set({ ...change, arrMinor: sub.arrMinor + amount }).where(eq(subscriptions.id, sub.id));
        });
    }
  };

  for (let t = -84; t <= 0; t += 7) {
    const runAt = at(t, 6, 0);
    schedule({
      at: runAt,
      run: async () => {
        await runDetection(ctxAs("admin", runAt));
        const fresh = await db.select().from(signals).where(and(eq(signals.orgId, orgId), eq(signals.status, "NEW")));
        for (const s of fresh) {
          if (handled.has(s.id)) continue;
          handled.add(s.id);
          await act(s, runAt);
        }
      },
    });
  }
  while (queue.length) {
    const e = queue.shift()!;
    await e.run();
  }
  setEmailSenderForTests(undefined);

  // Notifications older than three days were read long ago; nothing was emailed during the replay.
  await db.update(notifications).set({ readAt: now, emailStatus: null }).where(and(eq(notifications.orgId, orgId), lt(notifications.createdAt, at(-3))));
  await db.update(notifications).set({ emailStatus: null }).where(eq(notifications.orgId, orgId));

  const counts = await db.select({ status: signals.status }).from(signals).where(eq(signals.orgId, orgId));
  const open = await db.select().from(csqls).where(and(eq(csqls.orgId, orgId), inArray(csqls.status, ["ROUTED", "ACCEPTED", "RETURNED", "OPPORTUNITY"])));
  const won = await db.select().from(csqls).where(and(eq(csqls.orgId, orgId), eq(csqls.status, "WON")));
  // A demo ingest key for npm run usage:simulate, kept in a local, gitignored file.
  const key = await createApiKey(ctxAs("admin", now), { kind: "INGEST", name: "Demo simulator" });
  mkdirSync(".demo", { recursive: true });
  writeFileSync(".demo/simulator.json", JSON.stringify({ anchor, key: key.token, appUrl: process.env.APP_URL ?? "http://localhost:3002" }, null, 2));

  console.log(
    `Demo: ${DEMO_ACCOUNTS.length} accounts, ${rows.length} days of simulated usage, ${counts.length} signals (${counts.filter((c) => c.status === "NEW").length} waiting), ${open.length} open CSQLs, ${won.length} won.`,
  );
  return { anchor };
}

export async function demoUsers(db: Db, orgId: string) {
  return db.select().from(users).where(eq(users.orgId, orgId));
}
