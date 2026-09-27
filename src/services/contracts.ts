import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { alerts, clauses, contracts, events, extractionRuns, obligations, payments, pickupInbound, pickupSnapshots, suppliers } from "@/db/schema";
import {
  CLAUSE_TYPES,
  fbMinimumInputs,
  localDate,
  roomBlockInputs,
  termsSchemaByType,
  type ClauseType,
} from "@/core/clauses/schemas";
import { generateObligations, isMarker } from "@/core/obligations/generate";
import { localToUtc } from "@/core/time";
import { parseMoney } from "@/core/money";
import type { Action } from "@/auth/policy";
import { audit, changes, type DbLike, type ServiceCtx } from "./context";
import { conflict, invalidState, notFound, parseInput, validation } from "./errors";
import { authorizeEvent } from "./events";

export const clauseTypeLabels: Record<ClauseType, string> = {
  PAYMENT: "Payment / deposit",
  ROOM_BLOCK: "Room block",
  FB_MINIMUM: "F&B minimum",
  CANCELLATION: "Cancellation schedule",
  FINAL_GUARANTEE: "Final guarantee",
  OTHER_DEADLINE: "Other deadline",
};

export const contractStatusLabels = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  ACTIVE: "Active",
  SUPERSEDED: "Superseded",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
} as const;

export const contractInput = z.object({
  supplierId: z.uuid("Choose a supplier"),
  title: z.string().trim().min(1, "Name the contract, e.g. Group agreement"),
  reference: z.string().trim().max(120).optional().default(""),
  signedDate: z.union([z.literal(""), localDate]).optional().default(""),
  currency: z.string().regex(/^[A-Z]{3}$/, "Choose a currency"),
  contractedValue: z.string().optional().default(""),
});

export const clauseInput = z.object({
  type: z.enum(CLAUSE_TYPES),
  label: z.string().trim().min(1).max(200),
  terms: z.unknown(),
  inputs: z.unknown().optional(),
});

function parseInputs(type: ClauseType, raw: unknown) {
  if (type === "ROOM_BLOCK") return roomBlockInputs.parse(raw ?? {});
  if (type === "FB_MINIMUM") return fbMinimumInputs.parse(raw ?? {});
  return {};
}

function parseTermsFor(type: ClauseType, raw: unknown) {
  const res = termsSchemaByType[type].safeParse(raw);
  if (!res.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of res.error.issues) {
      const k = `terms.${i.path.join(".")}`;
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    throw validation("Some terms need attention.", fieldErrors);
  }
  return res.data;
}

async function loadContract(db: DbLike, orgId: string, contractId: string) {
  const [row] = await db
    .select({ contract: contracts, event: events, supplier: suppliers })
    .from(contracts)
    .innerJoin(events, eq(events.id, contracts.eventId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(contracts.id, contractId), eq(contracts.orgId, orgId)));
  if (!row) throw notFound("Contract");
  return row;
}

async function authorizeContract(ctx: ServiceCtx, contractId: string, action: Action) {
  const row = await loadContract(ctx.db, ctx.actor.orgId, contractId);
  await authorizeEvent(ctx, row.event.id, action);
  return row;
}

function assertEditable(status: string) {
  if (status === "SUPERSEDED" || status === "CLOSED" || status === "CANCELLED") {
    throw invalidState("This contract version can't be edited. Amend the current version instead.");
  }
}

