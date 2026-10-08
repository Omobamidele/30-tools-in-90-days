# Phase 5 — Technical Architecture: Exposure Register

**Tool:** 01 · **Written:** 2026-09-23 · **Inputs:** [03-product-spec.md](03-product-spec.md), [04-ux-design.md](04-ux-design.md) · **Status:** Approved and built. See §18 for where the build differs from this design

Ports for this tool (see `/PORTS.md`): app **3001**, Postgres **5401**, local mail catcher UI **4001** / SMTP **2501**.

---

## 1. What the requirements demand of the stack

| Requirement (spec) | Architectural consequence |
|---|---|
| Exposure numbers must be correct and explainable (§4.7, NFR correctness) | A **pure, framework-free calculation core** with exhaustive unit tests. Integer money. No floating-point currency |
| Relational data with strong integrity: contracts → clauses → obligations → alerts → decisions (§8) | **PostgreSQL**. Foreign keys, check constraints, transactions, `jsonb` for per-type clause data |
| Dense, server-heavy screens with real-time recalculation (§4.11, UX) | Server-rendered React with server-side data access. Small client bundles except in the interactive views (review, scenario, timeline) |
| Scheduled reminders, escalations and snapshots that can be re-run safely (§11) | Scheduled HTTP-triggered jobs with dedupe keys. No always-on worker is required |
| LLM extraction with mandatory human confirmation (§4.5) | An asynchronous extraction pipeline, schema-constrained output, server-side quote verification |
| External approval without an account (§4.9) | Hashed, single-use, expiring tokens. A public route outside the authenticated shell |
| White-label per deployment (§14) | A validated config file per client plus environment variables. No forks |
| Agencies may self-host or use us to host | Nothing that locks it to one platform. Standard Postgres, S3-compatible or Blob storage, a Docker image option |

---

## 2. Stack decisions

| Layer | Choice | Why this, not the alternatives |
|---|---|---|
| Language | **TypeScript** (strict) | One language across the calculation core, server and UI. Types carry the clause schemas end to end |
| Web framework | **Next.js 16 (App Router)** on Node 24 | Server Components keep data access on the server. Server Actions give typed mutations. Route handlers cover cron, ICS and file endpoints. One deployable. *Rejected:* a separate SPA plus API (two deployables for a single-team internal tool); Remix (smaller ecosystem for the component set we need) |
| Database | **PostgreSQL 17** | Relational integrity, `jsonb` with check constraints, mature hosting everywhere. Local: Docker on 5401. Hosted: Neon (Vercel Marketplace) or any managed Postgres |
| Data access | **Drizzle ORM** + drizzle-kit migrations | Close to SQL (the exposure queries are explicit), typed, light at runtime, SQL migrations checked into git. *Rejected:* Prisma (a heavier runtime and less control over SQL for the reporting queries) |
| Validation | **Zod** | One schema per clause type, used by forms, server actions, the LLM output schema and DB writes |
| Auth | **Better Auth** (email and password; magic link later) with Postgres sessions | Self-hosted, which suits white-label deployments (no per-client third-party tenant). Organisation and roles stay in our own tables. *Rejected:* a hosted auth provider as the default (adds a vendor per deployment. Can be added later behind the same session interface if a client needs SSO) |
| UI | **Tailwind CSS v4** with tokens from Phase 4 as CSS variables; **Radix primitives** (via shadcn/ui source, restyled); **TanStack Table**; **cmdk** (command menu); **react-hook-form**; **Lucide** icons; **Public Sans** (self-hosted via `next/font`) | Accessible primitives we own and restyle, not a visual kit. TanStack Table for server-side sort, filter, pagination and pinned columns |
| PDF | **unpdf** (text extraction per page on the server) · **pdf.js viewer** (client-side rendering plus source highlighting in review) | Per-page text lets us anchor quotes to pages and detect scans (no text layer) |
| LLM | **Claude API** via `@anthropic-ai/sdk`, model **`claude-opus-5`**, adaptive thinking, structured outputs | See §6 |
| Email | Adapter: `smtp` (local Mailpit / any SMTP) · `resend` · `disabled` | The UI states honestly when email is disabled. Copying links always works |
| File storage | Adapter: `local` (./storage, gitignored) · `vercel-blob` (private) · `s3` (later) | Contracts are private documents. Always served through an authorised route, never public URLs |
| Scheduling | Idempotent job functions triggered by **Vercel Cron** in production and **node-cron** (`npm run jobs`) locally | No queue infrastructure needed at MVP volume |
| Dates | `timestamptz` in UTC; **@date-fns/tz** for supplier-local deadlines | Hotel cutoffs are defined in local time |
| Logging | **pino** (JSON), with a request/job correlation ID | IDs appear on error screens for support |
| Tests | **Vitest** (unit plus DB integration) · **Playwright** (end to end against :3001) | The calculation core gets the most tests |

