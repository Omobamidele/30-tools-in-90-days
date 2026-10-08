# Tool 02 — Expansion Signal Desk (B2B SaaS, mid-market)

**Industry:** B2B SaaS vendors ($20M–$150M ARR) selling to mid-market companies
**Status:** Complete: local build, tested. Not yet deployed.
**App:** http://localhost:3002 · **Postgres:** 5402 · **Mail inbox (dev):** http://localhost:4002 · **SMTP (dev):** 2502

The Expansion Signal Desk turns product usage into **expansion signals**:
- seats nearly full
- usage ahead of the commitment
- a new team adopting the product
- repeated attempts to open an add-on
- a new senior stakeholder

A customer success manager accepts each signal with a handoff note, or dismisses it with a reason. Accepted signals reach the right seller as a **CSQL**, with the evidence and a deadline. The system then records what each one turned into, so RevOps can see which signals are worth acting on.

Docs:
- [research](docs/01-industry-research.md)
- [opportunities](docs/02-opportunity-discovery.md)
- [spec](docs/03-product-spec.md)
- [UX](docs/04-ux-design.md)
- [architecture](docs/05-architecture.md)
- [build log](docs/06-build-log.md)
- [commercialisation](docs/07-commercialization.md)
- [teaching playbook](docs/08-teaching-playbook.md)
- [design system](docs/09-design-system.md)

> **Demo data is fictional.**
> - "Fernway", its customers and its people are invented.
> - All usage is **simulated**, comes in through the real ingest API, and is labelled "Simulated usage" in the app.

---

## What this system does
- **Detects.**
  - Five rule types run daily at 06:00 in the org's time zone, and right after each usage upload, over 90 days of usage per account.
  - Every signal carries an explanation sentence, its evidence, a **signal trace** (the metric against its threshold), an estimated value with its working, and a priority shown as a plain sum.
- **Triages.**
  - The account's CSM accepts (with a handoff note), dismisses (with a reason) or snoozes (until a date).
  - A CS leader can reassign it.
  - Dismissals start a cooldown, overridden only if the value grows materially.
- **Routes.** An accepted signal becomes a CSQL, routed to:
  1. the account owner
  2. otherwise the segment's round-robin queue
  3. otherwise the sales leader

  The routing reason is stored, and the seller gets a deadline in business days.
- **Works the deal.** The seller accepts or sends it back with a reason, records the opportunity (amount and CRM reference), then the outcome. Deadlines escalate from due soon, to overdue, to "needs reassigning".
- **Proves it.** Results shows pipeline and won revenue from signals by type, CSM and seller, plus dismissal reasons and response times. **Only recorded outcomes count; estimates never do.**
- **Tunes itself through people.** RevOps edits rules with a live preview ("12 accounts would have a signal today"). Every change is versioned with a note, and each rule shows its own funnel and why it gets dismissed.

## Who it is for

| Role | Uses it to |
|---|---|
| Customer success manager | Triage signals on their book every day |
| Account manager / AE | Work the CSQLs routed to them and record outcomes |
| CS leader / sales leader | Watch backlog and response times, and reassign stuck work |
| RevOps | Own rules, the usage feed, routing, keys and the CRM bridge |
| Executive | Read-only results |
| Admin | People, roles and everything else |

## Business problem
CS-sourced expansion opportunities win about 52% of the time, more than any other source (ICONIQ, *State of GTM 2026*).

But the signals sit in product data, while pipeline lives in the CRM, and nobody owns the step between them:
- signals die in dashboards
- nobody can say which ones matter
- nobody can say what CS-sourced expansion produced

Single-purpose tools each cover one side; this system makes the handoff accountable and measurable. See [docs/02](docs/02-opportunity-discovery.md).

## Workflow
```
Usage feed (warehouse/product → API) ─► daily snapshot ─► rules ─► SIGNAL
  CSM: accept + note ─► CSQL routed to seller (deadline)     dismiss + reason ─► cooldown, rule tuning
  Seller: accept ─► opportunity (amount, CRM ref) ─► won / lost      send back + reason ─► CSM re-routes
  Results: pipeline & won by signal type / CSM / seller ─► RevOps tunes rules (versioned, previewed)
```

## Features
- Overview: the answer as one sentence ("In the last 90 days, signals created $34.5k of pipeline; $34.5k has been won"), plus the user's own work and "Needs reassigning" for leaders.
- Signals board and list, with filters in the URL (mine, overdue, type), deadline status and traces.
- Signal page:
  - a large trace with axes
  - value working
  - priority breakdown
  - account context
  - accept (optionally including other open signals, or adding to an open CSQL), dismiss, snooze, reassign
- CSQL board (Routed, Returned, Accepted, Opportunity, Closed) and a detail page:
  - the handoff note, evidence and history
  - only the actions the state machine and the user's role allow
- Accounts list (paginated) and account page:
  - 90-day seat and usage-pace traces against the rule thresholds
  - workspaces, add-ons, contacts with seniority
  - the account's signal and CSQL history, and activity
- Results by period: last 90 days, quarter, year, all time. Funnel, by type, by CSM and seller, dismissal reasons, response times, CSV export.
- Rules: a funnel per rule, an editor with plain-language fields, a live preview, version history, and estimate vs recorded amount.
- Settings:
  - workspace config
  - usage feed (keys, curl example, batch log with rejected rows)
  - CRM and webhooks (signed, retried, test-send, delivery log)
  - CSV import
  - routing queues
  - people and roles
- Notifications (in-app plus email), a Monday digest, an opt-out under Your account, password change.
- Designed as "Signal room":
  - ink-teal chrome
  - chartreuse only for live markers
  - Space Grotesk with JetBrains Mono
  - Phosphor icons
  - WCAG AA throughout (axe: zero violations on 23 screens)
  - responsive down to 390 px

