import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { clauses, contracts, events, files, pickupInbound, suppliers } from "@/db/schema";
import type { Db } from "@/db/client";
import { env } from "@/env";
import { storage } from "@/adapters/storage";
import { isReportFile, readReportRows, UnsupportedReport } from "@/adapters/spreadsheet";
import { mapPickupCsv } from "@/core/pickup-csv";
import { roomBlockTerms } from "@/core/clauses/schemas";
import { audit, type ServiceCtx } from "./context";
import { invalidState, notFound, parseInput } from "./errors";
import { authorizeEvent } from "./events";
import { recordPickup } from "./pickup";
import { orgRef } from "./alerts";
import { notify } from "./notifications";
import { systemCtx } from "./system-ctx";

// Bookings that update themselves (milestone 14). Each room block can have an email address;
// the hotel's pickup report sent there is read with a column mapping saved from a sample, and
// becomes a pickup snapshot. A report that doesn't match the mapping is rejected with a reason,
// never guessed at, because a wrong pickup figure moves every penalty on the event.

const mappingSchema = z.object({
  dateColumn: z.string().trim().min(1, "Choose the column with the night's date"),
  pickedUpColumn: z.string().trim().min(1, "Choose the column with rooms picked up"),
  forecastColumn: z.string().trim().nullable().optional().default(null),
  dateFormat: z.enum(["ISO", "US", "EU"]),
  sheet: z.string().trim().nullable().optional().default(null),
});
export type InboundMapping = z.infer<typeof mappingSchema>;

const setupInput = z.object({
  mapping: mappingSchema,
  allowedSenderDomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((d) => d.replace(/^@/, ""))
    .refine((d) => d === "" || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d), "Enter a domain like hotelalvorada.pt, or leave it empty")
    .optional()
    .default(""),
});

/** 26 lowercase base32 characters (128 bits): survives mail systems that lowercase addresses. */
function newToken() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export const inboundAddress = (token: string) => `pickup+${token}@${env().INBOUND_DOMAIN}`;

async function loadBlock(ctx: ServiceCtx, clauseId: string) {
  const [row] = await ctx.db
    .select({ clause: clauses, contract: contracts })
    .from(clauses)
    .innerJoin(contracts, eq(contracts.id, clauses.contractId))
    .where(and(eq(clauses.id, clauseId), eq(clauses.orgId, ctx.actor.orgId)));
  if (!row) throw notFound("Room block");
  if (row.clause.type !== "ROOM_BLOCK") throw invalidState("Automatic updates are only for room blocks.");
  await authorizeEvent(ctx, row.contract.eventId, "pickup.edit");
  return row;
}

async function revokeActive(db: Db | ServiceCtx["db"], clauseId: string, now: Date) {
  await db
    .update(pickupInbound)
    .set({ revokedAt: now })
    .where(and(eq(pickupInbound.clauseId, clauseId), isNull(pickupInbound.revokedAt)));
}

/** Turns on automatic updates for a block with a mapping saved from a sample report. */
export async function setUpInbound(ctx: ServiceCtx, clauseId: string, raw: unknown) {
  const { clause, contract } = await loadBlock(ctx, clauseId);
  const input = parseInput(setupInput, raw);
  await revokeActive(ctx.db, clauseId, ctx.now());
  const [row] = await ctx.db
    .insert(pickupInbound)
    .values({
      orgId: ctx.actor.orgId,
      clauseId,
      token: newToken(),
      mapping: input.mapping,
      allowedSenderDomain: input.allowedSenderDomain || null,
      createdBy: ctx.actor.userId,
    })
    .returning();
  await audit(ctx.db, ctx, {
    entityType: "contract",
    entityId: contract.id,
    eventId: contract.eventId,
    action: "inbound_enabled",
    summary: `Turned on emailed pickup reports for ${clause.label}`,
  });
  return { address: inboundAddress(row.token) };
}

/** A new address for the block (the old one stops working), keeping the mapping. */
export async function rotateInbound(ctx: ServiceCtx, clauseId: string) {
  const [active] = await activeFor(ctx.db, [clauseId]);
  if (!active) throw invalidState("Automatic updates aren't on for this block.");
  return setUpInbound(ctx, clauseId, { mapping: active.mapping, allowedSenderDomain: active.allowedSenderDomain ?? "" });
}

