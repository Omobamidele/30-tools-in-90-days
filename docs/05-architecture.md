# Phase 5 — Technical architecture: Expansion Signal Desk

## 1. What the requirements demand
- **Multi-tenant relational data** with strict org scoping: accounts → subscriptions → daily usage → signals → CSQLs → outcomes.
- **A deterministic, explainable rules engine.** Every signal must be reproducible from stored inputs (NFR-2), and rules are versioned.
- **State machines** with optimistic locking: signals and CSQLs.
- **Time-based automation:**
  - daily detection
  - deadline reminders and escalation in business days, in the org's timezone
  - snooze wake-ups, expiry
  - the Monday digest
  - webhook retries
- **Machine interfaces:** a usage ingest API, an inbound CRM update, and outbound signed webhooks.
- **Server-rendered screens** that load fast on camera, plus a few interactive client components (sheets, filters, the rule editor preview).

## 2. Stack decisions

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 App Router, React 19, TypeScript** | Server components for fast data-heavy pages; Server Actions for mutations; route handlers for the APIs. Proven in Tool 01, so the team isn't learning a stack and building a product at once |
| DB | **Postgres 17 + Drizzle ORM** | Relational integrity, `jsonb` for evidence and config, `FOR UPDATE SKIP LOCKED` for job claims, typed queries |
| Auth | **Better Auth** (email + password, sessions) | Self-hosted, works without email configured; roles live on our `users` table |
| Validation | **Zod 4** | One schema for forms, APIs, config and rule parameters |
| Styling | **Tailwind v4 tokens** from docs/09 | Tokens map 1:1 to the design system; white-label colours are CSS variables |
| UI primitives | **Radix** (dialog/sheet, dropdown, tabs, popover), **cmdk**, **Phosphor** | Accessible behaviour without a component library's look |
| Jobs | **node-cron** runner + `/api/cron/*` (bearer) | Runs locally as a process, or via Vercel Cron when hosted |
| Email | **Nodemailer → SMTP** (Mailpit locally), Resend driver | Same adapter as Tool 01 |
| Logging | **pino** | Structured logs, with a reference code shown on errors |
| Tests | **Vitest** (core unit + integration against a test DB), **Playwright + axe** (e2e, accessibility) | As Tool 01 |

**Not used:** no queue service (Postgres covers the volume), no charting library (the trace is a small SVG we own), no AI in the MVP (spec §15).

## 3. System overview

```
             ┌──────────────┐   POST /api/ingest/usage (bearer INGEST key)
 Product /   │ Ingest API   │──► usage_snapshots (upsert per account+date) ──┐
 warehouse ─►│ + CSV import │                                                │
             └──────────────┘                                                ▼
                                                     ┌──────────────────────────────┐
 Scheduler (node-cron / Vercel Cron) ───────────────►│ Detection engine (src/core)  │
                                                     │ pure functions: rules ×      │
                                                     │ snapshots → candidate signals│
                                                     └──────────────┬───────────────┘
                                                                    ▼
                         services/signals (dedupe, cooldown, expiry, priority, notify)
                                                                    ▼
          CSM triage (Server Actions) ─► services/csqls (routing, deadlines, state machine)
                                                                    ▼
             notifications (in-app + email) · activity_log · webhooks out (HMAC, retried)
                                                                    ▲
                 POST /api/crm/opportunity-update (bearer CRM key) ─┘
```

## 4. Repository layout

```
app/                     Next.js routes
  (app)/                 signed-in shell: overview, signals, csqls, accounts, results, rules, settings
  api/ingest/usage       usage ingest (route handler)
  api/crm/opportunity-update
  api/cron/[job]         daily | hourly | weekly (bearer CRON_SECRET)
  api/reports/[name]     CSV exports
  sign-in/
config/clients/demo.json Fernway demo tenant (branding, terminology, price book, rules, routing)
src/
  core/                  pure, framework-free, 100% unit-tested
    rules/               rule types: evaluate(snapshotWindow, subscription, params) → candidate | null
    value.ts             estimated value per rule type from the price book
    priority.ts          score + breakdown
    business-time.ts     business-day deadlines in an org timezone
    signal-state.ts      allowed transitions
    csql-state.ts        allowed transitions
    routing.ts           owner → segment round-robin → fallback
  services/              org-scoped use cases (ctx with actor + clock)
  db/                    schema, migrations, seed, demo seed
  auth/                  Better Auth, policy matrix (spec §9)
  adapters/              email, webhook sender
  jobs/                  runner + job definitions
  ui/                    design-system components (trace, tag, money, sheet, board)
scripts/
  simulate-usage.mjs     posts SIMULATED aggregates through the real ingest API
tests/core, tests/integration, e2e/
```