---

## 3. System overview

```
                         ┌──────────────────────── Next.js app (:3001) ────────────────────────┐
 Browser (staff) ───────►│ App Router pages (RSC)      Server Actions (mutations)              │
                         │   │                              │                                  │
 Browser (client  ──────►│ /approve/[token] (public)   Route handlers: /api/cron/*, /api/ics/*, │
 approver)               │                             /api/files/*, /api/auth/*               │
                         │   └──────────────┬───────────────┘                                  │
                         │          Application services (use-cases, authorisation, audit)     │
                         │                  │                                                  │
                         │     ┌────────────┼──────────────────┬───────────────────┐           │
                         │   core/ (pure)  repositories      adapters: storage · email ·       │
                         │   exposure,     (Drizzle, org-    extraction (Claude) · clock        │
                         │   obligations,  scoped)                                              │
                         │   pricing                                                            │
                         └──────────────────┬──────────────────────────────┬───────────────────┘
                                            │                              │
                                   PostgreSQL (:5401)           Claude API · SMTP/Resend · Blob
 Scheduler (Vercel Cron / node-cron) ──► /api/cron/{daily,hourly} (secret-protected)
```

**Dependency rule.** `core/` imports nothing from the framework, the DB or adapters. Services orchestrate core, repositories and adapters. Pages and actions call services only.

---

## 4. Repository layout

```
tool-01-event-management/
  app/                       # Next.js routes
    (app)/                   # authenticated shell: overview, events, deadlines, changes, clients…
    approve/[token]/         # public client approval page
    api/cron/ api/ics/ api/files/ api/auth/
  src/
    core/                    # PURE: no I/O
      money.ts               # minor-unit arithmetic, rounding, formatting helpers
      clauses/               # zod schemas per clause type + validation (tier gaps/overlaps…)
      exposure/              # attrition, fb-shortfall, cancellation, allocation, scenario, fx
      obligations/           # generate obligations from confirmed clauses
      pricing/               # markup / fee rules for change requests
      changes/               # change-request state machine
    services/                # use-cases: contracts, extraction, pickup, exposure, alerts, changes…
    db/                      # drizzle schema, migrations, repositories, seed (demo workspace)
    adapters/                # storage/, email/, extraction/, clock.ts
    auth/                    # better-auth config, session helpers, policy (can())
    config/                  # org config schema (zod), loader, terminology helper
    jobs/                    # daily.ts, hourly.ts (idempotent), runner for node-cron
    ui/                      # design tokens, primitives, table, timeline, forms
  config/clients/            # demo.json (+ one file per deployment)
  tests/  e2e/
  docker-compose.yml         # postgres :5401, mailpit :4001/:2501
  .env.example
```

---

## 5. Data layer

