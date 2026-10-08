import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
  char,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", [
  "ADMIN",
  "OPS_DIRECTOR",
  "EVENT_MANAGER",
  "FINANCE",
  "MD",
]);
export const userStatus = pgEnum("user_status", [
  "ACTIVE",
  "INVITED",
  "DEACTIVATED",
]);
export const liabilityCategory = pgEnum("liability_category", [
  "DEPOSIT",
  "ATTRITION",
  "FB_SHORTFALL",
  "CANCELLATION",
  "OTHER",
]);
export const bearer = pgEnum("bearer", ["CLIENT", "AGENCY", "SPLIT"]);
export const eventStatus = pgEnum("event_status", [
  "PLANNING",
  "CONTRACTED",
  "LIVE",
  "DELIVERED",
  "RECONCILED",
  "CANCELLED",
  "POSTPONED",
]);
export const supplierType = pgEnum("supplier_type", [
  "HOTEL",
  "VENUE",
  "CATERER",
  "AV_PRODUCTION",
  "TRANSPORT",
  "DMC",
  "OTHER",
]);
export const contractStatus = pgEnum("contract_status", [
  "DRAFT",
  "IN_REVIEW",
  "ACTIVE",
  "SUPERSEDED",
  "CLOSED",
  "CANCELLED",
]);
export const clauseType = pgEnum("clause_type", [
  "PAYMENT",
  "ROOM_BLOCK",
  "FB_MINIMUM",
  "CANCELLATION",
  "FINAL_GUARANTEE",
  "OTHER_DEADLINE",
]);
export const clauseStatus = pgEnum("clause_status", [
  "PROPOSED",
  "CONFIRMED",
  "REJECTED",
]);
export const extractionStatus = pgEnum("extraction_status", [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "NOT_APPLICABLE",
]);
export const pickupSource = pgEnum("pickup_source", ["MANUAL", "CSV", "EMAIL"]);
export const obligationKind = pgEnum("obligation_kind", [
  "PAYMENT",
  "CUTOFF",
  "REVIEW",
  "GUARANTEE",
  "TIER_CHANGE",
  "OTHER",
]);
export const obligationStatus = pgEnum("obligation_status", [
  "OPEN",
  "DONE",
  "WAIVED",
  "SUPERSEDED",
]);
export const alertSeverity = pgEnum("alert_severity", [
  "HIGH",
  "WATCH",
  "INFO",
]);
export const alertStatus = pgEnum("alert_status", [
  "OPEN",
  "DECIDED",
  "AUTO_RESOLVED",
]);
export const decisionType = pgEnum("decision_type", [
  "RELEASED_INVENTORY",
  "RENEGOTIATED",
  "ACCEPTED_RISK",
  "CLIENT_INFORMED",
  "OTHER",
]);
export const changeType = pgEnum("change_type", [
  "HEADCOUNT",
  "ADD_FUNCTION",
  "REMOVE_FUNCTION",
  "UPGRADE",
  "CANCEL_ELEMENT",
  "OTHER",
]);
export const changeStatus = pgEnum("change_status", [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SENT_TO_CLIENT",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
  "APPLIED",
]);
export const requesterType = pgEnum("requester_type", ["INTERNAL", "CLIENT"]);
export const taskStatus = pgEnum("task_status", ["OPEN", "DONE"]);
export const actorType = pgEnum("actor_type", ["USER", "CLIENT", "SYSTEM"]);
export const penaltyCategory = pgEnum("penalty_category", [
  "ATTRITION",
  "FB_SHORTFALL",
  "CANCELLATION",
  "OTHER",
]);

