import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  activityLog,
  approvalTokens,
  changeLines,
  changeRequests,
  clients,
  contracts,
  eventMembers,
  events,
  obligations,
  suppliers,
  tasks,
  users,
} from "@/db/schema";
import { attendanceDeltaPct, computeEventExposure, diffExposure } from "@/core/exposure/event";
import { changeTotals, internalApprovalReason, suggestPrice } from "@/core/pricing/price";
import { nextStatus, type ChangeAction, type ChangeStatus } from "@/core/changes/state";
import { parseMoney } from "@/core/money";
import { daysBetween, localDateOf } from "@/core/time";
import { canApproveInternally, can, restrictedToOwnEvents } from "@/auth/policy";
import { emailSender, renderEmail } from "@/adapters/email";
import { env } from "@/env";
import { audit, type DbLike, type ServiceCtx } from "./context";
import { conflict, forbidden, invalidState, notFound, parseInput, validation } from "./errors";
import { authorizeEvent, eventScope } from "./events";
import { loadExposureContext, snapshotEventExposure } from "./exposure";
import { orgRef, type OrgRef } from "./alerts";
import { notify, usersWithRoles } from "./notifications";

export const CHANGE_TYPES = ["HEADCOUNT", "ADD_FUNCTION", "REMOVE_FUNCTION", "UPGRADE", "CANCEL_ELEMENT", "OTHER"] as const;
export const changeTypeLabels: Record<(typeof CHANGE_TYPES)[number], string> = {
  HEADCOUNT: "Headcount change",
  ADD_FUNCTION: "Add a function",
  REMOVE_FUNCTION: "Remove a function",
  UPGRADE: "Upgrade",
  CANCEL_ELEMENT: "Cancel an element",
  OTHER: "Other",
};

const moneyText = z.string().trim().refine((s) => s === "" || parseMoney(s) !== null, "Enter an amount like -1,080.00");

export const changeInput = z.object({
  title: z.string().trim().min(1, "Give the change a short title").max(200),
  type: z.enum(CHANGE_TYPES),
  reason: z.string().trim().max(4000).optional().default(""),
  attendanceDelta: z.coerce.number().int("Whole attendees only").default(0),
  requestedByType: z.enum(["INTERNAL", "CLIENT"]).default("INTERNAL"),
  lines: z
    .array(
      z.object({
        contractId: z.union([z.literal(""), z.uuid()]).optional().default(""),
        category: z.string().trim().min(1, "Choose a category"),
        description: z.string().trim().min(1, "Describe the line"),
        costDelta: moneyText.refine((s) => s !== "", "Enter the cost change"),
        priceDelta: moneyText.optional().default(""),
      }),
    )
    .default([]),
});
export type ChangeDraft = z.infer<typeof changeInput>;

// ---------------------------------------------------------------------------
// Impact (used live by the editor and frozen on submission)
// ---------------------------------------------------------------------------

export type ChangeImpact = {
  totals: ReturnType<typeof changeTotals>;
  approvalReason: string | null;
  attendance: { before: number; after: number; deltaPct: number };
  exposure: {
    currency: string;
    currentBefore: number;
    currentAfter: number;
    agencyDelta: number;
    clientDelta: number;
    unassignedDelta: number;
    lines: ReturnType<typeof diffExposure>;
    complete: boolean;
  };
  warnings: string[];
  lines: Array<{ category: string; description: string; contractId: string | null; costDeltaMinor: number; priceDeltaMinor: number; suggested: boolean }>;
};

function pricedLines(ctx: ServiceCtx, draft: ChangeDraft) {
  return draft.lines.map((l) => {
    const cost = parseMoney(l.costDelta) ?? 0;
    const explicit = l.priceDelta ? parseMoney(l.priceDelta) : null;
    return {
      category: l.category,
      description: l.description,
      contractId: l.contractId || null,
      costDeltaMinor: cost,
      priceDeltaMinor: explicit ?? suggestPrice(ctx.actor.config.pricing, l.category, cost),
      suggested: explicit === null,
    };
  });
}