export async function createContract(ctx: ServiceCtx, eventId: string, raw: unknown) {
  await authorizeEvent(ctx, eventId, "contract.edit");
  const input = parseInput(contractInput, raw);
  if (!ctx.actor.config.finance.enabledCurrencies.includes(input.currency)) {
    throw validation("That currency isn't enabled for this workspace.", { currency: "Choose an enabled currency" });
  }
  const value = input.contractedValue ? parseMoney(input.contractedValue) : 0;
  if (value === null || value < 0) throw validation("Enter the contracted value as an amount, e.g. 245,200.00", { contractedValue: "Enter a valid amount" });
  const [supplier] = await ctx.db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.orgId, ctx.actor.orgId)));
  if (!supplier) throw notFound("Supplier");

  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contracts)
      .values({
        orgId: ctx.actor.orgId,
        eventId,
        supplierId: supplier.id,
        title: input.title,
        reference: input.reference || null,
        signedDate: input.signedDate || null,
        currency: input.currency,
        contractedValueMinor: value,
      })
      .returning();
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: row.id,
      eventId,
      action: "created",
      summary: `Added contract ${supplier.name}: ${row.title}`,
    });
    return row;
  });
}

export async function getContract(ctx: ServiceCtx, contractId: string) {
  const row = await authorizeContract(ctx, contractId, "event.view");
  const [clauseRows, obligationRows, versions] = await Promise.all([
    ctx.db.select().from(clauses).where(eq(clauses.contractId, contractId)).orderBy(asc(clauses.createdAt)),
    ctx.db.select().from(obligations).where(eq(obligations.contractId, contractId)).orderBy(asc(obligations.dueAt)),
    contractChain(ctx.db, ctx.actor.orgId, contractId),
  ]);
  const paid = obligationRows.length
    ? await ctx.db
        .select({ obligationId: payments.obligationId, total: sql<number>`sum(${payments.amountMinor})`.mapWith(Number) })
        .from(payments)
        .where(inArray(payments.obligationId, obligationRows.map((o) => o.id)))
        .groupBy(payments.obligationId)
    : [];
  const paidBy = new Map(paid.map((p) => [p.obligationId, p.total]));
  return {
    ...row,
    clauses: clauseRows,
    obligations: obligationRows.map((o) => ({ ...o, paidMinor: paidBy.get(o.id) ?? 0 })),
    versions,
  };
}

/** All versions of a contract (oldest first), following supersedes links both ways. */
async function contractChain(db: DbLike, orgId: string, contractId: string) {
  const all = await db
    .select({ id: contracts.id, version: contracts.version, status: contracts.status, supersedesId: contracts.supersedesId, createdAt: contracts.createdAt })
    .from(contracts)
    .where(
      and(
        eq(contracts.orgId, orgId),
        eq(contracts.eventId, sql`(select event_id from contracts where id = ${contractId})`),
        eq(contracts.supplierId, sql`(select supplier_id from contracts where id = ${contractId})`),
      ),
    );
  // Walk back to the root, then forward.
  const byId = new Map(all.map((c) => [c.id, c]));
  let root = byId.get(contractId);
  while (root?.supersedesId && byId.get(root.supersedesId)) root = byId.get(root.supersedesId);
  const chain: typeof all = [];
  let cur = root;
  while (cur) {
    chain.push(cur);
    cur = all.find((c) => c.supersedesId === cur!.id);
  }
  return chain;
}

export async function listContractsForEvent(ctx: ServiceCtx, eventId: string) {
  await authorizeEvent(ctx, eventId, "event.view");
  return ctx.db
    .select({
      id: contracts.id,
      title: contracts.title,
      status: contracts.status,
      version: contracts.version,
      currency: contracts.currency,
      contractedValueMinor: contracts.contractedValueMinor,
      signedDate: contracts.signedDate,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      supplierType: suppliers.type,
      confirmedCount: sql<number>`(select count(*) from clauses c where c.contract_id = ${contracts.id} and c.status = 'CONFIRMED')`.mapWith(Number),
      proposedCount: sql<number>`(select count(*) from clauses c where c.contract_id = ${contracts.id} and c.status = 'PROPOSED')`.mapWith(Number),
    })
    .from(contracts)
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(and(eq(contracts.eventId, eventId), ne(contracts.status, "SUPERSEDED")))
    .orderBy(asc(suppliers.name));
}