- The schema follows spec §8 exactly. Every table has an `org_id` column, and **every repository function takes an `OrgContext`**. Queries without one don't compile (enforced by the type signature).
- Money is `bigint` columns mapped to JS `number` (safe up to 9×10¹⁵ minor units). Currency is a `char(3)` beside every amount.
- Clause `data` is `jsonb`, validated by the Zod schema for its `type` on every write. There's also a DB check constraint that `type` is in the known set.
- **Optimistic locking:** `contracts`, `clauses` and `change_requests` carry a `version int`. Updates run `WHERE version = $expected`, and a zero-row update raises a conflict error (spec edge case 17).
- **Audit:** services write `activity_log` rows in the same transaction as the change (entity, action, before → after diff).
- **Indexes:**
  - `obligations(org_id, status, due_at)`
  - `obligations(owner_id, due_at)`
  - `contracts(event_id, status)`
  - `clauses(contract_id, status)`
  - `alerts(org_id, status)`
  - `events(org_id, status, start_date)`
  - `pickup_snapshots(clause_id, captured_at desc)`
  - `notifications(dedupe_key)` unique
  - `approval_tokens(token_hash)` unique
- Seed: `npm run db:seed` loads the **demo workspace** (a fictional agency, clients, events and contracts), with `organizations.config.demo = true`, which drives the "Demo data" marker. It's never loaded in production unless explicitly requested.

---

## 6. Clause extraction pipeline

```
Upload (server action) → file stored → unpdf per-page text → has_text_layer?
   no  → run marked NOT_APPLICABLE (reason: scanned) → manual entry
   yes → extraction_runs row (QUEUED) → after() kicks off worker fn → RUNNING
        → Claude call (structured output) → validate with Zod → verify quotes
        → clauses inserted as PROPOSED → run SUCCEEDED → notify uploader
```

- **Model:** `claude-opus-5` with `thinking: {type: "adaptive"}`. Effort is configurable in Settings → Extraction (default `high`). The request is streamed and `finalMessage()` collects the result, because contracts can be long.
- **Structured output:** `output_config.format` with a JSON schema generated from the Zod clause schemas. The result is parsed and **re-validated with Zod** regardless.
- **Input:** page-delimited text (`<page number="4"> … </page>`). Contract text goes in the user turn as data. The system prompt says to extract only what the document states, to return `null` for missing values, and to quote the source verbatim with its page.
- **Quote verification (server-side):** each `source_quote` is whitespace- and case-normalised and searched for in the stated page, then in all pages. If it isn't found, the field is flagged `source_unverified` and the UI shows "No source text: verify manually". Confidence always comes from our own check, never the model's opinion of itself.
- **Safety and honesty:**
  - The output is data proposals only. The model can't trigger actions.
  - Nothing counts toward exposure until a human confirms it.
  - Prompt-injection text inside a contract can at worst produce wrong proposals, which the review screen exposes.
- **Refusals and failures:**
  - `stop_reason` is checked before reading content. A refusal or error marks the run `FAILED` with a plain-language reason, and manual entry stays available.
  - Server-side refusal fallback is enabled (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta), so a false-positive refusal falls back automatically.
  - The hourly job marks runs stuck in `RUNNING` for more than 15 minutes as `FAILED`, and the UI offers "Try again".
- **Accounting:** each run stores the model, input/output token usage, duration, and the proposed/confirmed/edited/rejected counts. The edit rate is the accuracy measure shown in Settings.
- **Privacy:** extraction is off unless `ANTHROPIC_API_KEY` is set **and** it's enabled in Settings. When off, no contract text leaves the deployment.

---

## 7. Calculation core

- Pure functions: `computeAttrition(block, pickup, method)`, `computeFbShortfall(clause, forecast)`, `computeCancellation(schedule, asOf, basisValues, depositsPaid)`, `allocate(line, liabilityRules)`, `runScenario(event, {attendanceDeltaPct, cancelOn})`, `convert(amount, fxTable)`.
- Every function returns either `{status: "COMPLETE", amountMinor, working}` or `{status: "INCOMPLETE", missing: [...]}`. The `working` object is what the UI's working drawer renders, so the explanation and the number can never disagree.
- Rounding: room shortfall uses `ceil(rooms × commit%)` as the committed count (documented). Monetary products are rounded half-up to minor units per line, then summed.
- Exposure is **calculated on read** for event and contract views (cheap at MVP scale) and **stored as snapshots** daily and on significant changes, for the portfolio overview, trends and post-event variance. The overview reads the latest snapshot plus a "recalculate" action, and a snapshot is re-taken inline after pickup imports, clause confirmation and applied changes.