export async function computeChangeImpact(ctx: ServiceCtx, eventId: string, draft: ChangeDraft): Promise<ChangeImpact> {
  const ec = await loadExposureContext(ctx.db, ctx.actor.orgId, eventId, ctx.now());
  const lines = pricedLines(ctx, draft);
  const totals = changeTotals(lines);
  const before = ec.event.forecastAttendance;
  const after = Math.max(0, before + draft.attendanceDelta);
  const pct = attendanceDeltaPct(before, after - before);
  const exBefore = computeEventExposure(ec.input);
  // The scenario factor scales pickup and per-head F&B from the current forecast; the attendance
  // itself must not also be changed here, or the reduction is counted twice.
  const exAfter = computeEventExposure({ ...ec.input, scenario: pct ? { attendanceDeltaPct: pct } : undefined });

  // Deadlines this change runs into (spec edge case 14).
  const affected = new Set(lines.map((l) => l.contractId).filter(Boolean) as string[]);
  const warnWindow = ctx.actor.config.rules.cutoffWarningDays;
  const ob = await ctx.db
    .select({ o: obligations, supplier: suppliers.name })
    .from(obligations)
    .innerJoin(contracts, eq(contracts.id, obligations.contractId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(obligations.eventId, eventId), inArray(obligations.kind, ["CUTOFF", "GUARANTEE", "REVIEW"])));
  const warnings: string[] = [];
  const today = localDateOf(ctx.now(), ec.event.timezone);
  for (const { o, supplier } of ob) {
    const relevant = affected.has(o.contractId) || draft.attendanceDelta !== 0;
    if (!relevant) continue;
    const days = daysBetween(today, localDateOf(o.dueAt, ec.event.timezone));
    if (o.dueAt < ctx.now()) warnings.push(`${o.label} for ${supplier} has already passed: the supplier may not accept this change on the original terms.`);
    else if (o.status === "OPEN" && days <= warnWindow) warnings.push(`${o.label} for ${supplier} is in ${days} day${days === 1 ? "" : "s"}. Act before it passes.`);
  }

  return {
    totals,
    approvalReason: lines.length || draft.attendanceDelta ? internalApprovalReason(totals, ctx.actor.config.rules) : null,
    attendance: { before, after, deltaPct: pct },
    exposure: {
      currency: ec.event.baseCurrency,
      currentBefore: exBefore.current.totalMinor,
      currentAfter: exAfter.current.totalMinor,
      agencyDelta: exAfter.current.agencyMinor - exBefore.current.agencyMinor,
      clientDelta: exAfter.current.clientMinor - exBefore.current.clientMinor,
      unassignedDelta: exAfter.current.unassignedMinor - exBefore.current.unassignedMinor,
      lines: diffExposure(exBefore, exAfter).filter((d) => d.kind !== "CANCELLATION"),
      complete: exBefore.complete && exAfter.complete,
    },
    warnings,
    lines,
  };
}

export async function previewChangeImpact(ctx: ServiceCtx, eventId: string, raw: unknown) {
  await authorizeEvent(ctx, eventId, "change.raise");
  return computeChangeImpact(ctx, eventId, parseInput(changeInput, raw));
}

// ---------------------------------------------------------------------------
// Create, edit, lifecycle
// ---------------------------------------------------------------------------

async function loadChange(db: DbLike, orgId: string, id: string) {
  const [row] = await db
    .select({ cr: changeRequests, event: events, clientName: clients.name, creatorName: users.name })
    .from(changeRequests)
    .innerJoin(events, eq(events.id, changeRequests.eventId))
    .innerJoin(clients, eq(clients.id, events.clientId))
    .innerJoin(users, eq(users.id, changeRequests.createdBy))
    .where(and(eq(changeRequests.id, id), eq(changeRequests.orgId, orgId)));
  if (!row) throw notFound("Change request");
  return row;
}

async function writeLines(tx: DbLike, ctx: ServiceCtx, changeRequestId: string, eventId: string, draft: ChangeDraft) {
  const lines = pricedLines(ctx, draft);
  const contractIds = lines.map((l) => l.contractId).filter(Boolean) as string[];
  if (contractIds.length) {
    const found = await tx.select({ id: contracts.id }).from(contracts).where(and(inArray(contracts.id, contractIds), eq(contracts.eventId, eventId)));
    if (found.length !== new Set(contractIds).size) throw validation("A line refers to a contract that isn't on this event.");
  }
  await tx.delete(changeLines).where(eq(changeLines.changeRequestId, changeRequestId));
  if (lines.length) {
    await tx.insert(changeLines).values(
      lines.map((l, i) => ({
        orgId: ctx.actor.orgId,
        changeRequestId,
        contractId: l.contractId,
        category: l.category,
        description: l.description,
        costDeltaMinor: l.costDeltaMinor,
        priceDeltaMinor: l.priceDeltaMinor,
        position: i,
      })),
    );
  }
}

