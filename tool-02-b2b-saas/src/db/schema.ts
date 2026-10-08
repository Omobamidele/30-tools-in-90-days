import { pgTable, pgEnum, uuid, text, integer, bigint, boolean, timestamp, date, jsonb, uniqueIndex, index, char } from "drizzle-orm/pg-core";
import { ROLE_KEYS, RULE_TYPES } from "@/config/schema";
import { CSQL_STATUSES, SIGNAL_STATUSES } from "@/core/workflow";

// ---------------------------------------------------------------------------
// Conventions: every business table has org_id; money is bigint minor units beside the org's
// currency; timestamps are timestamptz; calendar days (usage) are `date`.
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ROLE_KEYS);
export const userStatus = pgEnum("user_status", ["ACTIVE", "DEACTIVATED"]);
export const ruleType = pgEnum("rule_type", RULE_TYPES);
export const signalStatus = pgEnum("signal_status", SIGNAL_STATUSES);
export const csqlStatus = pgEnum("csql_status", CSQL_STATUSES);
export const usageSource = pgEnum("usage_source", ["API", "CSV", "SIMULATED"]);
export const seniority = pgEnum("seniority", ["EXEC", "VP", "DIRECTOR", "MANAGER", "IC"]);
export const actorType = pgEnum("actor_type", ["USER", "SYSTEM", "API"]);
export const keyKind = pgEnum("key_kind", ["INGEST", "CRM"]);
export const deliveryStatus = pgEnum("delivery_status", ["PENDING", "DELIVERED", "FAILED"]);

const money = (name: string) => bigint(name, { mode: "number" });
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => organizations.id);

// ---------------------------------------------------------------------------
// Organisation & auth (auth tables follow Better Auth's expected shape)
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: char("currency", { length: 3 }).notNull(),
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
    role: userRole("role").notNull().default("CSM"),
    status: userStatus("status").notNull().default("ACTIVE"),
    /** Per-user preferences: { emailNotifications, digest }. */
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

export const authAccounts = pgTable(
  "auth_accounts",
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
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
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

/** Segment round-robin queues for routing (spec FR-16). Members are seller user ids. */
export const sellerQueues = pgTable(
  "seller_queues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    segment: text("segment").notNull(),
    name: text("name").notNull(),
    memberIds: uuid("member_ids").array().notNull().default([]),
    cursor: integer("cursor").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("seller_queues_segment_idx").on(t.orgId, t.segment)],
);

// ---------------------------------------------------------------------------
// Customers: accounts, contacts, subscriptions, usage
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    name: text("name").notNull(),
    domain: text("domain"),
    segment: text("segment"),
    crmId: text("crm_id"),
    csmId: uuid("csm_id").references(() => users.id),
    ownerId: uuid("owner_id").references(() => users.id),
    /** Demo cover/industry tag for the account header; free text. */
    industry: text("industry"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_org_idx").on(t.orgId),
    uniqueIndex("accounts_crm_idx").on(t.orgId, t.crmId),
    uniqueIndex("accounts_domain_idx").on(t.orgId, t.domain),
    index("accounts_csm_idx").on(t.orgId, t.csmId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    seniority: seniority("seniority"),
    firstSeenOn: date("first_seen_on", { mode: "string" }),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_account_idx").on(t.accountId), uniqueIndex("contacts_email_idx").on(t.orgId, t.email)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    seatsPurchased: integer("seats_purchased").notNull().default(0),
    creditsCommitted: integer("credits_committed").notNull().default(0),
    termStart: date("term_start", { mode: "string" }).notNull(),
    termEnd: date("term_end", { mode: "string" }).notNull(),
    arrMinor: money("arr_minor").notNull(),
    addons: text("addons").array().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("subscriptions_account_idx").on(t.accountId)],
);

export const usageSnapshots = pgTable(
  "usage_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    activeSeats: integer("active_seats").notNull(),
    creditsUsedTerm: integer("credits_used_term").notNull().default(0),
    workspaces: jsonb("workspaces").notNull().default([]),
    gatedAttempts: jsonb("gated_attempts").notNull().default({}),
    openEscalations: integer("open_escalations").notNull().default(0),
    source: usageSource("source").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usage_account_date_idx").on(t.accountId, t.date), index("usage_org_date_idx").on(t.orgId, t.date)],
);

// ---------------------------------------------------------------------------
// Rules, signals, CSQLs
// ---------------------------------------------------------------------------

export const signalRules = pgTable(
  "signal_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    key: text("key").notNull(),
    type: ruleType("type").notNull(),
    name: text("name").notNull(),
    params: jsonb("params").notNull(),
    weight: integer("weight").notNull().default(10),
    minArrMinor: money("min_arr_minor").notNull().default(0),
    segments: text("segments").array().notNull().default([]),
    cooldownDays: integer("cooldown_days").notNull().default(30),
    enabled: boolean("enabled").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("signal_rules_key_idx").on(t.orgId, t.key)],
);