/** Manual entry: a person typed these terms, so the clause is confirmed on save. */
export async function addClause(ctx: ServiceCtx, contractId: string, raw: unknown) {
  const { contract, event } = await authorizeContract(ctx, contractId, "contract.edit");
  assertEditable(contract.status);
  const input = parseInput(clauseInput, raw);
  const terms = parseTermsFor(input.type, input.terms);
  const inputs = parseInputs(input.type, input.inputs);
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clauses)
      .values({
        orgId: ctx.actor.orgId,
        contractId,
        type: input.type,
        label: input.label,
        status: "CONFIRMED",
        data: terms,
        inputs,
        confirmedBy: ctx.actor.userId,
        confirmedAt: ctx.now(),
      })
      .returning();
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contractId,
      eventId: event.id,
      action: "clause_added",
      summary: `Entered ${clauseTypeLabels[input.type]}: ${input.label}`,
      diff: { terms },
    });
    if (contract.status === "ACTIVE") await syncObligations(tx, ctx, contractId);
    return row;
  });
}

/** Edit terms. Confirming a proposed clause with changes marks it as edited (extraction accuracy). */
export async function updateClauseTerms(ctx: ServiceCtx, clauseId: string, raw: { label?: string; terms: unknown }, lockVersion: number) {
  const [clause] = await ctx.db.select().from(clauses).where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!clause) throw notFound("Term");
  const { contract, event } = await authorizeContract(ctx, clause.contractId, "contract.edit");
  assertEditable(contract.status);
  const terms = parseTermsFor(clause.type, raw.terms);
  const label = raw.label?.trim() || clause.label;
  return ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(clauses)
      .set({
        data: terms,
        label,
        status: "CONFIRMED",
        edited: clause.status === "PROPOSED" ? true : clause.edited,
        confirmedBy: ctx.actor.userId,
        confirmedAt: ctx.now(),
        lockVersion: sql`${clauses.lockVersion} + 1`,
      })
      .where(and(eq(clauses.id, clauseId), eq(clauses.lockVersion, lockVersion)))
      .returning();
    if (!updated.length) throw conflict("These terms were changed by someone else. Reload to see their changes.");
    if (clause.status === "PROPOSED" && clause.extractionRunId) await bumpRun(tx, clause.extractionRunId, "editedCount");
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contract.id,
      eventId: event.id,
      action: clause.status === "PROPOSED" ? "clause_confirmed_edited" : "clause_updated",
      summary: `${clause.status === "PROPOSED" ? "Confirmed with changes" : "Updated"}: ${label}`,
      diff: changes(clause.data as Record<string, unknown>, terms as Record<string, unknown>),
    });
    if (contract.status === "ACTIVE") await syncObligations(tx, ctx, contract.id);
    return updated[0];
  });
}

export async function confirmClause(ctx: ServiceCtx, clauseId: string) {
  const [clause] = await ctx.db.select().from(clauses).where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!clause) throw notFound("Term");
  if (clause.status !== "PROPOSED") throw invalidState("Only proposed terms can be confirmed.");
  const { contract, event } = await authorizeContract(ctx, clause.contractId, "contract.edit");
  parseTermsFor(clause.type, clause.data); // proposed values must be valid before confirming
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(clauses)
      .set({ status: "CONFIRMED", confirmedBy: ctx.actor.userId, confirmedAt: ctx.now() })
      .where(eq(clauses.id, clauseId));
    if (clause.extractionRunId) await bumpRun(tx, clause.extractionRunId, "confirmedCount");
    await audit(tx, ctx, { entityType: "contract", entityId: contract.id, eventId: event.id, action: "clause_confirmed", summary: `Confirmed: ${clause.label}` });
  });
}