## 5. Data layer
- **Schema** as in spec §8. Every table has `org_id`; every service call takes a `ServiceCtx { db, actor, now() }` and filters by the actor's org.
- **Money:** `bigint` minor units with a `char(3)` currency. One currency per org in the MVP.
- **`usage_snapshots`:**
  - unique `(account_id, date)`; upserts record `source`
  - index `(org_id, account_id, date desc)` to read a 90-day window per account
- **Detection reads windows in bulk** (one query per batch of accounts), never one query per account (NFR-1).
- **Optimistic locking** on signals and CSQLs (`lock_version`). Every state change writes `activity_log` in the same transaction.
- **API keys** are stored as SHA-256 hashes with a visible prefix (`esd_live_ab12…`), shown once.

## 6. Detection engine (core)
- **Each rule type is a pure function:**
  `(window: Snapshot[], sub: Subscription, contacts: Contact[], params, today) → { explanation, evidence, valueInputs } | null`
- `value.ts` turns `valueInputs` plus the price book into an estimated value, or `null` with a reason.
- `priority.ts` returns `{ score, lines: string[] }`. The lines are the breakdown shown in the UI.
- **The service layer does the stateful parts:**
  - dedupe: one open signal per account and rule
  - attach to an open CSQL
  - cooldown, with the material-change override
  - expiry after 7 days of the condition not holding
  - the stale-data block
- **Rule versions:** signals store `rule_version`, and parameters are snapshotted into the evidence.

## 7. Authentication and authorisation
- **Better Auth** handles sessions. `users.role` is one of ADMIN, REVOPS, CS_LEAD, CSM, SALES_LEAD, SELLER, EXEC.
- **`can(actor, action, scope)`** implements the spec §9 matrix. Book scoping (CSM = own accounts; SELLER = owned or routed CSQLs) is applied in queries, not just in the UI.
- **Public endpoints** (`/api/ingest`, `/api/crm`) authenticate by key, resolve the org from the key, and are rate-limited per key and per IP.

## 8. Jobs and automation

| Job | Schedule | Work |
|---|---|---|
| `daily` | 06:00 per org timezone (runner checks hourly) | Detection for all accounts, expiry, snooze wake-ups |
| `hourly` | Every hour | Deadline reminders and escalations; webhook retries |
| `weekly` | Monday 07:00 org time | Digest emails |
| after ingest | After each ingest batch | Detection for the accounts in the batch (`after()`) |

Jobs are idempotent: reminders are deduplicated by (entity, kind, deadline), and detection is safe to re-run.

## 9. Integrations
- **Ingest:** `POST /api/ingest/usage` with `{ rows: [{ account: { crmId | domain }, date, activeSeats, creditsUsedTerm, workspaces[], gatedAttempts{} }] }`. It answers `200 { accepted, rejected: [{index, reason}] }`.
- **CRM inbound:** `POST /api/crm/opportunity-update` with `{ csql: number | crmRef, stage?, amount?, outcome?, reason? }`.
- **Webhooks out:**
  - the JSON body is signed in an `X-Signature: sha256=<hmac>` header
  - deliveries are stored and retried on the schedule in spec A10
  - a "Send test" button is in Settings
- **Simulator** (`scripts/simulate-usage.mjs`):
  - generates plausible daily aggregates for the demo accounts (trends, plateaus, a few crossings)
  - posts them **through the ingest API** with `source: "SIMULATED"`
  - is the only source of demo usage. Clearly isolated (spec §10, NFR-7)