---

## 8. Authentication and authorisation

- Better Auth email/password (argon2id hashing) with HTTP-only secure cookies and Postgres-backed sessions. Invitations use one-time tokens.
- `users.role` ∈ {`ADMIN`, `OPS_DIRECTOR`, `EVENT_MANAGER`, `FINANCE`, `MD`}. Display names come from config.
- **Policy module:** `can(actor, action, resource)` implements the spec §9 matrix. Event Managers are limited to events where they are the owner or listed in `event_members`. Every service method calls it, and UI visibility uses the same function, so the rules can't drift.
- The approval page is public but token-gated:
  - Tokens are 32 random bytes, and only their SHA-256 hash is stored.
  - Tokens are single use, expire, and are rate-limited per IP and per token.
  - Approver name, email, IP and user agent are recorded.
- ICS feed: `/api/ics/<secret>`. Only the hash is stored, it can be regenerated, and the feed is read-only.

---

## 9. Jobs and automation

| Job | Trigger | Does | Idempotency |
|---|---|---|---|
| `daily` | 06:00 org timezone (cron) | R1 snapshots · R2 reminders · R5 tier step-ups · R6 cutoff warnings · R10 delivered prompts | `notifications.dedupe_key` (e.g. `remind:{obligation}:{offset}`) |
| `hourly` | Hourly | R3 overdue escalation · R9 approval link expiry · stuck extraction runs | Dedupe keys plus status guards |
| On-event | Inside services | R4 threshold alerts after recalculation · R7 internal approval routing · R8 apply approved change | Transactional state transitions |

- `/api/cron/daily` and `/api/cron/hourly` require `Authorization: Bearer $CRON_SECRET`.
- Locally, `npm run jobs` runs node-cron with the same schedules. There's also `npm run jobs:once -- daily` for testing.
- The job clock is injectable (`adapters/clock.ts`), so tests can move time forward.

---

## 10. Integrations and adapters

| Adapter | Interface | Implementations |
|---|---|---|
| Storage | `put`, `get` (stream), `delete` | `local`, `vercel-blob` |
| Email | `send({to, subject, html, text})` → `{sent: boolean, reason?}` | `smtp`, `resend`, `disabled` |
| Extraction | `extract(pages, options)` → proposals and usage | `claude`, `unavailable` (returns a clear reason) |
| Pickup import | CSV parse plus column mapping | Built in (papaparse) |
| Calendar | ICS generation | Built in (ics) |

Settings → Integrations reports each adapter's live status (e.g. "Email: SMTP connected, last send 09:12" or "Extraction: not configured").

---

## 11. Error handling

- Domain errors are typed (`NotFound`, `Forbidden`, `Conflict`, `ValidationFailed`, `ExternalServiceFailed`, `IncompleteData`). Server actions return `{ok: true, data} | {ok: false, error}`, and the UI maps each error to the Phase 3 §13 wording.
- Unexpected errors are logged with the correlation ID. The user sees the recovery message plus the ID.
- Next.js `error.tsx` boundaries per route segment, so one failing panel doesn't blank the page where avoidable.
- External calls (Claude, email, blob) have timeouts and retries (the SDK handles Claude retries). Their failures are recorded on the owning record (extraction run, notification row) so they show in the UI.

---

## 12. File handling

- Uploads: PDF only for contracts (checked by magic bytes, not just the extension), 25 MB max, SHA-256 stored (duplicate upload detection per event), original filename kept.
- Download and view go through `/api/files/[id]`, which runs the authorisation check and streams from storage. There are no public URLs.
- CSV pickup imports: 5 MB max, parsed server-side, a preview before commit, and the source file kept on the snapshot.

---

## 13. Environment configuration