export async function createChange(ctx: ServiceCtx, eventId: string, raw: unknown) {
  await authorizeEvent(ctx, eventId, "change.raise");
  const draft = parseInput(changeInput, raw);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await ctx.db.transaction(async (tx) => {
        const [{ n }] = await tx.select({ n: max(changeRequests.number) }).from(changeRequests).where(eq(changeRequests.orgId, ctx.actor.orgId));
        const [row] = await tx
          .insert(changeRequests)
          .values({
            orgId: ctx.actor.orgId,
            eventId,
            number: (n ?? 0) + 1,
            title: draft.title,
            type: draft.type,
            reason: draft.reason || null,
            attendanceDelta: draft.attendanceDelta,
            requestedByType: draft.requestedByType,
            createdBy: ctx.actor.userId,
          })
          .returning();
        await writeLines(tx, ctx, row.id, eventId, draft);
        await audit(tx, ctx, { entityType: "change_request", entityId: row.id, eventId, action: "created", summary: `Raised CR-${row.number}: ${row.title}` });
        return row;
      });
    } catch (e) {
      // Two changes numbered at the same moment: retry with the next number.
      if (attempt < 2 && e instanceof Error && /change_requests_number_idx|duplicate key/.test(`${e.message} ${(e as { cause?: Error }).cause?.message ?? ""}`)) continue;
      throw e;
    }
  }
  throw conflict("Couldn't number this change request. Try again.");
}

export async function updateChange(ctx: ServiceCtx, id: string, raw: unknown, lockVersion: number) {
  const { cr } = await loadChange(ctx.db, ctx.actor.orgId, id);
  await authorizeEvent(ctx, cr.eventId, "change.raise");
  if (cr.status !== "DRAFT") throw invalidState("Only draft change requests can be edited.");
  const draft = parseInput(changeInput, raw);
  await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(changeRequests)
      .set({
        title: draft.title,
        type: draft.type,
        reason: draft.reason || null,
        attendanceDelta: draft.attendanceDelta,
        requestedByType: draft.requestedByType,
        lockVersion: sql`${changeRequests.lockVersion} + 1`,
      })
      .where(and(eq(changeRequests.id, id), eq(changeRequests.lockVersion, lockVersion)))
      .returning();
    if (!updated.length) throw conflict("This change request was edited by someone else. Reload to see their changes.");
    await writeLines(tx, ctx, id, cr.eventId, draft);
    await audit(tx, ctx, { entityType: "change_request", entityId: id, eventId: cr.eventId, action: "updated", summary: `Edited CR-${cr.number}` });
  });
}

function transition(status: ChangeStatus, action: ChangeAction, required: boolean) {
  const next = nextStatus(status, action, { internalApprovalRequired: required });
  if (!next) throw invalidState("This change request can't do that from its current status.");
  return next;
}

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export type LinkResult = { url: string; expiresAt: Date; emailed: boolean };

/** Issues a single-use client approval link and emails it when email is set up. */
async function issueLink(tx: DbLike, ctx: ServiceCtx, cr: typeof changeRequests.$inferSelect, eventName: string, recipientEmail: string): Promise<LinkResult> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(ctx.now().getTime() + ctx.actor.config.rules.approvalLinkExpiryDays * 86_400_000);
  await tx
    .update(approvalTokens)
    .set({ revokedAt: ctx.now() })
    .where(and(eq(approvalTokens.changeRequestId, cr.id), isNull(approvalTokens.usedAt), isNull(approvalTokens.revokedAt)));
  await tx.insert(approvalTokens).values({
    orgId: ctx.actor.orgId,
    changeRequestId: cr.id,
    tokenHash: hash(token),
    recipientEmail,
    expiresAt,
    createdBy: ctx.actor.userId,
  });
  const url = `${env().APP_URL}/approve/${token}`;
  const sender = emailSender();
  let emailed = false;
  if (sender.driver !== "disabled") {
    const cfg = ctx.actor.config;
    const { text, html } = renderEmail({
      productName: cfg.email.senderName,
      brandColor: cfg.brand.primaryColor,
      heading: `Please review change request CR-${cr.number}`,
      lines: [`${eventName}: ${cr.title}`, `The link can be used once and expires ${expiresAt.toUTCString().slice(0, 16)}.`],
      action: { label: "Review the change", url },
      footer: `Sent by ${cfg.email.senderName}`,
    });
    const res = await sender.send({ to: recipientEmail, subject: `Change request CR-${cr.number}: ${cr.title}`, text, html, fromName: cfg.email.senderName, replyTo: cfg.email.replyTo });
    emailed = res.sent;
  }
  return { url, expiresAt, emailed };
}