export const signalRuleVersions = pgTable(
  "signal_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => signalRules.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    note: text("note").notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    changedAt: createdAt(),
  },
  (t) => [uniqueIndex("signal_rule_versions_idx").on(t.ruleId, t.version)],
);

export const csqls = pgTable(
  "csqls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    number: integer("number").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    sourcedBy: uuid("sourced_by")
      .notNull()
      .references(() => users.id),
    ownerId: uuid("owner_id").references(() => users.id),
    routedReason: text("routed_reason").notNull(),
    status: csqlStatus("status").notNull().default("ROUTED"),
    handoffNote: text("handoff_note").notNull(),
    contactId: uuid("contact_id").references(() => contacts.id),
    estValueMinor: money("est_value_minor"),
    adjustedValueMinor: money("adjusted_value_minor"),
    clockStartedAt: ts("clock_started_at"),
    dueAt: ts("due_at"),
    acceptedAt: ts("accepted_at"),
    returnReason: text("return_reason"),
    opportunity: jsonb("opportunity"),
    outcomeAmountMinor: money("outcome_amount_minor"),
    outcomeReason: text("outcome_reason"),
    closedAt: ts("closed_at"),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("csqls_number_idx").on(t.orgId, t.number),
    index("csqls_owner_idx").on(t.orgId, t.ownerId, t.status),
    index("csqls_account_idx").on(t.accountId),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => signalRules.id),
    ruleVersion: integer("rule_version").notNull(),
    type: ruleType("type").notNull(),
    status: signalStatus("status").notNull().default("NEW"),
    detectedAt: ts("detected_at").notNull(),
    lastEvaluatedAt: ts("last_evaluated_at").notNull(),
    /** Last date the condition held; drives expiry (spec FR-10). */
    conditionLastTrueOn: date("condition_last_true_on", { mode: "string" }).notNull(),
    explanation: text("explanation").notNull(),
    evidence: jsonb("evidence").notNull(),
    trace: jsonb("trace"),
    valueKind: text("value_kind").notNull(),
    estValueMinor: money("est_value_minor"),
    valueWorking: text("value_working").notNull(),
    priority: integer("priority").notNull(),
    priorityLines: jsonb("priority_lines").notNull(),
    /** Who triages it: null means the account's CSM (a CS leader can hand it to someone else). */
    assigneeId: uuid("assignee_id").references(() => users.id),
    triageDueAt: ts("triage_due_at").notNull(),
    triagedBy: uuid("triaged_by").references(() => users.id),
    triagedAt: ts("triaged_at"),
    dismissReason: text("dismiss_reason"),
    dismissNote: text("dismiss_note"),
    snoozeUntil: date("snooze_until", { mode: "string" }),
    csqlId: uuid("csql_id").references(() => csqls.id),
    lockVersion: integer("lock_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("signals_queue_idx").on(t.orgId, t.status, t.priority),
    index("signals_account_idx").on(t.accountId, t.type, t.status),
    index("signals_csql_idx").on(t.csqlId),
  ],
);

// ---------------------------------------------------------------------------
// Collaboration, audit, notifications
// ---------------------------------------------------------------------------

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("notes_entity_idx").on(t.entityType, t.entityId)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    actorType: actorType("actor_type").notNull().default("USER"),
    actorId: uuid("actor_id").references(() => users.id),
    actorLabel: text("actor_label").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    accountId: uuid("account_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    data: jsonb("data"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("activity_entity_idx").on(t.entityType, t.entityId), index("activity_account_idx").on(t.accountId, t.at), index("activity_org_idx").on(t.orgId, t.at)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    /** Prevents duplicate reminders for the same deadline (spec §8 jobs are idempotent). */
    dedupeKey: text("dedupe_key"),
    readAt: ts("read_at"),
    emailStatus: text("email_status"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt), uniqueIndex("notifications_dedupe_idx").on(t.userId, t.dedupeKey)],
);

// ---------------------------------------------------------------------------
// Integrations: keys, webhooks, imports
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    kind: keyKind("kind").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.hash)],
);

export const ingestBatches = pgTable(
  "ingest_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    source: usageSource("source").notNull(),
    keyId: uuid("key_id").references(() => apiKeys.id),
    accepted: integer("accepted").notNull(),
    rejected: integer("rejected").notNull(),
    errors: jsonb("errors").notNull().default([]),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [index("ingest_batches_org_idx").on(t.orgId, t.receivedAt)],
);

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: orgId(),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: text("events").array().notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: createdAt(),
});

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: orgId(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    status: deliveryStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    responseCode: integer("response_code"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt)],
);

export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: orgId(),
  kind: text("kind").notNull(),
  filename: text("filename").notNull(),
  created: integer("created").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  rejected: integer("rejected").notNull().default(0),
  errors: jsonb("errors").notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});
