import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { accounts, contacts, csqls, signalRules, signals, subscriptions, usageSnapshots, users } from "@/db/schema";
import { ruleParamsSchemas, type RuleType } from "@/config/schema";
import { addDays, daysBetween } from "@/core/dates";
import { evaluateRule, isStale } from "@/core/rules/evaluate";
import type { Candidate, Contact, Snapshot, Subscription } from "@/core/rules/types";
import { estimateValue } from "@/core/value";
import { scorePriority } from "@/core/priority";
import { addBusinessDays, localDate } from "@/core/business-time";
import { OPEN_CSQL } from "@/core/workflow";
import { audit, type ServiceCtx } from "./context";
import { calendarOf, termsOf } from "./org";
import { notify } from "./notifications";

// Detection (spec FR-5–FR-11): pure rule functions decide *whether* a signal exists; this
// service decides what that means for stored state: create, refresh, attach to an open CSQL,
// respect a dismissal's cooldown, expire, or wake from a snooze.

const WINDOW_DAYS = 90;

export type DetectionSummary = { accounts: number; created: number; refreshed: number; attached: number; expired: number; woke: number; stale: number; cooledDown: number };

type RuleRow = typeof signalRules.$inferSelect;
type SignalRow = typeof signals.$inferSelect;

export async function runDetection(ctx: ServiceCtx, opts: { accountIds?: string[] } = {}): Promise<DetectionSummary> {
  const { db } = ctx;
  const orgId = ctx.actor.orgId;
  const cfg = ctx.actor.config;
  const now = ctx.now();
  const today = localDate(now, ctx.actor.timezone);
  const terms = termsOf(cfg);
  const cal = calendarOf(ctx);
  const summary: DetectionSummary = { accounts: 0, created: 0, refreshed: 0, attached: 0, expired: 0, woke: 0, stale: 0, cooledDown: 0 };

  const rules = (await db.select().from(signalRules).where(and(eq(signalRules.orgId, orgId), eq(signalRules.enabled, true)))) as RuleRow[];
  const accountFilter = opts.accountIds ? and(eq(accounts.orgId, orgId), inArray(accounts.id, opts.accountIds.length ? opts.accountIds : ["00000000-0000-0000-0000-000000000000"])) : eq(accounts.orgId, orgId);
  const accts = await db.select().from(accounts).where(and(accountFilter, eq(accounts.status, "ACTIVE")));
  if (!accts.length) return summary;
  const ids = accts.map((a) => a.id);

  const [subs, people, snaps, openSignals, resolved, openCsqls, leads] = await Promise.all([
    db.select().from(subscriptions).where(inArray(subscriptions.accountId, ids)),
    db.select().from(contacts).where(inArray(contacts.accountId, ids)),
    db.select().from(usageSnapshots).where(and(inArray(usageSnapshots.accountId, ids), gte(usageSnapshots.date, addDays(today, -WINDOW_DAYS)), lte(usageSnapshots.date, today))).orderBy(usageSnapshots.date),
    db.select().from(signals).where(and(inArray(signals.accountId, ids), inArray(signals.status, ["NEW", "SNOOZED"]))),
    // Most recent resolution per account and type: a dismissal, or a CSQL that closed.
    db
      .select({ accountId: signals.accountId, type: signals.type, status: signals.status, value: signals.estValueMinor, at: sql<Date>`coalesce(${csqls.closedAt}, ${signals.triagedAt})`, csqlStatus: csqls.status, csqlId: signals.csqlId })
      .from(signals)
      .leftJoin(csqls, eq(signals.csqlId, csqls.id))
      .where(and(inArray(signals.accountId, ids), inArray(signals.status, ["DISMISSED", "ACCEPTED"]), isNotNull(signals.triagedAt))),
    db.select().from(csqls).where(and(eq(csqls.orgId, orgId), inArray(csqls.accountId, ids), inArray(csqls.status, OPEN_CSQL))),
    db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.role, "CS_LEAD"), eq(users.status, "ACTIVE"))),
  ]);

  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    return m;
  };
  const subBy = new Map(subs.map((s) => [s.accountId, s]));
  const contactsBy = group(people, (c) => c.accountId);
  const snapsBy = group(snaps, (s) => s.accountId);
  const openBy = group(openSignals, (s) => `${s.accountId}:${s.type}`);
  const csqlBy = new Map(openCsqls.map((c) => [c.accountId, c]));
  const resolvedBy = group(resolved, (r) => `${r.accountId}:${r.type}`);

  for (const acct of accts) {
    summary.accounts++;
    const window: Snapshot[] = (snapsBy.get(acct.id) ?? []).map((s) => ({
      date: s.date,
      activeSeats: s.activeSeats,
      creditsUsedTerm: s.creditsUsedTerm,
      workspaces: s.workspaces as Snapshot["workspaces"],
      gatedAttempts: s.gatedAttempts as Record<string, number>,
      openEscalations: s.openEscalations,
    }));
    const latest = window[window.length - 1] ?? null;
    const subRow = subBy.get(acct.id);

    // Snoozes wake on their date regardless of data freshness (spec A7).
    for (const s of openSignals.filter((x) => x.accountId === acct.id && x.status === "SNOOZED" && x.snoozeUntil && x.snoozeUntil <= today)) {
      await db
        .update(signals)
        .set({ status: "NEW", snoozeUntil: null, triageDueAt: addBusinessDays(now, cfg.deadlines.triageBusinessDays, cal), lockVersion: s.lockVersion + 1 })
        .where(eq(signals.id, s.id));
      await audit(db, ctx, { entityType: "signal", entityId: s.id, accountId: acct.id, action: "woke", summary: "Snooze ended; back in the queue", actorType: "SYSTEM", actorLabel: "System" });
      const to = s.assigneeId ?? acct.csmId;
      if (to) await notify(db, ctx, { userId: to, kind: "signal", title: `Snooze ended: ${acct.name}`, body: s.explanation, link: `/signals/${s.id}`, dedupeKey: `wake:${s.id}:${today}` });
      s.status = "NEW";
      summary.woke++;
    }

    // Stale data: no new signals and no expiry on missing data alone (spec FR-4, edge case 13).
    if (isStale(latest?.date ?? null, today, cfg.detection.staleAfterDays)) {
      summary.stale++;
      continue;
    }
    if (!subRow) continue;
    const sub: Subscription = {
      plan: subRow.plan,
      seatsPurchased: subRow.seatsPurchased,
      creditsCommitted: subRow.creditsCommitted,
      termStart: subRow.termStart,
      termEnd: subRow.termEnd,
      arrMinor: subRow.arrMinor,
      addons: subRow.addons,
    };
    const accountContacts: Contact[] = (contactsBy.get(acct.id) ?? []).map((c) => ({ id: c.id, name: c.name, title: c.title, seniority: c.seniority, firstSeenOn: c.firstSeenOn }));
    const renewalInDays = daysBetween(today, sub.termEnd);

    for (const rule of rules) {
      if (rule.segments.length && !rule.segments.includes(acct.segment ?? "")) continue;
      if (sub.arrMinor < rule.minArrMinor) continue;
      const params = ruleParamsSchemas[rule.type as RuleType].safeParse(rule.params);
      if (!params.success) continue;
      const candidate = evaluateRule(rule.type as RuleType, { window, subscription: sub, contacts: accountContacts, params: params.data as never, today, terms });
      const existing = (openBy.get(`${acct.id}:${rule.type}`) ?? [])[0] as SignalRow | undefined;

      if (existing) {
        if (candidate) {
          await refresh(existing.id, candidate, rule, latest!.openEscalations, renewalInDays);
          summary.refreshed++;
        } else if (existing.status === "NEW" && daysBetween(existing.conditionLastTrueOn, today) >= cfg.detection.expireAfterDays) {
          await db.update(signals).set({ status: "EXPIRED", lastEvaluatedAt: now, lockVersion: existing.lockVersion + 1 }).where(eq(signals.id, existing.id));
          await audit(db, ctx, {
            entityType: "signal",
            entityId: existing.id,
            accountId: acct.id,
            action: "expired",
            summary: `Expired: the condition hasn't held since ${existing.conditionLastTrueOn}`,
            actorType: "SYSTEM",
            actorLabel: "System",
          });
          summary.expired++;
        }
        continue;
      }
      if (!candidate) continue;

      const estimate = estimateValue(candidate.valueInputs, cfg.priceBook, terms);
      const openCsql = csqlBy.get(acct.id);

      // Cooldown after a dismissal or a closed CSQL, unless the value grew materially (FR-9).
      const last = (resolvedBy.get(`${acct.id}:${rule.type}`) ?? [])
        .filter((r) => r.status === "DISMISSED" || (r.csqlStatus && !OPEN_CSQL.includes(r.csqlStatus)))
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
      if (last && (now.getTime() - new Date(last.at).getTime()) / 86_400_000 < rule.cooldownDays) {
        // A material change can outdate a CSM's dismissal reason. A closed CSQL means a seller just
        // had the conversation with the customer, so it always gets the full cooldown.
        const grew =
          last.status === "DISMISSED" && last.value !== null && estimate.valueMinor !== null && estimate.valueMinor > last.value * (1 + cfg.detection.materialChangePct / 100);
        if (!grew) {
          summary.cooledDown++;
          continue;
        }
      }

      // An open CSQL on the account takes the new evidence instead of a new signal (FR-8).
      const alreadyOnCsql = openCsql && (resolvedBy.get(`${acct.id}:${rule.type}`) ?? []).some((r) => r.csqlId === openCsql.id);
      if (openCsql && alreadyOnCsql) continue;

      const priority = scorePriority({
        valueMinor: estimate.valueMinor,
        currency: cfg.priceBook.currency,
        ruleWeight: rule.weight,
        renewalInDays,
        renewalBoostDays: cfg.detection.renewalBoostDays,
        openEscalations: latest!.openEscalations,
      });
      const [created] = await db
        .insert(signals)
        .values({
          orgId,
          accountId: acct.id,
          ruleId: rule.id,
          ruleVersion: rule.version,
          type: rule.type,
          status: openCsql ? "ACCEPTED" : "NEW",
          detectedAt: now,
          lastEvaluatedAt: now,
          conditionLastTrueOn: today,
          explanation: candidate.explanation,
          evidence: { ...candidate.evidence, params: params.data },
          trace: candidate.trace,
          valueKind: estimate.kind,
          estValueMinor: estimate.valueMinor,
          valueWorking: estimate.working,
          priority: priority.score,
          priorityLines: priority.lines,
          triageDueAt: addBusinessDays(now, cfg.deadlines.triageBusinessDays, cal),
          csqlId: openCsql?.id ?? null,
          triagedAt: openCsql ? now : null,
        })
        .returning();
      if (openCsql) {
        await audit(db, ctx, {
          entityType: "csql",
          entityId: openCsql.id,
          accountId: acct.id,
          action: "evidence_added",
          summary: `New evidence added automatically: ${candidate.explanation}`,
          actorType: "SYSTEM",
          actorLabel: "System",
        });
        if (openCsql.ownerId) await notify(db, ctx, { userId: openCsql.ownerId, kind: "signal", title: `New evidence on CSQL-${openCsql.number}: ${acct.name}`, body: candidate.explanation, link: `/csqls/${openCsql.id}`, dedupeKey: `attach:${created.id}` });
        summary.attached++;
        continue;
      }
      await audit(db, ctx, { entityType: "signal", entityId: created.id, accountId: acct.id, action: "detected", summary: `Detected: ${candidate.explanation}`, actorType: "SYSTEM", actorLabel: "System" });
      // High-priority signals notify now (A2); the rest wait in the queue and the digest.
      if (priority.score >= cfg.detection.highPriorityScore) {
        const recipients = acct.csmId ? [acct.csmId] : leads.map((l) => l.id);
        for (const to of recipients) await notify(db, ctx, { userId: to, kind: "signal", title: `High-priority signal: ${acct.name}`, body: candidate.explanation, link: `/signals/${created.id}`, dedupeKey: `signal:${created.id}` });
      }
      summary.created++;
    }
  }
  return summary;

  async function refresh(id: string, c: Candidate, rule: RuleRow, escalations: number, renewalInDays: number) {
    const estimate = estimateValue(c.valueInputs, cfg.priceBook, terms);
    const priority = scorePriority({ valueMinor: estimate.valueMinor, currency: cfg.priceBook.currency, ruleWeight: rule.weight, renewalInDays, renewalBoostDays: cfg.detection.renewalBoostDays, openEscalations: escalations });
    await db
      .update(signals)
      .set({
        explanation: c.explanation,
        evidence: { ...c.evidence, params: rule.params },
        trace: c.trace,
        valueKind: estimate.kind,
        estValueMinor: estimate.valueMinor,
        valueWorking: estimate.working,
        priority: priority.score,
        priorityLines: priority.lines,
        ruleVersion: rule.version,
        lastEvaluatedAt: now,
        conditionLastTrueOn: today,
      })
      .where(eq(signals.id, id));
  }
}