```
# App
APP_URL=http://localhost:3001
PORT=3001
CLIENT_CONFIG=demo                 # loads config/clients/demo.json on seed/boot
# Database
DATABASE_URL=postgres://er:er@localhost:5401/exposure_register
# Auth
BETTER_AUTH_SECRET=                # 32+ random bytes
# Jobs
CRON_SECRET=
# Storage
STORAGE_DRIVER=local               # local | vercel-blob
BLOB_READ_WRITE_TOKEN=
# Email
EMAIL_DRIVER=smtp                  # smtp | resend | disabled
SMTP_URL=smtp://localhost:2501
RESEND_API_KEY=
EMAIL_FROM="Exposure Register <no-reply@example.com>"
# Extraction
ANTHROPIC_API_KEY=                 # optional; extraction disabled if unset
EXTRACTION_MODEL=claude-opus-5
# Logging
LOG_LEVEL=info
```

Env vars are validated at boot with Zod. A missing *required* variable fails fast with a readable message. Missing *optional* integrations degrade to their `disabled` adapter with a visible status.

---

## 14. White-label mechanics

- `config/clients/<slug>.json` has these areas: brand, terminology, workflow lists, clause defaults, rules, pricing, roles, finance, email templates. It's validated by `src/config/schema.ts`.
- On seed or first boot it's written to `organizations.config`. After that, Settings edits the DB copy, and **Export config** writes the JSON back for version control.
- Brand colour is applied as the CSS variable `--brand` at the root layout. Contrast is checked in the config schema and in Settings.
- Terminology is resolved through `t("event", {plural})`, and all UI strings that refer to domain nouns use it.
- Logo and favicon are stored through the storage adapter.
- A new deployment needs: a config file, env vars, `db:migrate`, `db:seed --org-only`. No code changes.

---

## 15. Deployment

**Primary (hosted): Vercel + Neon Postgres + Vercel Blob + Vercel Cron + Resend.**
- Fluid Compute on Node (not Edge), because the PDF parsing and Anthropic SDK need Node APIs.
- `vercel.ts` declares the crons (`/api/cron/daily`, `/api/cron/hourly`).
- Migrations run in the build step against the target database, with preview deployments on Neon branches.
- The Vercel CLI isn't installed on this machine yet (`npm i -g vercel`). Deployment is a later step, not needed for local build.

**Alternative (self-hosted by an agency):** Next.js `output: "standalone"` Docker image, any Postgres, S3-compatible storage (adapter on the roadmap), and a system cron calling the two job endpoints.

**Local:** `docker compose up -d` (Postgres on 5401, Mailpit on 4001/2501) → `npm run db:migrate && npm run db:seed` → `npm run dev` (pinned: `next dev -p 3001`) → optionally `npm run jobs`.

---

## 16. Testing strategy

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | `core/` at 100% branch coverage: every formula, the rounding rules, and every spec §12 edge case as a named test |
| Integration | Vitest + a real Postgres (the separate `exposure_register_test` DB on the same container) | Repositories (org scoping, optimistic locking), services (contract activation → obligations → exposure → alerts), jobs with a fake clock (dedupe on re-run) |
| Extraction | Vitest with recorded fixtures | Schema validation, quote verification, refusal/failure paths. One opt-in live test (`EXTRACTION_LIVE=1`) against a sample contract |
| End to end | Playwright on :3001 | Happy paths: upload → review → activate; pickup CSV → alert → decision; change → internal approval → client link → applied; permissions (Event Manager can't see other teams' events); mobile viewport for Overview and the approval page |
| Data volume | Seed script `--large` | 200 events and 2,000 contracts to check the <1s overview target |

---

## 17. Build order (Phase 6 milestones)

Each milestone is run, tested, inspected and fixed before the next starts.