export const submitInput = z.object({ recipientEmail: z.email("Enter the client approver's email") });

/** Submits a draft: freezes the impact, routes to internal review or straight to the client. */
export async function submitChange(ctx: ServiceCtx, id: string, raw: unknown) {
  const { cr, event } = await loadChange(ctx.db, ctx.actor.orgId, id);
  await authorizeEvent(ctx, cr.eventId, "change.raise");
  const { recipientEmail } = parseInput(submitInput, raw);
  const lines = await ctx.db.select().from(changeLines).where(eq(changeLines.changeRequestId, id)).orderBy(asc(changeLines.position));
  if (!lines.length && cr.attendanceDelta === 0) throw validation("Add at least one cost line or an attendance change before submitting.");
  const impact = await computeChangeImpact(ctx, cr.eventId, {
    title: cr.title,
    type: cr.type,
    reason: cr.reason ?? "",
    attendanceDelta: cr.attendanceDelta,
    requestedByType: cr.requestedByType,
    lines: lines.map((l) => ({ contractId: l.contractId ?? "", category: l.category, description: l.description, costDelta: (l.costDeltaMinor / 100).toFixed(2), priceDelta: (l.priceDeltaMinor / 100).toFixed(2) })),
  });
  const required = impact.approvalReason !== null;
  const next = transition(cr.status, "SUBMIT", required);
  let link = null as LinkResult | null;
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(changeRequests)
      .set({ status: next, submittedAt: ctx.now(), internalApprovalRequired: required, internalApprovalReason: impact.approvalReason, impact: { ...impact, recipientEmail } })
      .where(eq(changeRequests.id, id));
    if (next === "SENT_TO_CLIENT") link = await issueLink(tx, ctx, cr, event.name, recipientEmail);
    await audit(tx, ctx, {
      entityType: "change_request",
      entityId: id,
      eventId: cr.eventId,
      action: "submitted",
      summary: required ? `Submitted CR-${cr.number} for internal approval (${impact.approvalReason})` : `Sent CR-${cr.number} to ${recipientEmail} for approval`,
    });
  });
  if (required) {
    const approvers = (await usersWithRoles(ctx.db, ctx.actor.orgId, ctx.actor.config.rules.internalApproverRoles)).filter((u) => u !== ctx.actor.userId);
    await notify(ctx.db, await orgRef(ctx.db, ctx.actor.orgId), approvers, {
      kind: "approval",
      title: `CR-${cr.number} needs your approval`,
      body: `${event.name}: ${cr.title}. ${impact.approvalReason}.`,
      link: `/changes/${id}`,
      dedupeKey: `cr-review:${id}:${ctx.now().getTime()}`,
    });
  }
  return { status: next, link };
}

export async function approveInternally(ctx: ServiceCtx, id: string, note: string) {
  const { cr, event } = await loadChange(ctx.db, ctx.actor.orgId, id);
  await authorizeEvent(ctx, cr.eventId, "event.view");
  if (!canApproveInternally({ ...ctx.actor, internalApproverRoles: ctx.actor.config.rules.internalApproverRoles })) {
    throw forbidden("Only approvers can approve change requests internally.");
  }
  if (cr.createdBy === ctx.actor.userId) throw forbidden("Someone other than the person who raised it must approve this change.");
  const next = transition(cr.status, "APPROVE_INTERNAL", true);
  const recipient = (cr.impact as { recipientEmail?: string } | null)?.recipientEmail;
  if (!recipient) throw invalidState("This change has no client approver email. Send it back to the owner.");
  let link = null as LinkResult | null;
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(changeRequests)
      .set({ status: next, internalApprovedBy: ctx.actor.userId, internalApprovedAt: ctx.now(), internalNote: note.trim() || null })
      .where(eq(changeRequests.id, id));
    link = await issueLink(tx, ctx, cr, event.name, recipient);
    await audit(tx, ctx, {
      entityType: "change_request",
      entityId: id,
      eventId: cr.eventId,
      action: "approved_internally",
      summary: `Approved CR-${cr.number} internally and sent it to ${recipient}${note.trim() ? `. ${note.trim()}` : ""}`,
    });
  });
  await notify(ctx.db, await orgRef(ctx.db, ctx.actor.orgId), [cr.createdBy], {
    kind: "change",
    title: `CR-${cr.number} approved internally and sent to the client`,
    body: `${event.name}: ${cr.title}`,
    link: `/changes/${id}`,
    dedupeKey: `cr-approved-int:${id}`,
  });
  return { link };
}