export async function rejectClause(ctx: ServiceCtx, clauseId: string) {
  const [clause] = await ctx.db.select().from(clauses).where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!clause) throw notFound("Term");
  const { contract, event } = await authorizeContract(ctx, clause.contractId, "contract.edit");
  assertEditable(contract.status);
  await ctx.db.transaction(async (tx) => {
    await tx.update(clauses).set({ status: "REJECTED" }).where(eq(clauses.id, clauseId));
    if (clause.status === "PROPOSED" && clause.extractionRunId) await bumpRun(tx, clause.extractionRunId, "rejectedCount");
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contract.id,
      eventId: event.id,
      action: "clause_rejected",
      summary: `${clause.status === "PROPOSED" ? "Rejected proposed term" : "Removed term"}: ${clause.label}`,
    });
    if (contract.status === "ACTIVE") await syncObligations(tx, ctx, contract.id);
  });
}

/** Planner inputs (F&B forecast, pickup projection). Not contract terms: no re-confirmation. */
export async function updateClauseInputs(ctx: ServiceCtx, clauseId: string, raw: unknown) {
  const [clause] = await ctx.db.select().from(clauses).where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!clause) throw notFound("Term");
  const { contract, event } = await authorizeContract(ctx, clause.contractId, "pickup.edit");
  const inputs = parseInputs(clause.type, raw);
  await ctx.db.transaction(async (tx) => {
    await tx.update(clauses).set({ inputs }).where(eq(clauses.id, clauseId));
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contract.id,
      eventId: event.id,
      action: "inputs_updated",
      summary: `Updated forecast inputs: ${clause.label}`,
      diff: changes(clause.inputs as Record<string, unknown>, inputs as Record<string, unknown>),
    });
  });
}

export async function activateContract(ctx: ServiceCtx, contractId: string) {
  const { contract, event, supplier } = await authorizeContract(ctx, contractId, "contract.edit");
  if (contract.status === "ACTIVE") return;
  assertEditable(contract.status);
  const rows = await ctx.db.select({ status: clauses.status }).from(clauses).where(eq(clauses.contractId, contractId));
  const proposed = rows.filter((r) => r.status === "PROPOSED").length;
  const confirmed = rows.filter((r) => r.status === "CONFIRMED").length;
  if (proposed > 0) throw invalidState(`${proposed} proposed term${proposed === 1 ? " is" : "s are"} waiting for review. Confirm or reject ${proposed === 1 ? "it" : "them"} first.`);
  if (confirmed === 0) throw invalidState("Add at least one confirmed term before activating this contract.");

  await ctx.db.transaction(async (tx) => {
    await tx.update(contracts).set({ status: "ACTIVE" }).where(eq(contracts.id, contractId));
    if (contract.supersedesId) {
      await supersede(tx, ctx, contract.supersedesId, contract.version);
      await carryRoomBlockHistory(tx, contract.supersedesId, contractId);
    }
    await syncObligations(tx, ctx, contractId);
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: contractId,
      eventId: event.id,
      action: "activated",
      summary: `Activated ${supplier.name}: ${contract.title}${contract.version > 1 ? ` (version ${contract.version})` : ""}`,
    });
  });
}

/**
 * A room block keeps its pickup history and its hotel-report address across an amendment. Blocks
 * are matched by name; a contract with one block on each side matches directly.
 */
async function carryRoomBlockHistory(tx: DbLike, oldContractId: string, newContractId: string) {
  const blocks = async (id: string) =>
    (await tx.select().from(clauses).where(and(eq(clauses.contractId, id), eq(clauses.type, "ROOM_BLOCK"), eq(clauses.status, "CONFIRMED")))).map((c) => ({
      id: c.id,
      name: ((c.data ?? {}) as { blockName?: string }).blockName ?? c.label,
    }));
  const [before, after] = await Promise.all([blocks(oldContractId), blocks(newContractId)]);
  for (const old of before) {
    const next = before.length === 1 && after.length === 1 ? after[0] : after.find((b) => b.name === old.name);
    if (!next) continue;
    await tx.update(pickupSnapshots).set({ clauseId: next.id }).where(eq(pickupSnapshots.clauseId, old.id));
    await tx.update(pickupInbound).set({ clauseId: next.id }).where(eq(pickupInbound.clauseId, old.id));
  }
}