## 10. Error handling and logging
- Domain errors (`notFound`, `forbidden`, `invalidState`, `conflict`) map to user messages. Server Actions return `{ ok, error }`; there are no thrown errors in the UI.
- Unexpected errors are logged with pino under a short reference shown to the user.
- API handlers return 400 with field errors, 401 for a bad key, 429 when rate-limited, and 500 with a reference.

## 11. Environment and ports (fixed by /PORTS.md)

| Service | Port |
|---|---|
| App | **3002** (`next dev -p 3002`, `next start -p 3002`; never 3000) |
| Postgres | **5402** |
| Mailpit web UI | **4002** |
| Mailpit SMTP | **2502** |

**Environment variables:**
- `APP_URL`, `CLIENT_CONFIG`, `DATABASE_URL`, `TEST_DATABASE_URL`
- `BETTER_AUTH_SECRET`, `CRON_SECRET`
- `EMAIL_DRIVER`, `SMTP_URL`, `EMAIL_FROM`
- `LOG_LEVEL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`

All are validated at boot with Zod.

## 12. White-label mechanics
- `config/clients/<name>.json` is validated by a Zod schema and stored in `organizations.config`. It holds branding, terminology, price book, rules, routing, deadlines and dismissal reasons.
- The UI reads labels through `term(org, "csql")`.
- **Colours:**
  - `primaryColor` must be ≥4.5:1 with white
  - `accentColor` must be ≥3:1 on ink

  Both are checked at seed and in Settings.

## 13. Deployment
- **Local:** `docker compose up -d`, then `npm run db:migrate && npm run db:seed`, then `npm run demo`.
- **Hosted (later):** Vercel plus a managed Postgres (Neon). Cron via `vercel.ts`. No file storage is needed in the MVP (imports are parsed in memory).

## 14. Testing strategy
- **Core:** the rule functions, value, priority, business time, the state machines and routing, with hand-worked examples. Target 100% of statements.
- **Integration (test DB):**
  - org scoping and permissions
  - ingest validation and idempotency
  - detection, dedupe, cooldown and expiry
  - triage → CSQL → routing → deadlines
  - reminders and escalation with a fake clock
  - webhooks (signature, retry)
  - CRM inbound
  - results only counting recorded facts
- **E2E (Playwright, production build on :3002):**
  - the triage → seller → won loop
  - the rule edit preview
  - an axe sweep of every screen
- **Performance:** a script seeding 2,000 accounts × 90 days to time detection and the queue (NFR-1).

## 15. Build order (Phase 6 milestones)
1. Scaffold: ports, docker, env, auth, schema, design tokens, shell (top bar, rail), sign-in.
2. Core engine: rules, value, priority, business time, state machines, routing (unit tests).
3. Data in: accounts/subscriptions CSV import, ingest API and keys, simulator, demo seed.
4. Detection service + Signals queue, board and triage sheet.
5. CSQLs: routing, seller flow, deadlines, reminders, notifications, email.
6. Accounts list and detail with traces.
7. Results, rule tuning, rule editor with preview, CSV export.
8. Settings (price book, routing, deadlines, reasons, keys, webhooks, users), webhooks out, CRM inbound.
9. Overview, digest, onboarding checklist, command menu.
10. Hardening: e2e, axe, performance, polish pass, docs.

## 16. As built: deviations from this design

| Area | Designed | Built | Why |
|---|---|---|---|
| Navigation | Top bar plus icon rail | Top module bar plus a bottom bar on phones; no separate rail | The modules fit in one bar; a rail repeated it without adding anything |
| Triage | Slide-over sheet over the queue | A full signal page with the triage panel beside the evidence | The evidence (large trace, value working, priority lines) needs the space; on phones triage comes straight after it |
| Settings | Edit the price book, wording, deadlines and reasons in the app | Shown read-only from the client config; routing, keys, webhooks, imports and people are editable | Keeps one source of truth for white-label config in the MVP; in-app editing is on the roadmap |
| Accounts list | Bulk queries | Grouped signal counts plus a lateral "latest usage" lookup, paginated at 100 | Measured at 2,000 accounts (build log §8) |
| Demo data | Simulator script | The seed replays 12 weeks of work through the real services; the simulator posts further days through the HTTP API | Every demo number comes from the product's own code |
