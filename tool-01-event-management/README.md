# Tool 01 — Exposure Register

**Industry:** Event management companies (corporate event agencies, meetings & incentives companies, DMCs, PCOs)
**Status:** Complete: local build, tested. Not yet deployed.
**App:** http://localhost:3001 · **Postgres:** 5401 · **Mail inbox (dev):** http://localhost:4001 · **SMTP (dev):** 2501

The Exposure Register turns signed supplier contracts into dated obligations and a live money figure. For every open event it shows what the agency would owe if nothing changed, what it would owe if the event were cancelled today, and whether the agency or the client would pay. Changes (headcount cuts, added functions) are priced, approved internally, approved by the client through a link, and then applied. Exposure is recalculated each time.

Docs: [research](docs/01-industry-research.md) · [opportunities](docs/02-opportunity-discovery.md) · [spec](docs/03-product-spec.md) · [UX](docs/04-ux-design.md) · [architecture](docs/05-architecture.md) · [build log](docs/06-build-log.md) · [commercialisation](docs/07-commercialization.md) · [teaching playbook](docs/08-teaching-playbook.md)

---

## What this system does

- **Contracts → structured terms.** Each supplier contract (hotel, venue, catering, AV, transport) holds typed terms:
  - room blocks with a commitment % and cutoff
  - F&B minimums
  - tiered cancellation schedules
  - deposits and payments
  - final guarantees
  - review points

  Terms can be typed in, or proposed by Claude from the signed PDF. Every proposed value carries its source quote and page, and a person must confirm it before it counts.
- **Terms → deadlines.** Confirming a contract generates its dated obligations in the supplier's local time: deposits, cutoffs, guarantee dates and cancellation step-ups. Each obligation has an owner and reminders.
- **Live exposure.** Per event and across the portfolio:
  - **current exposure:** room attrition projected from pickup, plus F&B shortfall against the forecast
  - **cancellation exposure:** the tier in force today, less credited deposits
  - both split into **agency / client / unassigned**, using the liability rules in the client's agreement

  Every figure opens a working drawer showing the formula and inputs.
- **Monitoring.** Daily and hourly jobs:
  - take snapshots
  - send reminders at configurable offsets
  - warn before cutoffs and cancellation step-ups
  - raise threshold alerts and escalate overdue items

  Each alert closes with a recorded decision (released rooms, renegotiated, accepted risk…) or on its own when the condition clears.
- **Change control.** A change request carries:
  - an attendance change and cost lines
  - suggested client pricing from markup rules
  - its impact on exposure and margin

  Requests go to internal approval when they exceed the approval limit or fall below the margin floor. The client then decides through a single-use link, with no account needed. An approved change is applied to the event forecast and the exposure moves.
- **Post-event.** Actual penalties are recorded against the projected ones, giving evidence of how accurate the projections were.

## Who it is for

| Role | Uses it to |
|---|---|
| Operations director | Watch portfolio exposure, decide on alerts, approve changes |
| Event manager | Maintain contracts, pickup and forecasts for their events, and raise changes |
| Finance | Record payments and actual penalties; payment schedule reports |
| Managing director | Portfolio risk, internal approvals, settings |
| Client approver (external) | Approve or decline a change through an emailed link |
| Client stakeholder (external) | See their own share of penalties and upcoming cost dates on a read-only link |

## Business problem

An agency running 30–100 events a year holds hundreds of live contract dates. Each one is a point where money is lost if nobody acts: a cutoff passes with rooms unsold, a cancellation tier steps up, or an F&B minimum goes unmet after a headcount cut. Today these dates sit in PDFs, calendars and spreadsheets. Nobody can answer *"what would this cost us today, and is it our money or the client's?"* Existing tools (Blocks, Cvent Passkey, Groups360) cover hotel room blocks only. They don't cover every supplier contract, the agency's portfolio, or who bears each liability under each client agreement. See [docs/02](docs/02-opportunity-discovery.md).

## Workflow

```
Client + agreement (liability rules)
   → Event (dates, forecast, owner, team)
     → Supplier contract (PDF) → terms (typed or proposed from PDF → confirmed) → Activate
       → Deadlines generated · exposure calculated · alerts armed
         → Pickup / F&B forecast updates → exposure recalculates → alerts → decisions
         → Change request → impact → internal approval → client link → applied
           → Event delivered → actual penalties recorded → projected vs actual report
```

