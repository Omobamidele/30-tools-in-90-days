# Phase 3 — Product Specification: Expansion Signal Desk

**Selected:** candidate 2 in [doc 02](02-opportunity-discovery.md).
**Evidence labels:** as in [doc 01](01-industry-research.md).

---

## 1. Product brief

**One line:** the Expansion Signal Desk turns product usage and billing data into **expansion signals**, gets a customer success manager (CSM) to accept or dismiss each one with a reason, routes accepted ones to the right seller as a **CSQL** (customer-success-qualified lead) with a deadline, and records what each signal type eventually turns into.

**Why it exists**
- **[V]** Opportunities sourced by customer success win about 52% of the time, more than any other source (ICONIQ 2026).
- **[A]** The signals that create those opportunities sit in product analytics and billing. Nobody owns turning them into pipeline, and nobody measures the result.

**What it is not**
- Not a CS platform: no health scores, playbooks or QBR decks.
- Not a CRM: opportunities still live in the vendor's CRM; we link to them.
- Not a product analytics tool: we take in *aggregates*, not raw event streams.

**The sample tenant: "Fernway"**
- A fictional mid-market SaaS vendor selling spend analytics to finance teams.
- **Hybrid pricing:**
  - platform tier
  - analyst seats at $1,200 a year
  - committed document credits, with overage per document
  - two add-on modules: AP Automation and Forecasting