1. **Scaffold:** Next.js on :3001, tokens and shell, Docker Postgres, Drizzle schema and migrations, env validation, auth, seed organisation plus demo config.
2. **Calculation core:** clause schemas, exposure functions, allocation, scenarios, and the full unit test suite. No UI yet.
3. **Records:** clients and agreements (liability matrix), events, suppliers, contracts (versions), manual clause entry, obligations generation.
4. **Exposure UI:** event workspace, commitment timeline, exposure tab and working drawer, scenario panel, overview.
5. **Extraction:** upload, pdf text, the Claude pipeline, the review screen.
6. **Pickup and monitoring:** grid and CSV import, jobs, reminders, escalations, alerts and decisions, deadlines view, ICS.
7. **Change control:** editor, impact panel, internal approval, public approval page, apply.
8. **Post-event, reports, settings, search and command menu.**
9. **Hardening:** permission tests, edge cases, large dataset, responsive, accessibility, the polish pass.
10. **Docs:** README, the teaching playbook, commercialisation.

---

## 18. As built: deviations from this design

This design was written before the build. Where the build differs, it's recorded here rather than silently edited above, so the reasoning stays visible.

| Area | Designed | Built | Why / consequence |
|---|---|---|---|
| Password hashing | argon2id | Better Auth's default **scrypt** | A native-module-free hash that works on serverless. Still a memory-hard KDF |
| User onboarding | Invitation tokens | Admin creates the user with a **temporary password**. The user changes it at `/account` (other sessions are revoked) | Works without email configured. Invitations are on the roadmap |
| First admin | `db:seed --org-only` | Requires `SEED_ADMIN_EMAIL`, validates before writing, prints a random one-time password | The original draft reused the demo password, which is unsafe for real deployments |
| Storage | `local` + `vercel-blob` | **`local` only.** `vercel-blob` is reserved and fails with a clear message | Hosted uploads need this adapter first (roadmap 1) |
| Pickup CSV | Parsed server-side, source file kept | **Parsed in the browser** with mapping and preview. Only the mapped values are stored | No file storage needed for imports. The trade-off is no copy of the original file |
| Review screen | pdf.js viewer with source highlighting | The PDF in the browser's viewer with **page jump**. Source quotes are shown beside each field | Highlighting is on the roadmap. The quote is verified server-side either way |
| Overview data | Latest snapshot plus "recalculate" | **Calculated live** with a batched loader (a fixed number of queries for any number of events). Snapshots feed trends and post-event variance | 0.5–0.8s at 200 events and 2,000 contracts, so staleness wasn't worth introducing |
| Clause detail | Separate child tables for nights and tiers | Held in the clause's **`jsonb`**, validated by the per-type Zod schema | One write per clause keeps versioning simple. Pickup is still relational (`pickup_values`) |
| UI libraries | TanStack Table, react-hook-form | **Not used.** Plain server-rendered tables and controlled forms; the dependencies were removed | Tables are server-sorted lists with modest row counts. Forms submit to Server Actions |
| Clock | `adapters/clock.ts` | `ServiceCtx.now()`, plus a `now` argument on jobs | Same testability with less indirection |
| Approval rate limit | Per IP and per token, persistent | **In-memory, per IP** | Fine for a single instance. Needs a shared store if scaled out (roadmap) |
| Correlation IDs | On every request | Server-action failures get a **short reference** logged with pino and shown to the user. Render errors show the Next.js digest | Covers what users see. Per-request tracing is left to the host's logging |
| Cron | `vercel.ts` | Built. Daily runs at **10:00 UTC** (06:00 New York), to be adjusted per deployment timezone | Vercel Cron runs in UTC |
| Logo upload | Via the storage adapter | **Not built.** The `brand.logoFileId` config field exists | Roadmap |
| Indexes | As listed in §5 | Plus `obligations(contract_id, kind)` and `payments(obligation_id)` (migration `0002_perf_indexes`) | Found by the 200-event performance test |
| Core coverage | 100% of branches | **87% of branches, 99% of statements** across all tests. Exposure maths 92%, extraction mapping 65% | Target not met. Extraction mapping is next |
| App shell | Sidebar with a top bar | Top **module bar** with menus, an icon rail that expands over the page, a right **quick rail**, and slide-over **sheets** (Radix Dialog) | Changed after user review, with Bitrix24 as the structural reference. It adds pipeline-style navigation without changing any service |
| Boards | Tables and lists | **Kanban boards** for events (drag with `@dnd-kit/core`, including keyboard), change requests and deadlines, plus month calendars. Layout, filters and search live in the URL | dnd-kit was chosen for accessible keyboard dragging. Moves call the same `setEventStatus` service, so transition rules and the audit trail are unchanged |
| Collaboration | None | **Event team threads** (`threads`, `messages`, `thread_reads`, migration `0003`), with @mention notifications through the existing `notify()` | Real, stored and access-scoped. They refresh on open and send; live push is on the roadmap |
| Theming | Brand colour only | Written design system ([docs/09](09-design-system.md)): midnight and gold tokens, Fraunces and Manrope, Phosphor icons. White-label `primaryColor` (≥4.5:1 on white) and `accentColor` (≥3:1 on midnight). A venue-photo wallpaper per user (`users.preferences`), with the org default in `brand.defaultWallpaper`. A cover photo per event (`events.cover_image`, migration 0004) from a generated catalogue (`src/config/imagery.ts`) | Milestones 10 and 11 were both judged generic. Research showed the fix is domain imagery and a specific type and palette, not less decoration. Photos are catalogue keys rather than uploads until the storage adapter exists |
| Running the demo | `next dev` | **`npm run demo`** (production build + `next start` on :3001). The workspace moved from OneDrive to `C:\dev\30-tools` | Dev mode shows compile indicators and was slow on OneDrive. Production loads pages in 0.08–0.28s locally |
| Sign-in rate limit | Better Auth defaults | `/sign-in/email`: 20 per minute per IP (global 300/min) | The production default (about 3 per 10s) locked out a team sharing an office IP |
| Extraction runs | Fire-and-forget after upload | A **queue** in `extraction_runs`: claimed with `FOR UPDATE SKIP LOCKED`, two at a time, `attempts` and `next_attempt_at` for backoff on 429/5xx/network. Kicked by `after()`; the hourly job drains runs older than 5 minutes (migration 0005) | Bulk import sends 20+ PDFs at once. Unbounded parallel calls hit rate limits; the lock makes concurrent drains safe |
| Pickup ingestion | Manual entry and browser CSV | Also **emailed hotel reports**: a per-block address `pickup+<token>@INBOUND_DOMAIN` (26-char lowercase base32, since mail systems may lowercase), a provider-neutral JSON webhook with a bearer secret, CSV and XLSX (`exceljs`), a saved mapping, SHA-256 dedupe, and rejection when columns change (migration 0006) | The token is stored in plain text so the address can be shown again in the UI; it only grants "submit a pickup report for one block", can be rotated, and can be restricted to a sender domain. Rejecting beats guessing: a wrong column silently corrupts every figure downstream |
| Decision amounts | Event currency | Stored in the **currency the person entered** (the contract's), with `detail` jsonb for room nights and the source rule; converted with FX where totals are shown (migration 0007) | A bug found in milestone 16: EUR amounts were labelled as USD |
| Alert lifecycle | Re-raise when the condition holds | An alert anchored to an obligation is **not re-raised after a recorded decision**. The threshold alert returns only if a snapshot after the decision fell below the limit. Dedupe keys have a random suffix | A decided alert reappearing on the next run would make the ledger and the team's trust wrong |
| Contract amendments | New version copies terms | Activation also **moves the room block's pickup history and report address** to the matching block (by name, or directly when each side has one) | Bug found through the seeded amendment: exposure went "incomplete" and the email address was orphaned |
| Client access | Change approval links only | A **client share link** (`client_share_links`, migration 0008): 32 random bytes, only the SHA-256 stored, 90-day expiry, revocable, view count, first view per day audited. The view model is built as the system and cut to one client's fields; no agency share or margins exist in it | Unlike the pickup token, the URL is shown once, because it exposes money. Filtering in the view model (not the template) means a template change can't leak agency figures |