export async function sendBack(ctx: ServiceCtx, id: string, note: string) {
  const { cr, event } = await loadChange(ctx.db, ctx.actor.orgId, id);
  if (!canApproveInternally({ ...ctx.actor, internalApproverRoles: ctx.actor.config.rules.internalApproverRoles })) throw forbidden();
  if (!note.trim()) throw validation("Say what needs to change.", { note: "Required" });
  const next = transition(cr.status, "SEND_BACK", true);
  await ctx.db.transaction(async (tx) => {
    await tx.update(changeRequests).set({ status: next, internalNote: note.trim() }).where(eq(changeRequests.id, id));
    await audit(tx, ctx, { entityType: "change_request", entityId: id, eventId: cr.eventId, action: "sent_back", summary: `Sent CR-${cr.number} back: ${note.trim()}` });
  });
  await notify(ctx.db, await orgRef(ctx.db, ctx.actor.orgId), [cr.createdBy], {
    kind: "change",
    title: `CR-${cr.number} was sent back`,
    body: `${event.name}: ${note.trim()}`,
    link: `/changes/${id}`,
    dedupeKey: `cr-sentback:${id}:${ctx.now().getTime()}`,
  });
}

export async function withdrawChange(ctx: ServiceCtx, id: string) {
  const { cr } = await loadChange(ctx.db, ctx.actor.orgId, id);
  await authorizeEvent(ctx, cr.eventId, "change.raise");
  const next = transition(cr.status, "WITHDRAW", false);
  await ctx.db.transaction(async (tx) => {
    await tx.update(changeRequests).set({ status: next }).where(eq(changeRequests.id, id));
    await tx.update(approvalTokens).set({ revokedAt: ctx.now() }).where(and(eq(approvalTokens.changeRequestId, id), isNull(approvalTokens.usedAt)));
    await audit(tx, ctx, { entityType: "change_request", entityId: id, eventId: cr.eventId, action: "withdrawn", summary: `Withdrew CR-${cr.number}` });
  });
}

/** New link for an expired or unanswered change (the previous link stops working). */
export async function reissueLink(ctx: ServiceCtx, id: string, raw: unknown) {
  const { cr, event } = await loadChange(ctx.db, ctx.actor.orgId, id);
  await authorizeEvent(ctx, cr.eventId, "change.raise");
  if (cr.status !== "EXPIRED" && cr.status !== "SENT_TO_CLIENT") throw invalidState("A new link can only be sent while waiting for the client.");
  const { recipientEmail } = parseInput(submitInput, raw);
  let link = null as LinkResult | null;
  await ctx.db.transaction(async (tx) => {
    if (cr.status === "EXPIRED") await tx.update(changeRequests).set({ status: transition(cr.status, "REISSUE", false) }).where(eq(changeRequests.id, id));
    link = await issueLink(tx, ctx, cr, event.name, recipientEmail);
    await audit(tx, ctx, { entityType: "change_request", entityId: id, eventId: cr.eventId, action: "link_reissued", summary: `Sent a new approval link for CR-${cr.number} to ${recipientEmail}` });
  });
  return { link };
}

// ---------------------------------------------------------------------------
// Client approval (public, token-gated)
// ---------------------------------------------------------------------------

export type ApprovalView =
  | { state: "invalid" }
  | { state: "expired" | "used" | "open"; view: Awaited<ReturnType<typeof approvalViewModel>> };