export async function turnOffInbound(ctx: ServiceCtx, clauseId: string) {
  const { clause, contract } = await loadBlock(ctx, clauseId);
  await revokeActive(ctx.db, clauseId, ctx.now());
  await audit(ctx.db, ctx, {
    entityType: "contract",
    entityId: contract.id,
    eventId: contract.eventId,
    action: "inbound_disabled",
    summary: `Turned off emailed pickup reports for ${clause.label}`,
  });
}

async function activeFor(db: ServiceCtx["db"], clauseIds: string[]) {
  if (!clauseIds.length) return [];
  return db
    .select()
    .from(pickupInbound)
    .where(and(inArray(pickupInbound.clauseId, clauseIds), isNull(pickupInbound.revokedAt)));
}

export type InboundView = {
  clauseId: string;
  address: string;
  allowedSenderDomain: string | null;
  mapping: InboundMapping;
  lastReceivedAt: string | null;
  lastResult: { ok: boolean; message: string; filename: string | null } | null;
};

/** Automatic-update settings for the blocks shown on an event's Exposure tab. */
export async function getInboundForBlocks(ctx: ServiceCtx, clauseIds: string[]): Promise<InboundView[]> {
  const rows = await activeFor(ctx.db, clauseIds);
  return rows
    .filter((r) => r.orgId === ctx.actor.orgId)
    .map((r) => ({
      clauseId: r.clauseId,
      address: inboundAddress(r.token),
      allowedSenderDomain: r.allowedSenderDomain,
      mapping: r.mapping as InboundMapping,
      lastReceivedAt: r.lastReceivedAt?.toISOString() ?? null,
      lastResult: (r.lastResult as InboundView["lastResult"]) ?? null,
    }));
}

// ---------------------------------------------------------------------------------------------
// Receiving (public webhook; no signed-in person)

export const inboundEmailPayload = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  from: z.string(),
  subject: z.string().optional().default(""),
  attachments: z
    .array(z.object({ filename: z.string(), contentType: z.string().optional().default(""), contentBase64: z.string() }))
    .optional()
    .default([]),
});
export type InboundEmail = z.infer<typeof inboundEmailPayload>;

export type InboundResult =
  | { status: "recorded"; clauseId: string; nights: number; message: string }
  | { status: "rejected"; clauseId: string; message: string }
  | { status: "duplicate"; clauseId: string; message: string }
  | { status: "unknown_address"; message: string };