## Features

- **Workspace shell:**
  - a top module bar with menus (Events, Deadlines, Change requests, Money, Directory, More)
  - an icon rail that expands into a labelled menu
  - search (Ctrl K), team threads, notifications and the account menu in the top bar
  - slide-over sheets instead of page jumps
- **Event pipeline board:** Kanban columns Planning → Contracted → Live → Delivered → Reconciled, plus Cancelled/postponed.
  - Each column shows its count and money total: current exposure for open stages, recorded penalties for closed ones.
  - Drag cards between stages by mouse, or by keyboard (Space, then ←/→).
  - Only allowed transitions light up; illegal moves are refused with a message; delivered and cancelled ask for confirmation.
- **Change requests board** (Draft → Internal review → With the client → Approved → Applied), with client price totals and "Needs your approval" flags.
- **Deadlines board** (Overdue · This week · Next 2 weeks · Later), with outstanding-payment totals and actions on each card.
- **Calendar views** for events and deadlines. Each module switches between **Board** and **List** (plus **Calendar** for events and deadlines), with filter chips with counts and search, all as shareable URLs.
- **Team threads:** one discussion per event, visible to the event's team.
  - @mentions notify the colleague, but only if they can see the event.
  - Unread counts appear in the top bar.
  - Available from the top bar or the event's Discussion tab.
- **Built to look like an events product** ([design system](docs/09-design-system.md)):
  - real venue photography: a workspace wallpaper (per person, under avatar → Appearance) and a cover photo on every event, shown on the event banner, board cards, lists and the overview's **Next up** hero
  - Fraunces for names and figures, Manrope for everything else
  - midnight chrome with stage-gold accents; colour otherwise only where it carries meaning (risk, watch, settled, who pays)
  - Phosphor icons; text over photos checked for WCAG AA contrast
  - photos from Unsplash: [credits](docs/image-credits.md)
- **Money in plain words** ([design system § Money](docs/09-design-system.md)):
  - summary screens use rounded amounts (`$98.6k`, exact on hover) and everyday words, with the industry term small underneath
  - decisions are sentences
  - the Exposure tab and reports keep full precision for finance
- **Overview as a briefing:**
  - the answer in one sentence ("If nothing changes, your 9 open events will owe suppliers about $100k in penalties. $36.3k of that is yours…"), with what changed since last week
  - the Next up event
  - three calm figures
  - your events, each with one word: Needs a decision, Keep an eye, or On track
  - **What to do this week** (decide → save money → pay)
  - the 30-day chart behind a disclosure
- **Savings finder:**
  - Uses the review dates in room-block contracts to work out the fewest rooms to give back and what that saves: "Give back 56 room nights at Hotel Alvorada Lisboa by Oct 3 to save up to €8,127".
  - Alerts 14 days before each review date.
- **Monday money brief:**
  - a plain-English weekly email covering what's at stake, what changed, and what to do this week
  - scoped to what each person can see, with an off switch under Your account
- Event workspace:
  - calm figures (penalties if nothing changes, cost to cancel today, rooms booked) and a **What to do for this event** panel
  - the cancellation timeline, with its header as a sentence and a table view
  - tabs for exposure, contracts, change requests, deadlines, discussion, post-event and activity
- **Bulk contract import:**
  - drop a stack of signed PDFs on an event; each becomes a contract, with the supplier matched or added
  - Claude reads the terms in a queue (two at a time, with retries)
  - a batch page shows what is reading, what needs review, scans to enter by hand, and failures with Retry
- **Bookings update themselves:**
  - each room block can have its own email address for the hotel's pickup report (CSV or Excel)
  - reports are read with the saved column mapping, rejected (with the reason) if the columns change, and the event owner is told either way
- **Money protected** (Money → Money protected):
  - what the team *recorded*: penalties removed by decisions, room nights given back, client changes billed with their margin, and finished events projected vs charged
  - by quarter, year or all time, with a CSV export
- **Client share link:**
  - a read-only, branded page for one client: their share if nothing changes, their cost to cancel today, the next date fees rise, what the agency did, and changes waiting for their approval
  - never the agency's share or margins
  - the link is shown once, expires after 90 days, can be turned off, and views are tracked