async function approvalViewModel(db: DbLike, token: typeof approvalTokens.$inferSelect) {
  const { cr, event, clientName } = await loadChange(db, token.orgId, token.changeRequestId);
  const org = await orgRef(db, token.orgId);
  const lines = await db.select().from(changeLines).where(eq(changeLines.changeRequestId, cr.id)).orderBy(asc(changeLines.position));
  const impact = (cr.impact ?? null) as ChangeImpact | null;
  return {
    agencyName: org.config.email.senderName,
    brandColor: org.config.brand.primaryColor,
    number: cr.number,
    title: cr.title,
    reason: cr.reason,
    eventName: event.name,
    clientName,
    currency: event.baseCurrency,
    attendanceDelta: cr.attendanceDelta,
    lines: lines.map((l) => ({ description: l.description, priceDeltaMinor: l.priceDeltaMinor })),
    priceDeltaMinor: lines.reduce((s, l) => s + l.priceDeltaMinor, 0),
    clientExposureDeltaMinor: impact?.exposure.clientDelta ?? 0,
    exposureCurrency: impact?.exposure.currency ?? event.baseCurrency,
    expiresAt: token.expiresAt.toISOString(),
    outcome: token.outcome,
    approverName: token.approverName,
    decidedAt: token.usedAt?.toISOString() ?? null,
    status: cr.status,
  };
}

export async function getApproval(db: DbLike, token: string, now: Date): Promise<ApprovalView> {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(token)) return { state: "invalid" };
  const [t] = await db.select().from(approvalTokens).where(eq(approvalTokens.tokenHash, hash(token)));
  if (!t) return { state: "invalid" };
  const view = await approvalViewModel(db, t);
  if (t.usedAt) return { state: "used", view };
  if (t.revokedAt || t.expiresAt < now || view.status !== "SENT_TO_CLIENT") return { state: "expired", view };
  return { state: "open", view };
}

export const approvalResponseInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  approverName: z.string().trim().min(2, "Enter your name").max(120),
  comment: z.string().trim().max(2000).optional().default(""),
});

/** Records the client's decision; an approval is applied immediately. */
export async function respondToApproval(db: DbLike, token: string, raw: unknown, meta: { ip: string | null; userAgent: string | null }, now: Date) {
  const input = parseInput(approvalResponseInput, raw);
  const [t] = await db.select().from(approvalTokens).where(eq(approvalTokens.tokenHash, hash(token)));
  if (!t) throw notFound("Approval link");
  if (t.usedAt) throw invalidState("This link has already been used.");
  if (t.revokedAt || t.expiresAt < now) throw invalidState("This approval link has expired. The agency has been told and can send a new one.");
  const { cr, event } = await loadChange(db, t.orgId, t.changeRequestId);
  const next = nextStatus(cr.status, input.decision === "APPROVE" ? "CLIENT_APPROVE" : "CLIENT_REJECT", { internalApprovalRequired: false });
  if (!next) throw invalidState("This change is no longer waiting for a decision.");
  const org = await orgRef(db, t.orgId);

  // Single use, enforced in the database: only one request can claim the token.
  const claimed = await db
    .update(approvalTokens)
    .set({ usedAt: now, outcome: input.decision, approverName: input.approverName, comment: input.comment || null, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null })
    .where(and(eq(approvalTokens.id, t.id), isNull(approvalTokens.usedAt)))
    .returning();
  if (!claimed.length) throw invalidState("This link has already been used.");

  await db.update(changeRequests).set({ status: next, clientDecidedAt: now }).where(eq(changeRequests.id, cr.id));
  await db.insert(activityLog).values({
    orgId: t.orgId,
    actorType: "CLIENT",
    actorLabel: `${input.approverName} (${t.recipientEmail})`,
    entityType: "change_request",
    entityId: cr.id,
    eventId: cr.eventId,
    action: input.decision === "APPROVE" ? "client_approved" : "client_rejected",
    summary: `${input.decision === "APPROVE" ? "Approved" : "Rejected"} CR-${cr.number}${input.comment ? `: “${input.comment}”` : ""}`,
    at: now,
  });
  await notify(db, org, [event.ownerId, cr.createdBy], {
    kind: "change",
    title: `Client ${input.decision === "APPROVE" ? "approved" : "rejected"} CR-${cr.number}`,
    body: `${event.name}: ${cr.title}${input.comment ? `\n“${input.comment}”` : ""}`,
    link: `/changes/${cr.id}`,
    dedupeKey: `cr-client:${cr.id}`,
  });
  if (input.decision === "APPROVE") await applyChange(db, org, cr.id, now);
  return { status: input.decision === "APPROVE" ? "APPLIED" : "REJECTED" };
}

/**
 * Applies an approved change: attendance forecast, supplier-update tasks, exposure snapshot.
 * Suppliers are not emailed automatically; the owner gets tasks (spec FR-9.6).
 */