async function supersede(tx: DbLike, ctx: ServiceCtx, oldContractId: string, newVersion: number) {
  await tx.update(contracts).set({ status: "SUPERSEDED" }).where(eq(contracts.id, oldContractId));
  const open = await tx
    .select({ id: obligations.id })
    .from(obligations)
    .where(and(eq(obligations.contractId, oldContractId), eq(obligations.status, "OPEN")));
  if (open.length) {
    await tx.update(obligations).set({ status: "SUPERSEDED" }).where(inArray(obligations.id, open.map((o) => o.id)));
  }
  // Open alerts on the old version close with a note (spec edge case 8).
  await tx
    .update(alerts)
    .set({ status: "AUTO_RESOLVED", closedAt: ctx.now(), closedNote: `Contract superseded by version ${newVersion}` })
    .where(and(eq(alerts.contractId, oldContractId), eq(alerts.status, "OPEN")));
}

/** Starts an amendment: a new draft version with the current confirmed terms copied over. */
export async function amendContract(ctx: ServiceCtx, contractId: string) {
  const { contract, event, supplier } = await authorizeContract(ctx, contractId, "contract.edit");
  if (contract.status !== "ACTIVE") throw invalidState("Only the active version of a contract can be amended.");
  const [pending] = await ctx.db
    .select({ id: contracts.id })
    .from(contracts)
    .where(and(eq(contracts.supersedesId, contractId), ne(contracts.status, "CANCELLED")));
  if (pending) throw conflict("An amendment is already in progress for this contract.");
  const current = await ctx.db.select().from(clauses).where(and(eq(clauses.contractId, contractId), eq(clauses.status, "CONFIRMED")));
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contracts)
      .values({
        orgId: ctx.actor.orgId,
        eventId: event.id,
        supplierId: supplier.id,
        title: contract.title,
        reference: contract.reference,
        signedDate: null,
        currency: contract.currency,
        contractedValueMinor: contract.contractedValueMinor,
        version: contract.version + 1,
        supersedesId: contract.id,
        status: "DRAFT",
      })
      .returning();
    if (current.length) {
      await tx.insert(clauses).values(
        current.map((c) => ({
          orgId: ctx.actor.orgId,
          contractId: row.id,
          type: c.type,
          label: c.label,
          status: "CONFIRMED" as const,
          data: c.data,
          inputs: c.inputs,
          confirmedBy: ctx.actor.userId,
          confirmedAt: ctx.now(),
        })),
      );
    }
    await audit(tx, ctx, {
      entityType: "contract",
      entityId: row.id,
      eventId: event.id,
      action: "amendment_started",
      summary: `Started amendment: version ${row.version}`,
    });
    return row;
  });
}

export async function updateContractDetails(ctx: ServiceCtx, contractId: string, raw: unknown) {
  const { contract, event } = await authorizeContract(ctx, contractId, "contract.edit");
  assertEditable(contract.status);
  const input = parseInput(contractInput, raw);
  const value = input.contractedValue ? parseMoney(input.contractedValue) : 0;
  if (value === null || value < 0) throw validation("Enter a valid amount", { contractedValue: "Enter a valid amount" });
  const next = {
    title: input.title,
    reference: input.reference || null,
    signedDate: input.signedDate || null,
    currency: input.currency,
    contractedValueMinor: value,
  };
  await ctx.db.transaction(async (tx) => {
    await tx.update(contracts).set(next).where(eq(contracts.id, contractId));
    await audit(tx, ctx, { entityType: "contract", entityId: contractId, eventId: event.id, action: "updated", summary: "Updated contract details", diff: changes(contract, next) });
    if (contract.status === "ACTIVE") await syncObligations(tx, ctx, contractId);
  });
}

/**
 * Brings obligations in line with the contract's confirmed clauses. Obligations already
 * done or waived are kept; open ones that no longer match a clause are removed; new ones
 * are created with the event owner as owner.
 */
