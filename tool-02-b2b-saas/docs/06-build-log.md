# Phase 6 — Build log: Expansion Signal Desk

One entry per milestone: what was built, how it was checked, what broke, and how it was fixed.

## Milestones

### 1. Scaffold
- Project on its fixed ports:
  - app 3002
  - Postgres 5402 (plus a `signal_desk_test` database)
  - Mailpit 4002 (web) and 2502 (SMTP)
- Pieces copied deliberately from Tool 01 (no shared code, per the workspace rules):
  - env validation, logging, DB client, Better Auth, the error and result helpers, the email adapter, the rate limiter
- "Signal room" tokens from [09](09-design-system.md). Every text colour pair's contrast was computed before any screen existed (script output in docs/09).

### 2. Core engine (`src/core`)
- **Rule functions:** seat pressure, usage pace, new team, add-on interest, new executive.
- **Logic:**
  - estimated value from the price book
  - combining several signals without double-counting seats
  - transparent priority
  - business-day deadlines in the org's time zone with holidays
  - state machines for signals and CSQLs
  - routing
- **23 unit tests with hand-worked numbers.** Example: 30,000 used on day 182 of 365 → 60,165 projected → 120% → next tier, $7,000.
- **Bug caught by a test:** the seat value working said "76 needed"; it should be 66. The code added the seats to buy to the *active* count instead of the *owned* count. Fixed.

### 3. Data in, detection, workflow services
- **Ingest:** row-level validation, unknown accounts rejected, idempotent upserts, contacts with seniority derived from the title.
- **Detection:** create, refresh, attach to an open CSQL, cooldown, expiry, snooze wake-up, stale-data block.
- **Triage and CSQLs:** accept, dismiss, snooze, reassign; route, accept, return, re-route, reassign, opportunity, won, lost, no opportunity. Optimistic locking, audit log, notifications, webhooks inside the transaction.
- **Bug found by thinking through a back-dated run:** detection read snapshots after "today". It now bounds the window at today.

### 4. Seed as a replay
- 36 fictional accounts with scripted usage stories, fed through the real ingest service and marked SIMULATED.
- Weekly detection over 12 weeks, with CSMs and sellers acting out each account's story through the real services, with the clock set back.
- **Real bugs the replay found:**
  1. `received_at` was mapped to `created_at`, so the upsert referenced a column that didn't exist.
  2. **One batch carrying the same contact on 91 rows** broke Postgres's single-statement upsert. Fixed by deduplicating per batch and keeping the *earliest* first-seen date (`least(...)` on conflict).
  3. **A signal was re-raised 3 days after a lost deal**, because the 25% "material change" override applied to closed CSQLs. **Product rule refined:** the override applies only after a dismissal; a closed CSQL always gets the full cooldown. Spec FR-9 updated.
  4. **The demo anchor used the UTC date**, which is tomorrow in the New York evening. It now uses the org's local date.
- **The result matched the design exactly:**
  - 11 signals waiting (9 today, 2 overdue from last week)
  - 4 open CSQLs, one in each stage
  - 4 won, 3 dismissed, 2 lost, 1 no-opportunity, 1 snoozed

### 5. Integration tests
13 flow tests, then 8 more:
- ingest validation and upsert
- detection: value, priority, refresh, stale, cooldown and material change, expiry and wake
- the full triage → won loop with a business-day deadline check
- permissions and locking
- return → re-route → reassign
- round-robin order
- adding to an open CSQL
- reminder escalation, deduplicated
- webhooks: HMAC signature, retry schedule, permanent failure
- API keys: hash only, kind, revoke
- the CRM update going through the state machine
- CSV import: line-numbered rejections, upsert
- rule versioning and preview with no writes
- results count only recorded outcomes
- digest once per person per week, respecting the opt-out

### 6. Interface
- Overview, Signals (board and list), signal triage page, CSQL board and detail, Accounts and account page, Results, Rules and the rule editor with live preview, Settings (workspace, usage feed, CRM and webhooks, imports, routing, people), notifications, your account, search.
- **Fixes from reviewing the screenshots:**
  - **Overview headline:** "this quarter" read empty on October 7, so it uses a rolling 90 days, and Results gained a "Last 90 days" period.
  - **Charts:** the large traces are now fluid, and axis labels no longer collide with the threshold label.
  - **Rule editor:** the condition inputs stretched the full width.
  - **CSQL board:** a column hint wrapped and pushed its count down.
  - **Signal page on phones:** Triage now comes before History.
  - **Forms:** native `required` was removed so the server's inline field messages always show (found by the e2e test).
  - **Plain-language errors:** the ingest API said "Too small: expected number to be >=0"; it now says "must be 0 or more".
  - **Boundary bug:** a client-module function was called from the server layout. Navigation is now computed inside the client component.