export async function applyChange(db: DbLike, org: OrgRef, id: string, now: Date) {
  const { cr, event } = await loadChange(db, org.id, id);
  const next = nextStatus(cr.status, "APPLY", { internalApprovalRequired: false });
  if (!next) throw invalidState("Only approved changes can be applied.");
  const lines = await db
    .select({ l: changeLines, supplierName: suppliers.name })
    .from(changeLines)
    .leftJoin(contracts, eq(contracts.id, changeLines.contractId))
    .leftJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(eq(changeLines.changeRequestId, id))
    .orderBy(asc(changeLines.position));
  const newAttendance = Math.max(0, event.forecastAttendance + cr.attendanceDelta);
  await db.update(events).set({ forecastAttendance: newAttendance, lockVersion: sql`${events.lockVersion} + 1` }).where(eq(events.id, event.id));
  const bySupplier = new Map<string, string[]>();
  for (const { l, supplierName } of lines) {
    const key = supplierName ?? "Other suppliers";
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), l.description]);
  }
  if (cr.attendanceDelta !== 0 && !bySupplier.size) bySupplier.set("Suppliers", [`attendance ${cr.attendanceDelta > 0 ? "+" : ""}${cr.attendanceDelta}`]);
  if (bySupplier.size) {
    await db.insert(tasks).values(
      [...bySupplier].map(([supplier, items]) => ({
        orgId: org.id,
        eventId: event.id,
        changeRequestId: id,
        title: `Confirm CR-${cr.number} with ${supplier}: ${items.join("; ")}`,
        ownerId: event.ownerId,
        dueAt: new Date(now.getTime() + 2 * 86_400_000),
      })),
    );
  }
  await db.update(changeRequests).set({ status: next, appliedAt: now }).where(eq(changeRequests.id, id));
  await db.insert(activityLog).values({
    orgId: org.id,
    actorType: "SYSTEM",
    actorLabel: "System",
    entityType: "change_request",
    entityId: id,
    eventId: event.id,
    action: "applied",
    summary: `Applied CR-${cr.number}${cr.attendanceDelta ? `: forecast attendance ${event.forecastAttendance} → ${newAttendance}` : ""}. ${bySupplier.size} supplier update task${bySupplier.size === 1 ? "" : "s"} created.`,
    at: now,
  });
  const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, org.id), eq(users.role, "ADMIN"))).limit(1);
  const sys: ServiceCtx = { db: db as ServiceCtx["db"], now: () => now, actor: { userId: admin?.id ?? "", name: "System", role: "ADMIN", orgId: org.id, orgTimezone: org.timezone, baseCurrency: org.baseCurrency, config: org.config } };
  await snapshotEventExposure(db, sys, event.id, `CR-${cr.number} applied`);
  const { evaluateEvent } = await import("@/jobs/monitor");
  await evaluateEvent(db, org, event.id, now);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listChanges(ctx: ServiceCtx, filter: { eventId?: string; statuses?: ChangeStatus[] } = {}) {
  if (filter.eventId) await authorizeEvent(ctx, filter.eventId, "event.view");
  const restricted = restrictedToOwnEvents(ctx.actor);
  const memberOf = restricted ? (await ctx.db.select({ id: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.userId, ctx.actor.userId))).map((r) => r.id) : [];
  return ctx.db
    .select({
      id: changeRequests.id,
      number: changeRequests.number,
      title: changeRequests.title,
      type: changeRequests.type,
      status: changeRequests.status,
      attendanceDelta: changeRequests.attendanceDelta,
      createdAt: changeRequests.createdAt,
      createdBy: changeRequests.createdBy,
      creatorName: users.name,
      eventId: events.id,
      eventName: events.name,
      currency: events.baseCurrency,
      internalApprovalRequired: changeRequests.internalApprovalRequired,
      priceDeltaMinor: sql<number>`(select coalesce(sum(l.price_delta_minor),0) from change_lines l where l.change_request_id = ${changeRequests.id})`.mapWith(Number),
      costDeltaMinor: sql<number>`(select coalesce(sum(l.cost_delta_minor),0) from change_lines l where l.change_request_id = ${changeRequests.id})`.mapWith(Number),
    })
    .from(changeRequests)
    .innerJoin(events, eq(events.id, changeRequests.eventId))
    .innerJoin(users, eq(users.id, changeRequests.createdBy))
    .where(
      and(
        eq(changeRequests.orgId, ctx.actor.orgId),
        filter.eventId ? eq(changeRequests.eventId, filter.eventId) : undefined,
        filter.statuses?.length ? inArray(changeRequests.status, filter.statuses) : undefined,
        restricted ? or(eq(events.ownerId, ctx.actor.userId), memberOf.length ? inArray(events.id, memberOf) : sql`false`) : undefined,
      ),
    )
    .orderBy(desc(changeRequests.number));
}