export async function syncObligations(tx: DbLike, ctx: ServiceCtx, contractId: string) {
  const { contract, event } = await loadContract(tx, ctx.actor.orgId, contractId);
  const confirmed = await tx.select().from(clauses).where(and(eq(clauses.contractId, contractId), eq(clauses.status, "CONFIRMED")));
  const desired = confirmed.flatMap((c) =>
    generateObligations({ id: c.id, type: c.type, terms: c.data }, { contractedValueMinor: contract.contractedValueMinor }).map((o) => ({
      ...o,
      dueAt: localToUtc(o.localDate, o.localTime, event.timezone),
    })),
  ).filter(
    // Tier steps and block review points are markers, not tasks: once their date has passed
    // there is nothing left to do, so they never appear as "overdue". Payments, cutoffs and
    // guarantees stay, because a missed one is a real problem.
    (o) => !(isMarker(o.kind) && o.dueAt.getTime() <= ctx.now().getTime()),
  );
  const existing = await tx.select().from(obligations).where(eq(obligations.contractId, contractId));
  const key = (o: { clauseId: string | null; kind: string; label: string; dueAt: Date }) =>
    `${o.clauseId}|${o.kind}|${o.label}|${o.dueAt.toISOString()}`;
  const existingByKey = new Map(existing.map((o) => [key(o), o]));
  const desiredKeys = new Set(desired.map(key));

  for (const d of desired) {
    const match = existingByKey.get(key(d));
    if (match) {
      if (match.status === "SUPERSEDED") {
        await tx.update(obligations).set({ status: "OPEN", amountMinor: d.amountMinor }).where(eq(obligations.id, match.id));
      } else if (match.amountMinor !== d.amountMinor) {
        await tx.update(obligations).set({ amountMinor: d.amountMinor }).where(eq(obligations.id, match.id));
      }
      continue;
    }
    await tx.insert(obligations).values({
      orgId: ctx.actor.orgId,
      eventId: event.id,
      contractId,
      clauseId: d.clauseId,
      kind: d.kind,
      label: d.label,
      dueAt: d.dueAt,
      dueTz: event.timezone,
      amountMinor: d.amountMinor,
      currency: d.amountMinor !== null ? contract.currency : null,
      ownerId: event.ownerId,
    });
  }
  const stale = existing.filter((o) => o.status === "OPEN" && !desiredKeys.has(key(o)));
  if (stale.length) await tx.delete(obligations).where(inArray(obligations.id, stale.map((o) => o.id)));
}

export async function depositsPaidByContract(db: DbLike, contractIds: string[]) {
  if (!contractIds.length) return new Map<string, number>();
  const rows = await db
    .select({ contractId: obligations.contractId, total: sql<number>`coalesce(sum(${payments.amountMinor}), 0)`.mapWith(Number) })
    .from(payments)
    .innerJoin(obligations, eq(obligations.id, payments.obligationId))
    .where(and(inArray(obligations.contractId, contractIds), eq(obligations.kind, "PAYMENT")))
    .groupBy(obligations.contractId);
  return new Map(rows.map((r) => [r.contractId, r.total]));
}

export async function latestVersions(db: DbLike, eventId: string) {
  return db
    .select()
    .from(contracts)
    .where(and(eq(contracts.eventId, eventId), inArray(contracts.status, ["ACTIVE", "DRAFT", "IN_REVIEW"])))
    .orderBy(desc(contracts.version));
}

/** Extraction accuracy: how proposed terms were resolved (shown in Settings). */
async function bumpRun(tx: DbLike, runId: string, field: "confirmedCount" | "editedCount" | "rejectedCount") {
  const col = { confirmedCount: extractionRuns.confirmedCount, editedCount: extractionRuns.editedCount, rejectedCount: extractionRuns.rejectedCount }[field];
  await tx.update(extractionRuns).set({ [field]: sql`${col} + 1` }).where(eq(extractionRuns.id, runId));
}