- Scenario panel: attendance change % and a cancel-on date, with nothing saved
- Contract review screen: the PDF beside the proposed terms, with source quotes
- Pickup entry per night, plus CSV import with column mapping
- Deadlines: mine or everyone's, and a subscribable calendar feed (ICS) behind a rotatable secret link
- Change requests: an editor with a live impact panel, internal approval, a public approval page and an audit trail
- Reports (CSV export): exposure by client, payment schedule, projected vs actual penalties, decisions
- Settings: branding, terminology, rules, pricing, users and roles, FX rates, integration status, config export
- Global search and a command menu (Ctrl K), notifications, activity history on every record
- Your account: profile and password change (other sessions are signed out)
- Loading skeletons, error boundaries with support references, and not-found pages
- Responsive down to 390px wide, with a bottom navigation bar on phones

## Architecture

Next.js 16 (App Router, Server Components and Server Actions) on Node 24 · PostgreSQL 17 · Drizzle ORM · Better Auth · Zod · Tailwind v4 with Radix primitives · Claude API for term extraction · pino logs.

```
app/            routes: (app) authenticated shell · approve/[token] public · api/{cron,ics,files,reports,auth}
src/core/       pure calculation logic, no I/O: money, exposure, obligations, pricing, change state, extraction mapping
src/services/   use-cases: authorisation (policy), audit log, optimistic locking, org scoping
src/adapters/   storage (local) · email (smtp | resend | disabled) · extraction (claude | unavailable) · pdf
src/jobs/       idempotent daily/hourly monitoring (Vercel Cron or node-cron)
config/clients/ one JSON file per deployment (white-label)
```

The core never imports framework, database or adapter code. Services call core, pages and actions call services. Full detail and the decisions behind each choice: [docs/05](docs/05-architecture.md).

## Setup

Requires Node 24, Docker Desktop, and Git Bash or any POSIX shell.

```bash
cp .env.example .env            # then fill BETTER_AUTH_SECRET and CRON_SECRET (see comments)
npm install
npm run db:up                   # Postgres :5401, Mailpit :4001/:2501
npm run db:migrate
npm run db:seed                 # demo workspace "Northbeam Events (demo)"
npm run dev                     # development: http://localhost:3001 (port is pinned)
npm run jobs                    # optional: local scheduler for reminders and alerts
```

Demo sign-in: `ops@northbeam.test` (also `admin@`, `priya@`, `sam@`, `finance@`, `md@`), password `northbeam-demo-2026`. Emails sent by the app appear in Mailpit at http://localhost:4001.

### Demo and screen recording

```bash
npm run demo                    # production build, then serves http://localhost:3001
```

Always demo from the production build. `npm run dev` compiles each page on first visit and shows the Next.js "Rendering / Compiling" indicators. In production, pages are precompiled and load in roughly 0.1–0.3s locally, with no indicators.