// Money columns: bigint minor units, safe as JS numbers up to 9e15.
const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Organisation & auth (auth tables follow Better Auth's expected shape)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  baseCurrency: char("base_currency", { length: 3 }).notNull(),
  timezone: text("timezone").notNull(),
  config: jsonb("config").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    orgId: uuid("org_id").references(() => organizations.id),
    role: userRole("role").notNull().default("EVENT_MANAGER"),
    status: userStatus("status").notNull().default("ACTIVE"),
    calendarTokenHash: text("calendar_token_hash"),
    /** Per-user UI preferences, validated by src/services/preferences.ts (currently { wallpaper }). */
    preferences: jsonb("preferences").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("users_org_idx").on(t.orgId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Clients & agreements
// ---------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    industry: text("industry"),
    billingContactName: text("billing_contact_name"),
    billingContactEmail: text("billing_contact_email"),
    notes: text("notes"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_org_idx").on(t.orgId, t.name)],
);

export const clientAgreements = pgTable(
  "client_agreements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    documentFileId: uuid("document_file_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agreements_client_idx").on(t.clientId, t.effectiveFrom)],
);

export const liabilityRules = pgTable(
  "liability_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => clientAgreements.id, { onDelete: "cascade" }),
    category: liabilityCategory("category").notNull(),
    bearer: bearer("bearer").notNull(),
    // Agency share (0-100) when bearer = SPLIT.
    agencyPct: integer("agency_pct").notNull().default(0),
  },
  (t) => [uniqueIndex("liability_rules_unique").on(t.agreementId, t.category)],
);

// ---------------------------------------------------------------------------
// Events, suppliers, contracts, clauses
// ---------------------------------------------------------------------------

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    destination: text("destination"),
    timezone: text("timezone").notNull(),
    status: eventStatus("status").notNull().default("PLANNING"),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    forecastAttendance: integer("forecast_attendance").notNull().default(0),
    baseCurrency: char("base_currency", { length: 3 }).notNull(),
    exposureThresholdMinor: money("exposure_threshold_minor"),
    /** Key into COVERS in src/config/imagery.ts; null shows the plain midnight banner. */
    coverImage: text("cover_image"),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_org_status_idx").on(t.orgId, t.status, t.startDate)],
);

export const eventMembers = pgTable(
  "event_members",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    type: supplierType("type").notNull(),
    city: text("city"),
    country: text("country"),
    // lower(name)|lower(city) with punctuation stripped, for duplicate detection
    normalizedKey: text("normalized_key").notNull(),
    contacts: jsonb("contacts")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suppliers_org_key_idx").on(t.orgId, t.normalizedKey)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id"),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    hasTextLayer: boolean("has_text_layer"),
    pageCount: integer("page_count"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("files_owner_idx").on(t.ownerType, t.ownerId)],
);

/** A set of contract PDFs imported together for one event (bulk import, milestone 14). */
export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("import_batches_event_idx").on(t.eventId)],
);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    title: text("title").notNull(),
    reference: text("reference"),
    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    status: contractStatus("status").notNull().default("DRAFT"),
    signedDate: date("signed_date", { mode: "string" }),
    currency: char("currency", { length: 3 }).notNull(),
    contractedValueMinor: money("contracted_value_minor").notNull().default(0),
    documentFileId: uuid("document_file_id").references(() => files.id),
    /** Set when the contract was created by a bulk import (import_batches). */
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, { onDelete: "set null" }),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contracts_event_idx").on(t.eventId, t.status)],
);

export const extractionRuns = pgTable(
  "extraction_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id),
    model: text("model"),
    status: extractionStatus("status").notNull().default("QUEUED"),
    reason: text("reason"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Model calls made for this run; busy/overloaded responses are retried with backoff. */
    attempts: integer("attempts").notNull().default(0),
    /** A retried run waits in QUEUED until this time. */
    nextAttemptAt: ts("next_attempt_at"),
    proposedCount: integer("proposed_count").notNull().default(0),
    confirmedCount: integer("confirmed_count").notNull().default(0),
    editedCount: integer("edited_count").notNull().default(0),
    rejectedCount: integer("rejected_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("extraction_runs_contract_idx").on(t.contractId), index("extraction_runs_queue_idx").on(t.status, t.createdAt)],
);

export const clauses = pgTable(
  "clauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    type: clauseType("type").notNull(),
    label: text("label").notNull(),
    status: clauseStatus("status").notNull().default("PROPOSED"),
    // Contract terms, validated per type by src/core/clauses (nights, tiers, rates…).
    // Confirmed by a human; changing them after confirmation is audited.
    data: jsonb("data").notNull(),
    // Planner inputs that are not contract terms (F&B forecast, pickup projection method).
    // Editable at any time without re-confirming the clause.
    inputs: jsonb("inputs")
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Per-field source evidence from extraction: { field: { quote, page, verified } }
    sources: jsonb("sources")
      .notNull()
      .default(sql`'{}'::jsonb`),
    extractionRunId: uuid("extraction_run_id").references(
      () => extractionRuns.id,
    ),
    // True once a human changed any extracted value before confirming
    edited: boolean("edited").notNull().default(false),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: ts("confirmed_at"),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clauses_contract_idx").on(t.contractId, t.status)],
);

// ---------------------------------------------------------------------------
// Pickup
// ---------------------------------------------------------------------------

export const pickupSnapshots = pgTable(
  "pickup_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    clauseId: uuid("clause_id")
      .notNull()
      .references(() => clauses.id, { onDelete: "cascade" }),
    capturedAt: ts("captured_at").notNull(),
    source: pickupSource("source").notNull(),
    fileId: uuid("file_id").references(() => files.id),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("pickup_snapshots_clause_idx").on(t.clauseId, t.capturedAt)],
);

/**
 * A read-only link the agency sends its client (milestone 14): the client's share of penalties,
 * dates that raise their costs, and changes awaiting their approval. Only the token's hash is
 * stored; the link is shown once when created.
 */
export const clientShareLinks = pgTable(
  "client_share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    lastViewedAt: ts("last_viewed_at"),
    viewCount: integer("view_count").notNull().default(0),
  },
  (t) => [uniqueIndex("client_share_links_hash_idx").on(t.tokenHash), index("client_share_links_client_idx").on(t.clientId)],
);