const tokenIn = (to: string | string[]) => {
  for (const addr of Array.isArray(to) ? to : to.split(",")) {
    const m = addr.match(/pickup\+([a-z2-7]{26})@/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
};
const senderDomain = (from: string) => (from.match(/@([^\s>]+)/)?.[1] ?? "").toLowerCase();

/**
 * Handles one inbound email. Every outcome is recorded on the block (last result) and anything
 * other than a duplicate notifies the event owner, so a failed report is never silent.
 */
export async function receiveInboundEmail(db: Db, raw: unknown, now = new Date()): Promise<InboundResult> {
  const email = inboundEmailPayload.parse(raw);
  const token = tokenIn(email.to);
  if (!token) return { status: "unknown_address", message: "No pickup address in the recipients." };
  const [inbound] = await db.select().from(pickupInbound).where(and(eq(pickupInbound.token, token), isNull(pickupInbound.revokedAt)));
  if (!inbound) return { status: "unknown_address", message: "This pickup address isn't active (it may have been rotated or turned off)." };

  const [block] = await db
    .select({ clause: clauses, contract: contracts, event: events, supplierName: suppliers.name })
    .from(clauses)
    .innerJoin(contracts, eq(contracts.id, clauses.contractId))
    .innerJoin(events, eq(events.id, contracts.eventId))
    .innerJoin(suppliers, eq(suppliers.id, contracts.supplierId))
    .where(eq(clauses.id, inbound.clauseId));
  const org = await orgRef(db, inbound.orgId);
  const mapping = inbound.mapping as InboundMapping;
  const attachment = email.attachments.find((a) => isReportFile(a.filename, a.contentType));
  const link = `/events/${block.event.id}/exposure`;

  const finish = async (result: InboundResult, filename: string | null, notifyOwner: boolean) => {
    if (result.status === "unknown_address") return result;
    const ok = result.status === "recorded";
    await db
      .update(pickupInbound)
      .set({ lastReceivedAt: now, lastResult: { ok, message: result.message, filename } })
      .where(eq(pickupInbound.id, inbound.id));
    if (notifyOwner) {
      await notify(db, org, [block.event.ownerId], {
        kind: "pickup",
        title: ok ? `Pickup updated from ${block.supplierName}'s report` : `${block.supplierName}'s pickup report couldn't be used`,
        body: `${block.event.name} · ${block.clause.label}\n${result.message}`,
        link,
        dedupeKey: `inbound:${inbound.id}:${now.toISOString()}`,
      });
    }
    return result;
  };
  const reject = (message: string, filename: string | null = null) => finish({ status: "rejected", clauseId: inbound.clauseId, message }, filename, true);

  if (inbound.allowedSenderDomain) {
    const d = senderDomain(email.from);
    if (d !== inbound.allowedSenderDomain && !d.endsWith(`.${inbound.allowedSenderDomain}`)) {
      return reject(`A report arrived from ${email.from}, but only ${inbound.allowedSenderDomain} addresses can update this block. Nothing was changed.`);
    }
  }
  if (!attachment) return reject("The email had no CSV or Excel attachment. Nothing was changed.");

  const data = Buffer.from(attachment.contentBase64, "base64");
  const sha256 = createHash("sha256").update(data).digest("hex");
  const [seen] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerType, "pickup_report"), eq(files.ownerId, inbound.clauseId), eq(files.sha256, sha256)));
  if (seen) return finish({ status: "duplicate", clauseId: inbound.clauseId, message: "This report was already received. Nothing was changed." }, attachment.filename, false);

  let report;
  try {
    report = await readReportRows({ filename: attachment.filename, contentType: attachment.contentType, data }, mapping.sheet);
  } catch (e) {
    return reject(e instanceof UnsupportedReport ? e.message : "The attachment couldn't be read.", attachment.filename);
  }
  const needed = [mapping.dateColumn, mapping.pickedUpColumn, ...(mapping.forecastColumn ? [mapping.forecastColumn] : [])];
  const missing = needed.filter((c) => !report.headers.includes(c));
  if (missing.length) {
    return reject(
      `The report's columns have changed: ${missing.map((c) => `"${c}"`).join(", ")} ${missing.length === 1 ? "is" : "are"} missing. Nothing was changed. Update the column mapping on the Exposure tab.`,
      attachment.filename,
    );
  }
  const terms = roomBlockTerms.parse(block.clause.data);
  const mapped = mapPickupCsv(report.rows, mapping, terms.nights.map((n) => n.date));
  if (mapped.errors.length) {
    const first = mapped.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.problem.toLowerCase()} ("${e.value}")`);
    return reject(`Some rows couldn't be read (${first.join("; ")}). Nothing was changed.`, attachment.filename);
  }
  const nights = Object.entries(mapped.nights).map(([date, v]) => ({ date, pickedUp: v.pickedUp, forecastFinal: v.forecastFinal }));
  if (!nights.length) return reject("The report didn't include any nights of this room block. Nothing was changed.", attachment.filename);

  // Keep the report itself, then record it as a pickup snapshot.
  const key = `${inbound.orgId}/pickup/${inbound.clauseId}/${randomUUID()}-${attachment.filename.replace(/[^\w.-]+/g, "_")}`;
  await storage().put(key, data, attachment.contentType || "application/octet-stream");
  const [file] = await db
    .insert(files)
    .values({
      orgId: inbound.orgId,
      ownerType: "pickup_report",
      ownerId: inbound.clauseId,
      storageKey: key,
      filename: attachment.filename.slice(0, 200),
      mime: attachment.contentType || "application/octet-stream",
      size: data.length,
      sha256,
    })
    .returning();
  const ctx = await systemCtx(db, org, now);
  await recordPickup(ctx, inbound.clauseId, { nights, capturedAt: now.toISOString() }, "EMAIL", file.id, `Hotel report email (${senderDomain(email.from) || "unknown sender"})`);
  const { evaluateEvent } = await import("@/jobs/monitor");
  await evaluateEvent(db, org, block.event.id, now);

  const picked = nights.reduce((s, n) => s + n.pickedUp, 0);
  const rooms = terms.nights.reduce((s, n) => s + n.rooms, 0);
  const skipped = mapped.ignored ? ` ${mapped.ignored} row${mapped.ignored === 1 ? "" : "s"} for other nights ${mapped.ignored === 1 ? "was" : "were"} ignored.` : "";
  return finish(
    {
      status: "recorded",
      clauseId: inbound.clauseId,
      nights: nights.length,
      message: `${picked.toLocaleString("en-US")} of ${rooms.toLocaleString("en-US")} room nights booked, from ${attachment.filename}.${skipped}`,
    },
    attachment.filename,
    true,
  );
}