**Location:** the workspace lives at `C:\dev\30-tools`, not in OneDrive. Syncing `node_modules`, `.next` and `storage/` through OneDrive caused file locks and 3–5 second page loads, and builds dropped from minutes to about 15 seconds after the move. Optionally exclude `C:\dev` from Windows Defender real-time scanning.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `APP_URL` | yes | Base URL used in emails, approval links and the calendar feed |
| `CLIENT_CONFIG` | yes | Which `config/clients/<name>.json` to seed |
| `DATABASE_URL` / `TEST_DATABASE_URL` | yes | App and test databases (the same container) |
| `BETTER_AUTH_SECRET` | yes | Session signing (32+ random characters) |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/daily`, `/api/cron/hourly` and `/api/cron/weekly` (the Monday brief) |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR` | yes | `local` is the only driver in this build |
| `EMAIL_DRIVER` | yes | `smtp`, `resend` or `disabled`. When disabled the UI says so, and links can be copied |
| `SMTP_URL`, `RESEND_API_KEY`, `EMAIL_FROM` | per driver | Email transport |
| `ANTHROPIC_API_KEY`, `EXTRACTION_MODEL` | optional | Reading terms from PDFs (model defaults to `claude-opus-5-5`). Without a key, manual entry works and Settings shows extraction as not configured |
| `INBOUND_SECRET` | optional | Bearer token for `/api/inbound/email` (hotel pickup reports). 16+ characters. Without it the webhook refuses everything |
| `INBOUND_DOMAIN` | optional | Domain of the pickup report addresses (default `inbound.localhost`) |
| `LOG_LEVEL` | optional | pino level (default `info`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME` | org-only seed | First administrator for a real deployment. The demo password is never used for it |

Values are validated at boot (`src/env.ts`). A missing required value fails fast with a readable message.

## Database

37 tables with `org_id` on every business table (including event threads, messages and read markers; per-user UI preferences are a `jsonb` column on users). Money is stored as integer minor units beside a `char(3)` currency. Clause terms are `jsonb`, validated per type by Zod. Contracts, clauses, events and change requests use optimistic locking (`lock_version`), and every write adds an `activity_log` row in the same transaction. Migrations are in `src/db/migrations` (`npm run db:generate` after schema edits). The schema overview is in [docs/03 §8](docs/03-product-spec.md).

## Integrations

| Integration | State |
|---|---|
| Claude API (term extraction) | Working when `ANTHROPIC_API_KEY` is set and extraction is enabled in Settings. Uses structured output, and source quotes are verified server-side |
| Email: SMTP (Mailpit locally) / Resend | Working. Delivery status is recorded per notification |
| Calendar (ICS feed) | Working. Secret link per user, can be rotated |
| Pickup CSV import | Working. The file is parsed in the browser and only the mapped values are stored |
| Inbound email (hotel pickup reports) | Working locally: Mailpit → `npm run inbound:mailpit` → provider-neutral JSON webhook. A hosted inbound provider (Postmark, Resend, SendGrid) needs a small adapter to that JSON shape; **not connected yet** |
| Client share link | Working. Public read-only page, rate-limited, token hash stored only |
| Vercel Blob storage | **Not implemented.** The driver name is reserved and fails with a clear message |
| Registration / housing systems (Cvent, Passkey) | **Not implemented.** Pickup is entered, imported by CSV, or arrives as an emailed hotel report |
| Team threads | In-app only. New messages appear when a thread is opened or a message is sent; there is no live push (WebSockets) yet |

## Testing

```bash
npm test                 # Vitest: 167 tests, core unit + integration against exposure_register_test
npm run jobs:once -- weekly   # send this week's Monday brief now (open Mailpit at :4001 to read it)
npm run contracts:samples     # render 5 fictional signed contracts (one scanned) into fixtures/contracts/
npm run inbound:simulate      # email a hotel pickup report to Mailpit (--xlsx, --bump=N, --new-format, --wrong-sender)
npm run inbound:mailpit       # forward those emails to the inbound webhook (--once to run a single pass)
npm run test:e2e         # Playwright on :3001 (reseed the demo first; see playwright.config.ts)
npx tsx scripts/perf-portfolio.ts   # 200 events / 2,000 contracts portfolio timing (test DB)
```

- **Unit:** every exposure formula, the rounding rules, the currency conversion and the spec's edge cases.
- **Integration:** org scoping and permissions, optimistic locking, contract activation → obligations → exposure → alerts, jobs with a fake clock (idempotent re-runs), the extraction pipeline with a fake model, and the full change lifecycle.
- **End to end:**
  - the change-control loop: draft → internal approval → emailed client link (read from Mailpit) → approve → applied
  - password change: validation, wrong current password, success, and signing in with the new password
  - event pipeline board: keyboard move between stages, and a refused illegal move
  - team threads: post with an @mention, the colleague gets the notification
  - WCAG 2.1 A/AA checks (axe) on 19 signed-in screens (boards, calendar, discussion, Money protected and contract import included), plus the sign-in and approval pages
  - client share link: created in the UI, opened signed out and checked with axe, then turned off
- **Coverage of `src/core`:** 99% of statements and 87% of branches. The gap is mostly in extraction-proposal mapping. Details and all test results are in [docs/06](docs/06-build-log.md).
- **Portfolio at 200 events / 2,000 contracts:** 0.5–0.8s, against a target of under 1s.

## Deployment

**Hosted (intended): Vercel + a managed Postgres (e.g. Neon) + Resend.**
- `vercel.ts` declares the two crons. Vercel Cron runs in UTC, so set the daily run to 06:00 in the client's timezone.
- Set the environment variables above, run `npm run db:migrate` against the target database, then `SEED_ADMIN_EMAIL=you@agency.com npm run db:seed -- --org-only` for a real organisation. It prints a one-time password, which the admin changes at `/account`.
- Uploaded contracts need persistent storage. Local disk doesn't persist on serverless, so a hosted deployment needs the Blob or S3 storage adapter (roadmap item 1) before contracts can be uploaded.

**Self-hosted:** `npm run build && npm start` (port 3001) behind a reverse proxy, any Postgres, local storage on a persistent volume, and a system cron that calls both job endpoints with the bearer secret.

`next build` completes with no warnings.

## White-label configuration

All client-specific behaviour lives in `config/clients/<slug>.json`, validated by `src/config/schema.ts`:

| Area | Settings |
|---|---|
| `brand` | Product name; primary colour for buttons and links (rejected if under 4.5:1 against white); accent colour for the navigation and photos (rejected if under 3:1 against midnight); default wallpaper |
| `terminology` | The words used for event, client, supplier and change request (e.g. "Programme", "Account", "Vendor", "Change order") |
| `workflow` | Event types |
| `clauseDefaults` | Default attrition commitment %, damages %, F&B surcharge % |
| `rules` | Reminder offsets, overdue escalation hours, exposure alert threshold, tier and cutoff warning windows, approval limit, margin floor, approval link expiry, who escalations go to, internal approver roles |
| `pricing` | Default markup, markup by cost category, management fee |
| `roles` | Display labels for the five roles |
| `finance` | Enabled currencies |
| `email` | Sender name, reply-to |
| `extraction` | On/off and effort level |

The file is loaded into `organizations.config` at seed time. Admins then edit it in Settings, and **Export config** writes it back as JSON for version control. The core logic never branches on client identity, only on these values.

## Customization guide

1. **New client deployment:**
   - Copy `config/clients/demo.json` to `<slug>.json`.
   - Set the name, currency, timezone, brand, terminology and rules, and set `"demo": false`.
   - Set `CLIENT_CONFIG=<slug>` and `SEED_ADMIN_EMAIL`, then run `npm run db:migrate && npm run db:seed -- --org-only`.
   - Sign in with the printed temporary password, change it at `/account`, and add users in Settings.
2. **Liability rules** are data, not code. Each client agreement maps a penalty category (deposit, attrition, F&B shortfall, cancellation, other) to a bearer: agency, client, or a split with an agency %.
3. **New clause type:**
   - Add a Zod schema in `src/core/clauses/schemas.ts`.
   - Add a calculator in `src/core/exposure/`.
   - Generate its obligations in `src/core/obligations/generate.ts`.
   - Add a form section in `src/ui/clause-editor.tsx` and a summary in `src/ui/clause-summary.ts`.
   - Add unit tests before any UI.
4. **New alert rule:** add it to `src/jobs/monitor.ts` with a stable dedupe key, so re-runs don't notify twice.
5. **Another email provider:** implement `EmailSender` in `src/adapters/email.ts`.

## Commercialization opportunities

The buyer is the agency MD, COO or CFO. The value drivers are penalties avoided, earlier decisions on releasing rooms, scope changes that get billed instead of absorbed, and a portfolio-level liability figure for finance. Implementation work:
- backfilling live contracts
- setting up liability rules per client agreement
- configuring rules and terminology
- integrating pickup feeds

Full analysis, with no invented prices, is in [docs/07](docs/07-commercialization.md).

## Future roadmap

1. Blob/S3 storage adapter (required for hosted uploads)
2. Pickup feeds from housing and registration systems (Passkey, Cvent, Groups360), beside emailed hotel reports
3. A hosted inbound-email adapter (Postmark or Resend inbound) for the pickup report addresses
4. Logo upload (the config field exists, but there's no upload flow yet), and uploading your own event covers and wallpapers (both need the storage adapter; today they come from the built-in photo catalogue)
5. Client share link v2: per-event links, and a digest email to the client when their figures change
6. Supplier renegotiation workflow linked to alert decisions
7. Accounting export of payments and penalties
8. SSO (SAML/OIDC) for larger agencies
9. Persistent rate limiting for the public approval and client pages (in-memory today, which suits a single instance)
10. Live updates for team threads and boards (WebSockets); today they refresh on open, send and move