### 7. Machine interfaces and jobs
- `/api/ingest/usage` (bearer key, rate-limited per IP and per key, detection afterwards via `after()`).
- `/api/crm/opportunity-update`, `/api/cron/[job]`, `/api/reports/results` (CSV with formula-injection guard).
- An hourly job runner (`npm run jobs`) and a demo simulator (`npm run usage:simulate`) that posts through the HTTP API with a seed-created key.
- **Checked live with curl:**
  - 35 simulated rows accepted
  - no key or a wrong key → 401
  - an unknown account and a negative count rejected per row with reasons
  - a non-JSON body → 400

### 8. Performance (`scripts/perf.ts`, test database, 2,000 accounts × 90 days = 180,000 rows)

| Measure | Result | Target |
|---|---|---|
| Detection, all accounts | 9–33 s | < 60 s |
| Signals queue | 40–130 ms | < 1 s |
| Results | 16–80 ms | < 1 s |
| Accounts list, before | 750–1,170 ms | < 1 s |
| Accounts list, after | 480–720 ms warm, about 1.9 s the first call after a restart | < 1 s |
| Backfilling 180,000 rows | 87–148 s | (one-off) |

- **Accounts list fix:** three per-row subqueries were replaced with one grouped query plus a lateral index lookup. The SQL is now about 120 ms; the rest is application work. The list is also paginated at 100 rows.
- **Backfill:** a one-off. Daily volume is about 2,000 rows, a couple of seconds.

### 9. End to end (Playwright against the production build)
- **7 of 7 pass:**
  - CSM accepts → seller accepts → opportunity → won → Results and the CSM's notification
  - seller returns with a reason → CSM sees it
  - dismiss requires a reason
  - RevOps previews a rule, and saving needs a note
  - a seller can't reach Rules or Settings
  - axe (WCAG 2.1 A/AA) on 23 screens across CSM, seller and RevOps, plus sign-in
- **Zero accessibility violations.**

## Testing checklist (brief §14)
- [x] **Happy paths:** e2e full loop; integration loop.
- [x] **Incorrect inputs:** ingest per-row rejections; money parsing; rule parameter bounds; webhook URL validation.
- [x] **Missing information:** handoff note, reasons and change notes are required, with inline messages.
- [x] **Duplicate records:** same day re-sent upserts; duplicate contacts in a batch; one open signal per account and rule; a second signal goes to the open CSQL; a double accept is refused with who and when.
- [x] **Permissions:** CSM book scope, seller scope, reassign by leaders only, RevOps-only rules and settings (integration and e2e).
- [x] **Edge cases:** stale data, expiry, snooze wake, cooldown vs material change, an account with no owner (queue → sales lead), business days across a weekend and a holiday.
- [x] **Failed integrations:** a failing webhook retries 1m/5m/30m/2h/12h, then FAILED, and shows in Settings; a bad API key gets 401.
- [x] **Empty datasets:** every list has an empty state that says what fills it.
- [x] **Large datasets:** 2,000 accounts × 90 days timed (above); accounts list paginated.
- [x] **Mobile and responsive:** 390 px screenshots of the overview, signals, triage and accounts; bottom navigation; no sideways scroll.
- [x] **Navigation, forms, automation, persistence, authentication, authorisation:** covered by the tests above.

## Product polish pass (brief §15)
Fixed:
- column header wrapping
- input widths
- chart label collisions
- triage order on phones
- technical error wording
- the "this quarter" headline that read empty early in a quarter

Kept on purpose:
- the mono font for figures and IDs
- one chart type
- chartreuse only on live markers

## Final quality gate (brief §20)
- [x] **Business:** expansion from existing customers is now the main growth lever, and CS-sourced deals win most often [V]. The system gives that handoff an owner, a deadline and an outcome.
- [x] **GTM:** built around the CSQL motion, credit, routing and net-retention incentives.
- [x] **Engineering:**
  - 44 unit and integration tests and 7 e2e tests pass
  - lint and typecheck clean
  - production build
- [x] **UX:** reviewed at 1440 and 390 px; zero axe violations.
- [x] **Product:** each step answers before, during and after (signal → triage → routed → recorded → rule tuning).
- [x] **White-label:** the tenant is a config file; rule types are core, rule instances are config.
- [x] **Commercial:** implementation, signal-design workshop, managed rule tuning ([07](07-commercialization.md)).
- [x] **Teaching:** [08](08-teaching-playbook.md).
- [x] **Differentiation:** alerts are cheap; the accountable handoff plus the evidence loop is not.

**Honest gaps (not built):**
- native Salesforce, HubSpot and warehouse connectors
- Slack
- editing the price book, wording and deadlines in the app (they live in config)
- multi-currency
- risk and contraction signals
- a hosted deployment