export async function getChange(ctx: ServiceCtx, id: string) {
  const row = await loadChange(ctx.db, ctx.actor.orgId, id);
  const scope = await eventScope(ctx.db, ctx.actor.orgId, row.cr.eventId);
  if (!can(ctx.actor, "event.view", scope)) throw notFound("Change request");
  const [lines, links, taskRows, approver] = await Promise.all([
    ctx.db.select().from(changeLines).where(eq(changeLines.changeRequestId, id)).orderBy(asc(changeLines.position)),
    ctx.db.select().from(approvalTokens).where(eq(approvalTokens.changeRequestId, id)).orderBy(desc(approvalTokens.createdAt)),
    ctx.db.select().from(tasks).where(eq(tasks.changeRequestId, id)),
    row.cr.internalApprovedBy ? ctx.db.select({ name: users.name }).from(users).where(eq(users.id, row.cr.internalApprovedBy)) : Promise.resolve([]),
  ]);
  return { ...row, scope, lines, links, tasks: taskRows, approverName: approver[0]?.name ?? null };
}

export async function completeTask(ctx: ServiceCtx, taskId: string, done: boolean) {
  const [t] = await ctx.db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.orgId, ctx.actor.orgId)));
  if (!t) throw notFound("Task");
  await authorizeEvent(ctx, t.eventId, "event.edit");
  await ctx.db.update(tasks).set({ status: done ? "DONE" : "OPEN", completedAt: done ? ctx.now() : null }).where(eq(tasks.id, taskId));
  await audit(ctx.db, ctx, { entityType: "task", entityId: taskId, eventId: t.eventId, action: done ? "task_done" : "task_reopened", summary: `${done ? "Completed" : "Reopened"}: ${t.title}` });
}

export async function listOpenTasks(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  return ctx.db.select().from(tasks).where(and(eq(tasks.eventId, eventId), eq(tasks.status, "OPEN"))).orderBy(asc(tasks.dueAt));
}

// ---------------------------------------------------------------------------
// Hourly job (R9)
// ---------------------------------------------------------------------------

/** Change requests whose approval links have all expired move to Expired; the owner is told. */
export async function expireApprovals(db: DbLike, org: OrgRef, now: Date) {
  const expired = await db
    .select({ token: approvalTokens, cr: changeRequests, eventName: events.name, ownerId: events.ownerId })
    .from(approvalTokens)
    .innerJoin(changeRequests, eq(changeRequests.id, approvalTokens.changeRequestId))
    .innerJoin(events, eq(events.id, changeRequests.eventId))
    .where(
      and(
        eq(approvalTokens.orgId, org.id),
        isNull(approvalTokens.usedAt),
        isNull(approvalTokens.revokedAt),
        lt(approvalTokens.expiresAt, now),
        eq(changeRequests.status, "SENT_TO_CLIENT"),
      ),
    );
  let count = 0;
  for (const { token, cr, eventName, ownerId } of expired) {
    await db.update(approvalTokens).set({ revokedAt: now }).where(eq(approvalTokens.id, token.id));
    const [still] = await db
      .select({ id: approvalTokens.id })
      .from(approvalTokens)
      .where(and(eq(approvalTokens.changeRequestId, cr.id), isNull(approvalTokens.usedAt), isNull(approvalTokens.revokedAt), gt(approvalTokens.expiresAt, now)));
    if (still) continue;
    await db.update(changeRequests).set({ status: "EXPIRED" }).where(eq(changeRequests.id, cr.id));
    await db.insert(activityLog).values({
      orgId: org.id,
      actorType: "SYSTEM",
      actorLabel: "System",
      entityType: "change_request",
      entityId: cr.id,
      eventId: cr.eventId,
      action: "approval_expired",
      summary: `CR-${cr.number} approval link expired before the client responded`,
      at: now,
    });
    await notify(db, org, [ownerId, cr.createdBy], {
      kind: "change",
      title: `CR-${cr.number} expired without a client decision`,
      body: `${eventName}: ${cr.title}. Send a new approval link if the change still stands.`,
      link: `/changes/${cr.id}`,
      dedupeKey: `cr-expired:${cr.id}:${token.id}`,
    });
    count++;
  }
  return count;
}

