# Phase 5 — Technical architecture: True-up Desk

> Rebuilt on the Expansion Signal Desk codebase (2026-10-11). The infrastructure is kept and the domain replaced.

## 1. What the requirements demand
- **Multi-tenant relational data**, org-scoped: accounts → contracts → daily usage → invoices → monthly reconciliation lines → exceptions → adjustments → ledger.
- **A pure, explainable reconciliation engine:** the same inputs always give the same exceptions, each with its arithmetic (spec §5).
- **Human-in-the-loop decisions:** state machines, an approval limit, optimistic locking, and an audit trail.
- **Two inbound feeds** (usage, invoices) through keyed APIs and CSV; outbound signed webhooks.

## 2. Stack (kept)
- **App:** Next.js 16 App Router (Server Components, Server Actions), React 19.
- **Data:** Postgres 17 via Drizzle (migrations in `drizzle/`). Zod 4 for every input.
- **Auth:** Better Auth (email and password; the auth table is `auth_accounts`).
- **Background work:** node-cron runner locally (`npm run jobs`); `/api/cron/[job]` with a bearer token for hosted cron.
- **Mail and logs:** Nodemailer to Mailpit locally; pino logs.
- **UI (changed in rev 6):** shadcn/ui components on Radix and Tailwind v4, lucide icons, Geist fonts, sonner toasts, cmdk command menu.

## 3. Layers
| Layer | Path | Notes |
|---|---|---|
| Core (pure) | `src/core/recon/{expected,classify,workflow}.ts`, `src/core/{money,dates,business-time}.ts` | No I/O, no clock; `today` and inputs are passed in |
| Services | `src/services/{invoices,reconcile,exceptions,ledger,recon-rules}.ts` plus the kept infra (`context`, `errors`, `org`, `users`, `keys`, `ingest`, `accounts`, `notifications`, `webhooks`, `reminders`, `digest`) | Each takes `ServiceCtx`, checks `assertCan`, writes `audit()` |
| Jobs | `src/jobs/jobs.ts` (`runMonthly`, `runHourly`, `runWeekly`) | Monthly reconcile on the 1st at 06:00 org time, plus on demand |
| API | `app/api/ingest/{usage,invoices}`, `app/api/cron/[job]`, `app/api/reports/[name]` | INGEST keys hashed (sha256) |
| UI | `app/(app)/**`, `src/components/ui/*` (shadcn), `src/components/app/*` | Server-rendered pages; client components only for interaction |

## 4. Data model (new tables)
- **`subscriptions`** (extended): `billing_cadence`, `true_up` jsonb ({seats, overage: MONTHLY|TERM_END, underUsePct}).
- **`invoices`:**
  - columns: id, org_id, account_id, number, period_start, period_end, issued_on, total_minor, source (API|CSV|SIMULATED), external_ref
  - unique (org_id, external_ref)
- **`invoice_lines`:** id, invoice_id, kind (PLATFORM|SEATS|SEAT_TRUE_UP|COMMITMENT|OVERAGE|ADDON|CREDIT|OTHER), quantity, unit_minor, amount_minor, description.
- **`recon_periods`:** id, org_id, month (date, first of month), status, run_at, counts jsonb. Unique (org_id, month).
- **`recon_lines`:**
  - columns: id, period_id, account_id, expected_minor, invoiced_minor, gap_minor, expected jsonb (lines and working), invoiced jsonb (by kind)
  - unique (period_id, account_id)
- **`exceptions`:**
  - identity: id, org_id, number, period_id, account_id, type, status
  - money and story: amount_minor, explanation, evidence jsonb
  - handling: assignee_id, due_at, dismiss_reason, dismiss_note, lock_version, created_at, decided_at
  - unique (period_id, account_id, type)
- **`adjustments`:**
  - columns: id, exception_id, kind (INVOICE|CREDIT_NOTE), amount_minor, memo, proposed_by, approved_by, approved_at, recorded_by, recorded_at, external_ref, rejected_reason
  - **Ledger = recorded adjustments only.**
- **`recon_rules` / `recon_rule_versions`:** per exception type (enabled, toleranceMinor, tolerancePct, threshold). Copied from the old signal-rule versioning pattern.
- **Dropped:** `signals`, `signal_rules`, `signal_rule_versions`, `csqls`, `seller_queues` and their enums.
- **Role enum:** `SALES_LEAD` becomes `FINANCE_LEAD`, `SELLER` becomes `BILLING`.

## 5. Reconciliation run (`reconcile.ts`)
For each account with a contract overlapping month M (in batches of 200):
1. Load the contract, the month's daily usage (peak seats, cumulative units at the start and end of the month), the term-to-date usage, and the invoices with a period inside M.
2. `expected = expectedFor(contract, priceBook, usage, M)`, then `classify(expected, invoiced, usage, contract, rules, today)` gives the candidate exceptions.
3. Upsert the `recon_lines` row. For each candidate, insert or refresh the exception (unique by period, account and type) if it's open. Auto-resolve open exceptions with no candidate this run.
4. Mark the period's run time and counts, notify assignees (deduped), and enqueue `exception.raised` webhooks.

This makes the run idempotent: running M again changes nothing unless the inputs changed.

## 6. Decisions (`exceptions.ts`)
- **Actions:** `propose`, `approve`, `reject`, `record`, `dismiss`, `sendToCs`, `completeCs`, `assign`.
- Each checks the role (`policy.ts`), the state machine (`core/recon/workflow.ts`) and `lock_version`, then writes the activity log, notifications and webhooks in one transaction.

## 7. Demo data
- `src/demo/accounts.ts` + `src/demo/model.ts` give contracts and daily usage (kept).
- `src/demo/billing.ts` is a deterministic **simulated billing system**. It issues each month's invoices from the contract and injects documented faults on named accounts (missed overage, seats not trued up, a duplicated add-on, one missing invoice).
- All of it is labelled SIMULATED.
- `seed-demo.ts` replays the last three closed months through the real `reconcile` and `exceptions` services, acting out each account's story.

## 8. Testing
- **Unit (`tests/core/recon.test.ts`):** expected billing (each cadence, proration, seat true-up, overage across the commitment boundary, term-end overage), every exception type and its tolerance edges, the state machine.
- **Integration (`tests/integration/*`):** invoice ingest (validation, upsert), reconcile idempotency and auto-resolve, propose/approve/record into the ledger, approval limit, dismiss reasons, permissions, plus the kept tests for webhooks, keys and imports.
- **e2e (Playwright):** the billing → finance → ledger flow, the under-use → CSM flow, dismissal, rule preview, role access, and an axe sweep of every screen.

## 9. Deployment and configuration
Unchanged from the previous build:
- `.env` holds `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CRON_SECRET` and the SMTP settings.
- `CLIENT_CONFIG` selects `config/clients/<name>.json`.
- Docker Compose runs Postgres (5402) and Mailpit (4002/2502).
- The app runs on 3002.