## Architecture
- **Stack:** Next.js 16 (App Router, Server Actions), React 19, Postgres 17 with Drizzle, Better Auth, Zod 4, Tailwind v4, Radix, Phosphor, node-cron, Nodemailer, pino.
- **Layers:**
  - `src/core`: pure rule functions, value, priority, business time, state machines, routing
  - `src/services`: org-scoped use cases with an actor and a clock
  - `app`: UI and routes

Details in [docs/05](docs/05-architecture.md).

## Setup
```bash
cp .env.example .env            # then fill BETTER_AUTH_SECRET and CRON_SECRET
docker compose up -d            # Postgres :5402, Mailpit :4002/:2502
npm install
npm run db:migrate && npm run db:seed
npm run demo                    # production build + start on :3002
```

**Sign in** with any demo user and the password `fernway-demo-2026`:
- `priya@fernway.test` (CSM)
- `aisha@fernway.test` (seller)
- `cslead@fernway.test`, `saleslead@fernway.test`
- `revops@fernway.test`, `admin@fernway.test`, `exec@fernway.test`

**Simulate another day of usage** (posts through the real API):

```bash
npm run usage:simulate                       # today
npm run usage:simulate -- --days=3           # the last 3 days
```

**Re-seed for a clean demo:** `npm run db:reset && npm run db:migrate && npm run db:seed`

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | yes | Base URL for email links and the API examples |
| `CLIENT_CONFIG` | yes | Which `config/clients/<name>.json` to seed |
| `DATABASE_URL` / `TEST_DATABASE_URL` | yes | App and test databases (the same container) |
| `BETTER_AUTH_SECRET` | yes | Session signing (32+ characters) |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/daily`, `hourly` and `weekly` |
| `EMAIL_DRIVER`, `SMTP_URL`, `RESEND_API_KEY`, `EMAIL_FROM` | per driver | `smtp` (Mailpit locally), `resend` or `disabled` |
| `LOG_LEVEL` | optional | pino level |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | org-only seed | The first admin for a real deployment (`npm run db:seed -- --org-only`) |

## Database
- **22 tables**, all with `org_id`.
- **Money** is integer minor units.
- **Usage** is one row per account per day, unique on `(account_id, date)`.
- **Signals and CSQLs** use optimistic locking. Every change writes `activity_log` in the same transaction.
- **Migrations** are in `src/db/migrations`. Schema overview: [docs/03 §8](docs/03-product-spec.md).

## Integrations

| Integration | State |
|---|---|
| Usage ingest API `POST /api/ingest/usage` | **Working.** Bearer ingest key, up to 5,000 rows, idempotent, rejects per row with reasons, runs detection afterwards |
| CSV import (accounts and subscriptions) | **Working.** Line-numbered rejections; upsert by `crm_id` or domain |
| Outbound webhooks (`csql.routed`, `accepted`, `opportunity_created`, `closed`) | **Working.** HMAC-SHA256 signed, retried 1m/5m/30m/2h/12h, delivery log |
| CRM update `POST /api/crm/opportunity-update` | **Working.** Moves CSQLs through the same state machine |
| Email (SMTP/Mailpit, Resend) | **Working** |
| Usage simulator | **Working, simulated data**, clearly labelled |
| Native Salesforce / HubSpot / Segment / warehouse connectors | **Not built.** The webhooks, update endpoint and ingest API are the bridge |
| Slack | **Not built** |

## Testing
```bash
npm test               # Vitest: 44 tests (core unit + integration against signal_desk_test)
npm run test:e2e       # Playwright: 7 tests incl. axe on 23 screens (reseed first)
npx tsx scripts/perf.ts  # 2,000 accounts × 90 days timing on the test DB
```
Results and every bug found are in [docs/06](docs/06-build-log.md).

## Deployment
- **Local:** `npm run demo`, plus `npm run jobs` for the hourly scheduler.
- **Hosted (not done):** Vercel plus managed Postgres. Cron calls `/api/cron/*` with `CRON_SECRET`. No file storage is needed.

## White-label configuration
Everything that names or prices a tenant is in `config/clients/<name>.json`, validated on load:
- **branding:** name, logo letters, colours (contrast-checked)
- **terminology:** "CSQL" vs "Expansion lead", "Seats" vs "Licenses", usage metric and unit
- **price book:** seat price, commitment tiers, overage, add-ons
- segments
- deadlines, business days, holidays
- detection settings
- dismissal, return and lost reasons
- the starting rule set

## Customization guide
1. Copy `config/clients/demo.json`, rename it, and edit brand, terminology, price book, segments and reasons.
2. Set `CLIENT_CONFIG` and run `npm run db:seed -- --org-only` with `SEED_ADMIN_EMAIL`.
3. Import accounts (Settings → Imports) and create an ingest key (Settings → Usage feed).
4. Point the client's warehouse job at `/api/ingest/usage`.
5. Set routing queues, then tune rules using the preview.
6. Add webhooks to the client's CRM automation and a CRM key for updates.

## Commercialization opportunities
- implementation (data feed, signal design, CRM bridge)
- managed rule tuning
- CS-to-sales process design

Value drivers, not prices: [docs/07](docs/07-commercialization.md).

## Future roadmap
1. Native CRM connectors (Salesforce, HubSpot) and warehouse connectors.
2. Risk and contraction signals (the same engine, inverted).
3. In-app editing of the price book, wording, deadlines and reasons.
4. Slack notifications and triage.
5. Multi-currency.
6. An optional Claude-drafted outreach note on accepted signals (only if it proves useful).
7. Hosted deployment with a shared rate limiter.