- Fernway exists only in demo config and seed data. Nothing in the core refers to it ([§13](#13-white-label-architecture)).

---

## 2. Personas

| Persona | Role key | Uses it to | Frequency |
|---|---|---|---|
| **Customer success manager (CSM)** | `CSM` | Triage signals on their accounts, write the handoff note, follow up | Daily |
| **Account manager or AE (seller)** | `SELLER` | Accept routed CSQLs, work them, record the opportunity and its outcome | Daily |
| **CS leader** | `CS_LEAD` | See triage backlog and response times, reassign, review dismissals | Weekly |
| **Sales leader** | `SALES_LEAD` | See routed CSQLs, seller response times, reassign | Weekly |
| **RevOps** | `REVOPS` | Configure signal rules, price book, routing, deadlines; manage data feeds; tune rules | Weekly |
| **Executive (CRO/CFO)** | `EXEC` | Read-only: pipeline and revenue from signals, conversion by signal type | Monthly |
| **Admin** | `ADMIN` | Users, roles, branding, keys | Rarely |

---

## 3. User stories (MVP)

**CSM**
1. Open one queue of new signals on my accounts, the most valuable first, each with evidence I can check.
2. Accept a signal, add what I know, and know it reached the right seller with a deadline.
3. Dismiss a signal with a reason (e.g. "Seats are contractors on a fixed project"), so the same signal doesn't return next week.
4. Snooze a signal until a date ("budget cycle opens in January").
5. See what happened to every CSQL I sent.

**Seller**
6. See CSQLs routed to me, with the CSM's note, the evidence and an estimated value.
7. Accept a CSQL, or send it back to the CSM with a reason.
8. Record the opportunity (amount, CRM link) and later the outcome (won or lost, with a reason).

**Leaders**
9. See signals waiting past their triage deadline and CSQLs waiting past the seller deadline, and reassign them.
10. See pipeline created and revenue won from signals for a period, by signal type and by CSM. Only recorded facts count.

**RevOps**
11. Define signal rules without code: metric, threshold, window, minimum account size, cooldown, value formula.
12. See each rule's precision: raised → accepted → converted → won. Tune thresholds from that.
13. Load accounts, subscriptions and contacts from a CRM export (CSV), and push usage through an API.

**Exec**
14. One sentence and three numbers: "This quarter, signals created $412k of expansion pipeline; $138k was won."

---

## 4. Functional requirements

### 4.1 Data in
- **FR-1 Accounts and subscriptions.**
  - CSV import with column mapping (from a CRM or billing export), plus manual create and edit.
  - **Account fields:** name, domain, segment, CSM, account owner (seller), external CRM ID.
  - **Subscription fields:** plan, seats purchased, committed credits, term start and end, ARR, add-ons owned, price overrides.
- **FR-2 Usage ingest API.**
  - `POST /api/ingest/usage`, with a bearer key per organisation.
  - Takes daily aggregates per account: active seats (30-day), credits used in the current term, workspaces (with active users each), gated-feature attempts per add-on.
  - Idempotent per account and date. Validated. Every row records where it came from (`API`, `CSV`, `SIMULATED`).
- **FR-3 Contacts.** Name, title, email, seniority (derived from title, editable), first seen. They come from the CSV import or the API.
- **FR-4 Data freshness.** If an account has no usage for more than N days (default 3), it shows "Usage data is N days old", and **no new signals are raised from stale data**.

### 4.2 Signal detection
- **FR-5 Rule types:**

  | Rule type | Condition | Estimated value |
  |---|---|---|
  | `SEAT_PRESSURE` | Active seats ≥ X% of purchased for Y days | Seats needed with headroom × seat price |
  | `USAGE_PACE` | Projected term usage ≥ X% of commitment | Projected overage × overage rate, or the next commitment tier's price difference, whichever the price book says |
  | `NEW_TEAM` | A workspace created in the last N days reaches ≥ M active users | M × seat price |
  | `FEATURE_INTENT` | ≥ N gated attempts on add-on A in D days, for an account without A | Add-on A's list price |
  | `NEW_EXECUTIVE` | A contact with senior seniority first seen in the last D days | None ("No direct value; relationship signal") |

- **FR-6 Rule settings:** every rule has a threshold, window, minimum ARR, segments it applies to, a cooldown in days, a weight, and on/off.
- **FR-7 Detection runs** daily (and on demand after an ingest), per account. Each signal stores:
  - **evidence:** the metric values and dates that triggered it
  - **an explanation sentence:** "47 of 50 analyst seats active for 21 days"
  - **an estimated value,** with its formula inputs
  - **a priority score** with its breakdown
- **FR-8 Dedupe.** At most one open signal per account and rule type. Re-detection on an open signal updates its evidence. If a CSQL is already open for the account, the new evidence is **attached to that CSQL**, not raised as a new signal.
- **FR-9 Cooldown.** After a dismissal or a closed CSQL, the same rule doesn't fire for that account until the cooldown ends. **After a dismissal only**, a value that grows by more than the "material change" margin (default 25%) overrides the cooldown. A closed CSQL always gets the full cooldown, because a seller has just spoken to the customer (refined during the build, when the seed raised a signal three days after a lost deal).
- **FR-10 Auto-expiry.** A NEW signal whose condition no longer holds for 7 days becomes EXPIRED, with a note.
- **FR-11 Priority** = estimated-value band + rule weight + modifiers:
  - renewal within 120 days: plus
  - open support escalation: minus, shown as "talk to support first"
  - stale data: blocked

  The breakdown is always shown. There is no hidden model.

### 4.3 Triage (CSM)
- **FR-12** Queue of NEW signals for the CSM's accounts. Filter by rule type, value and age. Sort by priority.
- **FR-13 Accept → create a CSQL.**
  - Requires a handoff note.
  - Optional: a confirmed contact, an adjusted estimated value (the original is kept).
  - Several open signals on the same account can go into one CSQL.
- **FR-14 Dismiss** requires a reason, from a configurable list plus "Other" with text. **Snooze** requires a date.
- **FR-15** Triage deadline (default 2 business days). Overdue items are flagged, and a reminder goes to the CSM, then to the CS leader.

### 4.4 Routing and seller work
- **FR-16 Routing order:**
  1. the account owner (seller)
  2. the territory or segment queue, round-robin
  3. the sales leader as fallback

  The routing reason is stored ("Account owner", "Mid-market round-robin").
- **FR-17 CSQL status flow:**
  `ROUTED → ACCEPTED → OPPORTUNITY → WON | LOST`, with `RETURNED` (back to the CSM with a reason) and `CLOSED_NO_OPP` (seller decided there's no deal, with a reason).
- **FR-18** Seller deadline to accept or return (default 1 business day). Overdue → reminder to the seller, then to the sales leader. Leaders can reassign, with a reason.
- **FR-19 Opportunity record:** amount (ARR), type (seats, usage tier, add-on, multi), CRM opportunity ID or URL, expected close date. Outcome: WON (closed ARR, date) or LOST (reason).
- **FR-20 Credit.** Each CSQL stores the sourcing CSM and the working seller. Reports count "CS-sourced" by those fields. Compensation rules are **out of scope**.

### 4.5 Insight
- **FR-21 Overview (answer first):**
  - **the sentence:** pipeline created and revenue won from signals this quarter
  - **three figures:** waiting for triage, waiting for sellers, won this quarter
  - **my work:** for CSMs and sellers
- **FR-22 Results page** (recorded facts only, by period):
  - signals raised, accepted, dismissed
  - CSQLs routed, accepted and converted
  - pipeline and won ARR
  - conversion by rule type, CSM and seller
  - dismissal reasons
  - median time to triage and to seller response
  - CSV export
- **FR-23 Rule tuning:** per rule, raised → accepted → opportunity → won, the dismissal-reason mix, and the median estimated value vs the recorded opportunity amount. Rule changes are versioned (audit log).

### 4.6 Collaboration and notifications
- **FR-24** Notes and an activity timeline on each account, signal and CSQL.
- **FR-25** In-app notifications plus email (Mailpit locally), for: routed to you, returned to you, deadline approaching or overdue, CSQL won. Each person can turn email off.
- **FR-26 Weekly digest email** (Monday): a person's open signals and CSQLs, plus last week's results. Built from the same service as the overview.

### 4.7 Integrations out
- **FR-27 Outbound webhook** (signed with HMAC) on: `csql.routed`, `csql.accepted`, `csql.opportunity_created`, `csql.closed`. Lets the vendor create the CRM opportunity with their own automation. Delivery attempts are logged and retried.
- **FR-28 Inbound opportunity update:** `POST /api/crm/opportunity-update` (bearer key) to set stage, amount or outcome from the CRM.

---

## 5. Non-functional requirements

- **NFR-1 Performance:** queue and overview under 1s at 2,000 accounts and 90 days of daily usage (180k snapshot rows); detection run under 60s for 2,000 accounts.
- **NFR-2 Correctness:**
  - money is stored as integer minor units with a currency
  - every estimated value can be reproduced from its stored inputs
  - only recorded facts count in results
- **NFR-3 Security:**
  - org scoping on every query
  - ingest and CRM keys stored as hashes, shown once, rotatable
  - webhook signing secret
  - rate limits on public endpoints
- **NFR-4 Accessibility:** WCAG 2.1 AA (axe sweep across key screens).
- **NFR-5 Responsive:** usable at 390px wide; triage works on a phone.
- **NFR-6 Audit:** every state change, rule change and reassignment is logged with who, when and why.
- **NFR-7 Honesty:** simulated usage is labelled everywhere it appears (record badge and data-freshness line) and can never be mistaken for live data.

---

## 6. Workflows

### 6.1 Main flow
```
Usage feed / CSV ─► daily snapshot ─► detection (rules) ─► SIGNAL (NEW)
   CSM triage: ── dismiss (reason) ─► DISMISSED ─► cooldown
               ── snooze (date)    ─► SNOOZED ─► back to NEW on date
               ── accept (note)    ─► CSQL (ROUTED to seller per routing rules, deadline starts)
   Seller:     ── return (reason)  ─► RETURNED ─► CSM: re-route / close
               ── accept           ─► ACCEPTED ─► record opportunity ─► OPPORTUNITY
               ── no opportunity   ─► CLOSED_NO_OPP (reason)
   Outcome:    ── WON (ARR, date) / LOST (reason)  ─► results & rule tuning
```

### 6.2 Deadline escalation
Each deadline (triage, seller) has three points:
- **due soon** (half the window left): reminder to the owner
- **overdue:** flagged red, reminder to the owner and their leader
- **overdue + 2 business days:** listed on the leader's "Needs reassigning" panel

### 6.3 Rule tuning loop
RevOps opens a rule → sees its funnel and dismissal reasons → edits the threshold → the change is versioned → new signals carry the rule version → results compare versions.

---

## 7. Information architecture

```
Overview            (answer sentence, my work, three figures)
Signals             (triage queue; Board by status | List; filters by rule, value, age, owner)
  └ Signal detail   (evidence, explanation, value working, account context, triage actions)
CSQLs               (Board: Routed → Accepted → Opportunity → Won/Lost; List)
  └ CSQL detail     (handoff note, evidence, timeline, opportunity, outcome)
Accounts            (list with seats/usage/ARR/renewal date; filter by CSM, owner, segment)
  └ Account detail  (usage charts, subscription, contacts, signals and CSQLs, timeline)
Results             (period switch; pipeline & won; by rule / CSM / seller; dismissals; export)
Rules               (RevOps: list, funnel per rule, edit, version history)
Settings            (branding, terminology, price book, routing, deadlines, dismiss reasons, data feeds & keys, webhooks, users)
```

---

## 8. Database schema (Postgres, Drizzle)

Every business table has `org_id`. Money is `bigint` minor units with a `char(3)` currency.

| Table | Key columns |
|---|---|
| `organizations` | name, slug, timezone, currency, config jsonb (branding, terminology, price book, deadlines, dismiss reasons) |
| `users` / auth tables | name, email, role, org_id, preferences jsonb |
| `teams` | name, kind (CS, SALES), segment, round-robin cursor |
| `accounts` | name, domain, segment, csm_id, owner_id, crm_id, renewal_date (derived), status |
| `contacts` | account_id, name, title, email, seniority, first_seen_at, source |
| `subscriptions` | account_id, plan, seats_purchased, credits_committed, term_start, term_end, arr_minor, currency, addons text[], price_overrides jsonb |
| `usage_snapshots` | account_id, date, active_seats, credits_used_term, workspaces jsonb `[{id,name,created_on,active_users}]`, gated_attempts jsonb `{addon: n}`, source (API/CSV/SIMULATED); **unique (account_id, date)** |
| `signal_rules` | key, type, name, params jsonb, weight, min_arr_minor, segments text[], cooldown_days, enabled, version |
| `signal_rule_versions` | rule_id, version, params, changed_by, changed_at, note |
| `signals` | account_id, rule_id, rule_version, type, status (NEW/SNOOZED/ACCEPTED/DISMISSED/EXPIRED), detected_at, last_evaluated_at, evidence jsonb, explanation, est_value_minor, value_inputs jsonb, priority, priority_breakdown jsonb, triage_due_at, triaged_by, triaged_at, dismiss_reason, dismiss_note, snooze_until, csql_id |
| `csqls` | number, account_id, sourced_by (CSM), owner_id (seller), routed_reason, status, handoff_note, est_value_minor, adjusted_value_minor, contact_id, seller_due_at, accepted_at, return_reason, opportunity jsonb {amount_minor, kind, crm_ref, expected_close}, outcome (WON/LOST/NO_OPP), outcome_amount_minor, outcome_reason, closed_at, lock_version |
| `notes` | entity_type, entity_id, author_id, body |
| `activity_log` | entity_type, entity_id, action, actor, summary, data jsonb |
| `notifications` | user_id, kind, title, link, read_at, email_status |
| `api_keys` | kind (INGEST, CRM), name, hash, last_used_at, revoked_at |
| `webhook_endpoints` / `webhook_deliveries` | url, secret, events · event, payload, status, attempts, next_attempt_at, response_code |
| `import_batches` | kind, filename, mapping jsonb, rows, created, updated, rejected, errors jsonb |

---

## 9. Permissions

| Action | ADMIN | REVOPS | CS_LEAD | CSM | SALES_LEAD | SELLER | EXEC |
|---|---|---|---|---|---|---|---|
| View accounts/signals/CSQLs | all | all | all | own book* | all | own + routed | all (read) |
| Triage signal | ✓ | — | ✓ | own book | — | — | — |
| Work CSQL (accept/return/opp/outcome) | ✓ | — | — | — | ✓ | own | — |
| Reassign signal / CSQL | ✓ | — | signals | — | CSQLs | — | — |
| Edit accounts/subscriptions | ✓ | ✓ | ✓ | own book | — | — | — |
| Rules, price book, routing, deadlines | ✓ | ✓ | — | — | — | — | — |
| Keys, webhooks, imports | ✓ | ✓ | — | — | — | — | — |
| Users and branding | ✓ | — | — | — | — | — | — |
| Results and export | ✓ | ✓ | ✓ | own | ✓ | own | ✓ |

\* "Own book" means accounts where they are the CSM. The CS leader sees all.

---

## 10. Integrations (MVP truth table)

| Integration | MVP state |
|---|---|
| Usage ingest API | **Real.** Bearer key, JSON batch, idempotent |
| CSV import (accounts, subscriptions, contacts, usage) | **Real** |
| Usage simulator | **Real script, simulated data.** `npm run usage:simulate` posts plausible daily aggregates through the **same ingest API**, marked `SIMULATED`, and labelled in the UI |
| Outbound webhooks | **Real.** HMAC-signed, logged, retried |
| CRM opportunity update (inbound) | **Real** endpoint, provider-neutral JSON |
| Email | **Real** via SMTP (Mailpit locally) |
| Native Salesforce/HubSpot connectors | **Not built.** Roadmap; the webhook and inbound endpoint are the bridge |
| Segment/Amplitude/Mixpanel connectors | **Not built.** Roadmap; vendors push aggregates to the ingest API (typically from their warehouse) |
| Slack | **Not built.** Roadmap |

---

## 11. Automation rules

| ID | Trigger | Action |
|---|---|---|
| A1 | Daily 06:00 org time, and after an ingest batch | Run detection for affected accounts |
| A2 | Signal created | Notify the CSM if priority is high; otherwise it joins the queue and the daily digest |
| A3 | Triage due soon / overdue / overdue + 2 days | Remind the CSM → the CS leader → the "Needs reassigning" panel |
| A4 | Signal accepted | Create a CSQL, route it, set the seller deadline, notify the seller, fire the `csql.routed` webhook |
| A5 | Seller deadline due soon / overdue | Remind the seller → the sales leader |
| A6 | CSQL returned | Notify the sourcing CSM with the reason |
| A7 | Snooze date reached | Signal back to NEW, CSM notified |
| A8 | Condition cleared for 7 days on a NEW signal | EXPIRED, with a note |
| A9 | Monday 07:00 | Weekly digest email per person (opt-out) |
| A10 | Webhook delivery failed | Retry with backoff (1m, 5m, 30m, 2h, 12h), then mark failed and show it in Settings |

---

## 12. Edge cases

1. **Account with no seller owner** → routed to the segment queue; with no queue, to the sales leader, with the routing reason "No owner; sent to sales lead".
2. **CSM with no accounts, or account with no CSM** → signals go to the CS leader's queue.
3. **Duplicate usage row for the same account and date** → upsert (last write wins); the change is logged.
4. **Usage arrives for an unknown account** → rejected per row with the reason, never auto-created.
5. **A seat count drops** (seats removed) while a seat signal is open → the evidence updates; if below the threshold for 7 days, EXPIRED.
6. **Subscription term ends or renews mid-window** → usage pace resets on the new term; the old term's signal expires.
7. **Price book missing for a rule's value** → value is "Not estimated" (null), never $0; priority uses the rule weight only.
8. **Signal accepted while another CSQL is open on the account** → offer "add to the open CSQL" (default) or "create a separate CSQL" (needs a reason).
9. **Seller leaves or is deactivated** → their open CSQLs are flagged for reassignment.
10. **Rule edited while signals are open** → open signals keep their rule version; re-evaluation uses the new version and notes the change.
11. **Concurrent triage by two people** → optimistic lock; the second sees "Already accepted by Priya at 10:14".
12. **Currency:** single currency per org in the MVP; subscriptions in other currencies are rejected at import with a clear message (roadmap).
13. **Stale data** → no new signals; the account shows the data age; open signals are not expired by stale data alone.
14. **Contact first seen with no title** → seniority unknown; the `NEW_EXECUTIVE` rule never fires on unknown.

---

## 13. White-label architecture

- **Core vs configuration:**
  - **Core:** detection engine, workflow and state machines, deadlines, routing, results.
  - **Configuration (per organisation):** everything that names Fernway.
- **Config file** `config/clients/<name>.json` (seeded into `organizations.config`):
  - branding: name, logo text, primary and accent colours
  - **terminology:** "CSQL" or "Expansion lead"; "Credits" or "API calls"; "Seats" or "Licenses"; add-on names
  - **price book:** seat price, credit tiers, overage rate, add-ons and prices
  - rule set (rule types and parameters)
  - deadlines and business days, dismissal reasons, routing segments
- **Rule types are core; rule instances are config.** A new product metric (e.g. "API calls") is a configured `USAGE_PACE` rule over a renamed metric, not code.
- **New client:** copy `config/clients/demo.json`, edit, then run `npm run db:seed -- --org-only`.

## 14. Admin configuration (Settings)

- **Branding and terminology**
- **Price book:** seats, credit tiers, overage, add-ons
- **Rules:** a list with on/off; an editor with a live preview ("would raise 12 signals today on these accounts")
- **Routing:** segments and teams, round-robin members, fallback
- **Deadlines:** triage and seller windows, business days, holidays
- **Dismissal reasons**
- **Data feeds:** ingest keys (create, rotate, revoke), last ingest, rejected rows
- **CRM:** inbound key; outbound webhooks with delivery log
- **Users and roles**

## 15. MVP boundaries

**In:** everything in §4, with the integrations marked Real in §10.

**Out (roadmap):**
- native CRM and analytics connectors
- Slack
- risk and contraction signals (the same engine, inverted)
- multi-currency
- compensation and credit splits
- AI drafting of outreach

**AI in the MVP:** none required.
- Every signal is a deterministic, explainable rule, which is what RevOps needs to trust and tune.
- An optional Claude-drafted outreach note is the first roadmap candidate (brief §17: only where it adds real value).