/**
 * An email address a hotel's pickup report can be sent to, for one room block (milestone 14).
 * The token is stored as-is because people need to see and copy the address again; a leaked
 * address can only submit booking numbers, which the optional sender domain limits, and it can
 * be rotated at any time.
 */
export const pickupInbound = pgTable(
  "pickup_inbound",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    clauseId: uuid("clause_id")
      .notNull()
      .references(() => clauses.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    /** Column mapping saved from a sample report: CsvMapping plus an optional sheet name. */
    mapping: jsonb("mapping").notNull(),
    allowedSenderDomain: text("allowed_sender_domain"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
    lastReceivedAt: ts("last_received_at"),
    /** { ok, message, filename } for the latest report received, shown on the Exposure tab. */
    lastResult: jsonb("last_result"),
  },
  (t) => [uniqueIndex("pickup_inbound_token_idx").on(t.token), index("pickup_inbound_clause_idx").on(t.clauseId)],
);

export const pickupValues = pgTable(
  "pickup_values",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => pickupSnapshots.id, { onDelete: "cascade" }),
    nightDate: date("night_date", { mode: "string" }).notNull(),
    roomsPickedUp: integer("rooms_picked_up").notNull(),
    forecastFinal: integer("forecast_final"),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.nightDate] })],
);

// ---------------------------------------------------------------------------
// Obligations, payments, exposure, alerts, decisions
// ---------------------------------------------------------------------------

export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    clauseId: uuid("clause_id").references(() => clauses.id, {
      onDelete: "cascade",
    }),
    kind: obligationKind("kind").notNull(),
    label: text("label").notNull(),
    dueAt: ts("due_at").notNull(),
    dueTz: text("due_tz").notNull(),
    amountMinor: money("amount_minor"),
    currency: char("currency", { length: 3 }),
    ownerId: uuid("owner_id").references(() => users.id),
    status: obligationStatus("status").notNull().default("OPEN"),
    doneAt: ts("done_at"),
    doneBy: uuid("done_by").references(() => users.id),
    waivedReason: text("waived_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("obligations_org_due_idx").on(t.orgId, t.status, t.dueAt),
    index("obligations_owner_idx").on(t.ownerId, t.dueAt),
    index("obligations_event_idx").on(t.eventId),
    index("obligations_contract_idx").on(t.contractId, t.kind),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligations.id, { onDelete: "cascade" }),
    paidAt: date("paid_at", { mode: "string" }).notNull(),
    amountMinor: money("amount_minor").notNull(),
    reference: text("reference"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("payments_obligation_idx").on(t.obligationId)],
);

export const exposureSnapshots = pgTable(
  "exposure_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    takenAt: ts("taken_at").notNull(),
    trigger: text("trigger").notNull(),
    complete: boolean("complete").notNull(),
    currentMinor: money("current_minor").notNull(),
    cancellationMinor: money("cancellation_minor").notNull(),
    agencyMinor: money("agency_minor").notNull(),
    clientMinor: money("client_minor").notNull(),
    unassignedMinor: money("unassigned_minor").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("exposure_snapshots_event_idx").on(t.eventId, t.takenAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    obligationId: uuid("obligation_id").references(() => obligations.id, {
      onDelete: "set null",
    }),
    contractId: uuid("contract_id").references(() => contracts.id, {
      onDelete: "set null",
    }),
    rule: text("rule").notNull(),
    severity: alertSeverity("severity").notNull(),
    status: alertStatus("status").notNull().default("OPEN"),
    title: text("title").notNull(),
    detail: jsonb("detail")
      .notNull()
      .default(sql`'{}'::jsonb`),
    dedupeKey: text("dedupe_key").notNull(),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
    closedNote: text("closed_note"),
  },
  (t) => [
    uniqueIndex("alerts_dedupe_idx").on(t.orgId, t.dedupeKey),
    index("alerts_org_status_idx").on(t.orgId, t.status),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    alertId: uuid("alert_id").references(() => alerts.id, {
      onDelete: "set null",
    }),
    changeRequestId: uuid("change_request_id"),
    type: decisionType("type").notNull(),
    note: text("note"),
    exposureDeltaMinor: money("exposure_delta_minor"),
    currency: char("currency", { length: 3 }),
    /** Facts recorded with the decision, e.g. { roomNights, releases, reviewDate, rule } for rooms given back. */
    detail: jsonb("detail"),
    byUserId: uuid("by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("decisions_event_idx").on(t.eventId)],
);

// ---------------------------------------------------------------------------
// Change control
// ---------------------------------------------------------------------------

export const changeRequests = pgTable(
  "change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    type: changeType("type").notNull(),
    reason: text("reason"),
    status: changeStatus("status").notNull().default("DRAFT"),
    attendanceDelta: integer("attendance_delta").notNull().default(0),
    requestedByType: requesterType("requested_by_type")
      .notNull()
      .default("INTERNAL"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    submittedAt: ts("submitted_at"),
    internalApprovalRequired: boolean("internal_approval_required")
      .notNull()
      .default(false),
    internalApprovalReason: text("internal_approval_reason"),
    internalApprovedBy: uuid("internal_approved_by").references(() => users.id),
    internalApprovedAt: ts("internal_approved_at"),
    internalNote: text("internal_note"),
    clientDecidedAt: ts("client_decided_at"),
    appliedAt: ts("applied_at"),
    // Exposure impact computed at submission, kept for the record
    impact: jsonb("impact"),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("change_requests_number_idx").on(t.orgId, t.number),
    index("change_requests_event_idx").on(t.eventId, t.status),
  ],
);

export const changeLines = pgTable("change_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  changeRequestId: uuid("change_request_id")
    .notNull()
    .references(() => changeRequests.id, { onDelete: "cascade" }),
  contractId: uuid("contract_id").references(() => contracts.id),
  category: text("category").notNull(),
  description: text("description").notNull(),
  costDeltaMinor: money("cost_delta_minor").notNull(),
  priceDeltaMinor: money("price_delta_minor").notNull(),
  position: integer("position").notNull().default(0),
});

export const approvalTokens = pgTable(
  "approval_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    changeRequestId: uuid("change_request_id")
      .notNull()
      .references(() => changeRequests.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    revokedAt: ts("revoked_at"),
    outcome: text("outcome"),
    approverName: text("approver_name"),
    comment: text("comment"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("approval_tokens_hash_idx").on(t.tokenHash)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    changeRequestId: uuid("change_request_id").references(
      () => changeRequests.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").references(() => users.id),
    dueAt: ts("due_at"),
    status: taskStatus("status").notNull().default("OPEN"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("tasks_owner_idx").on(t.ownerId, t.status)],
);

export const actualPenalties = pgTable("actual_penalties", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  category: penaltyCategory("category").notNull(),
  amountMinor: money("amount_minor").notNull(),
  invoiceRef: text("invoice_ref"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Notifications, audit, views, FX
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: ts("read_at"),
    emailedAt: ts("emailed_at"),
    emailError: text("email_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey),
    index("notifications_user_idx").on(t.userId, t.readAt),
  ],
);

// ---------------------------------------------------------------------------
// Event team threads: one discussion per event, visible to whoever can see the event.
// ---------------------------------------------------------------------------

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    lastMessageAt: ts("last_message_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("threads_event_idx").on(t.eventId), index("threads_org_last_idx").on(t.orgId, t.lastMessageAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    /** Optional link to a record the message is about (contract, obligation, change request). */
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    createdAt: createdAt(),
    editedAt: ts("edited_at"),
  },
  (t) => [index("messages_thread_idx").on(t.threadId, t.createdAt)],
);

export const threadReads = pgTable(
  "thread_reads",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    actorType: actorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    actorLabel: text("actor_label"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    eventId: uuid("event_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    diff: jsonb("diff"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entityType, t.entityId, t.at),
    index("activity_event_idx").on(t.eventId, t.at),
  ],
);

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entity: text("entity").notNull(),
  name: text("name").notNull(),
  state: jsonb("state").notNull(),
  createdAt: createdAt(),
});

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    fromCcy: char("from_ccy", { length: 3 }).notNull(),
    toCcy: char("to_ccy", { length: 3 }).notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    asOf: date("as_of", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fx_rates_pair_idx").on(t.orgId, t.fromCcy, t.toCcy)],
);
