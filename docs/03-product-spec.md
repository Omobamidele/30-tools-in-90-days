# Phase 3 — Product Specification: Exposure Register

**Tool:** 01 · **Written:** 2026-09-23 · **Selected in:** [02-opportunity-discovery.md](02-opportunity-discovery.md) (C + D) · **Status:** Draft for review

"Exposure Register" is the working product name. Every deployment can rename it (see §15).

---

## 1. Product brief

**One line:** a system of record for the money an event company has committed in supplier contracts. It shows what is at risk now and when it becomes due, who carries it, and how each approved change moves it.

**The problem it solves.** Every signed supplier contract creates dated financial obligations: deposits, room-block attrition, F&B minimums, cutoffs, tiered cancellation penalties and final guarantees. These live in PDFs, calendars and people's memory. When attendance or scope changes, nobody recalculates the exposure, and nobody knows whether the agency or the client carries each liability until the invoice arrives. Penalties are discovered at reconciliation, when it's too late to act.

**What the system does:**
1. Turns contracts into **structured obligations**. An AI proposes the clause values, and a human confirms each one.
2. Calculates **live exposure** per contract, event, client and the whole portfolio, with the working visible for every number.
3. Allocates each exposure between **agency and client** using the liability rules in the client agreement.
4. Routes **deadlines** to owners, with reminders and escalation.
5. Runs every scope or headcount change through **change control**: pricing, internal approval, client approval, then an automatic recalculation of exposure.
6. Records **decisions** and, after the event, **expected vs actual penalties**. That record proves the value and sharpens the model.

**What it is not:** a registration platform, a room-block booking engine, a full budgeting and accounting ledger, or a venue-sourcing tool. It sits alongside those.

---

## 2. Personas

Role-based. The pronoun for everyone is "they".

| Persona | Role | Goals | Frustrations today | Primary screens |
|---|---|---|---|---|
| **Operations Director** | Owns delivery across all events; the primary owner of the system | No surprise penalties; knows where the risk is this week | Finds out about missed cutoffs from hotel invoices; chases planners for status | Portfolio overview, deadlines, escalations |
| **Event Manager** | Runs 3–8 events at once | Keeps contracts, deadlines and changes straight without extra admin | Contract terms buried in PDFs; changes agreed on calls and never priced | Event workspace, contract review, change requests |
| **Finance Lead** | Cash, liabilities, reconciliation | Knows the committed spend, deposits due and likely penalties; clean records of who pays | Surprise charges at reconciliation; disputes over who carries a penalty | Deposits/payments view, exposure by bearer, post-event variance |
| **Managing Director** | Business owner and approver | Portfolio risk in one number; approves large or low-margin changes | No aggregate view; learns about losses after the event | Portfolio overview, approval queue |
| **Client Approver** (external) | Client-side event owner | Approve or reject changes with the cost clearly shown | Unclear change costs; disputes afterwards | Tokenised approval page (no account) |

---

## 3. User stories

### Contracts and obligations
- **US-01:** As an Event Manager, I upload a supplier contract PDF to an event so its terms are captured in one place.
- **US-02:** As an Event Manager, I see the proposed clause values *with the source text quoted beside each one*, and I confirm, edit or reject each value before it counts.
- **US-03:** As an Event Manager, I enter clauses manually when no extraction is available or the document is a scan.
- **US-04:** As an Event Manager, I record a contract amendment as a new version, and the previous terms stay in history.
- **US-05:** As an Event Manager, I enter or import room pickup by night (manually or by CSV from a housing report) so attrition projections stay current.

### Exposure
- **US-06:** As an Operations Director, I see total exposure across all live events, split into agency-borne, client-borne and unassigned.
- **US-07:** As anyone viewing an exposure number, I open its working (the formula, inputs and clause source) so I can trust or challenge it.
- **US-08:** As an Event Manager, I model a scenario ("attendance −20%", "cancel on date X") and see the effect on every contract before deciding anything.
- **US-09:** As a Finance Lead, I see deposits and payments due in the next 30/60/90 days across all events.

### Deadlines and escalation
- **US-10:** As an Event Manager, I get reminders before each obligation date at offsets my organisation has configured.
- **US-11:** As an Operations Director, I'm escalated to when an obligation becomes overdue or an event's exposure crosses a threshold.
- **US-12:** As any internal user, I record a decision against an alert (e.g. "released 20 rooms/night", "client informed") so there's a trail.
- **US-13:** As any internal user, I subscribe to a calendar feed of my obligations.

### Change control
- **US-14:** As an Event Manager, I raise a change request (headcount change, added or removed function, upgrade, element cancellation) with cost lines.
- **US-15:** As an Event Manager, I see the change's effect on client price, agency margin *and contractual exposure* before it's sent.
- **US-16:** As an MD, I approve changes above a value limit or below a margin floor before they go to the client.
- **US-17:** As a Client Approver, I open a secure link, see what is changing and what it costs, and approve or reject it with a comment, without creating an account.
- **US-18:** As an Event Manager, once a change is approved the event forecast updates, exposure recalculates, and supplier-update tasks are created for me.

### Post-event
- **US-19:** As a Finance Lead, I record the penalties actually charged per contract, and compare them with the exposure projected at key dates.
- **US-20:** As an MD, I see a report of penalties avoided or incurred, by client and event type.

### Administration
- **US-21:** As an Admin, I configure branding, terminology, clause types, reminder offsets, thresholds, liability defaults, currencies and FX rates without code changes.
- **US-22:** As an Admin, I invite users and assign roles.

---

## 4. Functional requirements

### 4.1 Clients and agreements
- FR-1.1 Client records: name, industry, billing contact, notes.
- FR-1.2 **Client agreements** (MSA/SOW) with a **liability matrix**: for each obligation category (deposit, attrition, F&B shortfall, cancellation, other), the bearer is `CLIENT`, `AGENCY` or `SPLIT` (with an agency %). Agreements have effective dates, and an event uses the agreement in force on its contract dates.
- FR-1.3 If no agreement applies, exposure is shown as **Unassigned bearer**. It is never silently given to anyone.

### 4.2 Events
- FR-2.1 Event: client, name, type (configurable), start/end dates, destination, timezone, owner, team, status, forecast attendance, base currency.
- FR-2.2 Statuses: `Planning → Contracted → Live → Delivered → Reconciled`, plus `Cancelled` and `Postponed`. Transitions are logged.
- FR-2.3 Event workspace tabs: Overview · Contracts · Obligations · Exposure · Changes · Activity.

### 4.3 Suppliers and contracts
- FR-3.1 Supplier: name, type (Hotel, Venue, Caterer, AV/Production, Transport, DMC, Other), contacts. Duplicate detection on normalised name plus city.
- FR-3.2 Contract: event, supplier, reference, signed date, currency, contracted value, document(s), status (`Draft`, `In review`, `Active`, `Superseded`, `Closed`, `Cancelled`), version number.
- FR-3.3 Amendments create a new version. Earlier versions are read-only and their obligations become `Superseded`.
- FR-3.4 A contract becomes `Active` only when all its clauses are confirmed. Unconfirmed clauses are visibly excluded from exposure totals, and the event shows an "incomplete data" warning.

### 4.4 Clause types (the obligation model)

| Clause type | Fields | Creates |
|---|---|---|
| **Payment / deposit** | due date, amount or % of contracted value, refundable (Y/N), paid date, paid amount | Dated obligation (payment) |
| **Room block** | nights[] (date, rooms, rate), commitment % (e.g. 80%), basis (`PER_NIGHT` / `CUMULATIVE`), damages % of rate (default 100%), cutoff date/time (local), review/reduction points (date, max reduction %) | Cutoff obligation, review obligations, attrition exposure |
| **F&B minimum** | minimum amount, basis (pre-tax / pre-service-charge), shortfall surcharge % (service charge/tax applied to the shortfall), forecast F&B spend (manual, or per-head × forecast attendance) | F&B shortfall exposure |
| **Cancellation schedule** | tiers[] (from date, to date, penalty as % or fixed), basis (`CONTRACT_VALUE` / `ROOM_REVENUE` / `FB_MINIMUM` / `FIXED`), deposit treatment (`CREDITED` / `ADDITIONAL`) | Cancellation exposure, tier-change obligations |
| **Final guarantee** | due date/time, subject (attendance / F&B covers), tolerance % | Dated obligation |
| **Other deadline** | label, due date, owner | Dated obligation (e.g. rooming list, final specs) |

Every extracted field keeps a `source_quote` and `source_page`.

### 4.5 Clause extraction
- FR-5.1 Uploading a PDF (text layer) starts extraction. An LLM returns structured clause proposals with source quotes.
- FR-5.2 Proposals open in a **review screen**: the contract text is on the left, proposed fields on the right, and each field has Confirm, Edit or Reject.
- FR-5.3 If extraction is unavailable (no API key, a scan with no text layer, or an extraction error), the user is told why in plain language and given the manual entry form. **Nothing is ever presented as extracted when it wasn't.**
- FR-5.4 Each extraction run is logged: model, time, number of fields proposed, confirmed, edited and rejected. The edit rate is shown to admins as an accuracy measure.

### 4.6 Pickup and forecasts
- FR-6.1 Pickup per room-block night: manual grid entry or CSV import (columns mapped at upload, with a preview and row-level errors).
- FR-6.2 Every pickup snapshot is dated, so pickup pace can be reviewed over time.
- FR-6.3 Projection method per block: `CURRENT` (pickup as of today) or `FORECAST` (the planner's entered expected final pickup per night). The method used is always shown next to the number.

### 4.7 Exposure engine (deterministic)
All formulas are pure functions with unit tests. Money is stored as integer minor units.

- **Cancellation exposure (as of date D)** = tier_penalty(D) × basis. If deposits are `CREDITED`: net cash still owed = max(0, penalty − deposits paid). Both gross and net are shown.
- **Attrition exposure (projected):**
  - `PER_NIGHT`: Σ over nights of max(0, ⌈rooms × commitment%⌉ − projected_pickup) × rate × damages%
  - `CUMULATIVE`: max(0, ⌈Σrooms × commitment%⌉ − Σprojected_pickup) × average contracted rate × damages%
- **F&B shortfall** = max(0, minimum − forecast F&B spend) × (1 + surcharge%)
- **Outstanding payments** = scheduled amounts not yet paid, grouped by due date.
- **Current exposure** for an event = attrition + F&B shortfall (the penalties expected if nothing changes). **Cancellation exposure** is reported separately, because cancellation and attrition don't stack.
- **Allocation:** each exposure line is split into agency, client or unassigned using the liability matrix.
- **Currency:** each contract is calculated in its own currency. Portfolio totals are converted to the organisation's base currency using admin-maintained FX rates, and the rate date is shown.
- **Scenarios:** apply an attendance % change and/or a cancellation date to one event and see the result per contract, without saving anything.
- **Missing inputs:** exposure is returned as `INCOMPLETE` and lists what's missing. It is never shown as zero.

### 4.8 Deadlines, alerts and decisions
- FR-8.1 Obligations have a due date/time (in the supplier's local timezone where relevant), an owner, and a status: `Upcoming`, `Due soon`, `Overdue`, `Done`, `Waived`.
- FR-8.2 Reminders are sent at organisation-configured offsets (default 30/14/7/1 days) to the owner, in-app and by email when email is configured.
- FR-8.3 Escalation rules: an obligation overdue for more than N hours, an event exposure over a threshold, or a cancellation tier stepping up within N days. The alert goes to the configured role(s).
- FR-8.4 Alerts are closed by recording a **decision**: type (Released inventory, Renegotiated, Accepted risk, Client informed, Other), note, and optionally a linked change request.
- FR-8.5 Each user gets a personal ICS calendar feed (via a secret URL they can regenerate) of the obligations they own.

### 4.9 Change control
- FR-9.1 A change request is attached to an event: title, type, reason, requested by (internal or client), lines (description, supplier/contract link, cost delta, client price delta) and an attendance delta if relevant.
- FR-9.2 Client price is suggested from the organisation's pricing rules (markup % by category, management-fee %) and can be edited.
- FR-9.3 **Impact panel:** change in cost, price and margin, plus **exposure before and after** (the scenario engine run with the proposed attendance and scope).
- FR-9.4 Internal approval is required if the value is above a limit or the margin falls below a floor (both configurable). The approver role is configurable.
- FR-9.5 The client is sent a tokenised, single-use link that expires after a configurable time. The page shows the change summary, price and effect on commitments, and the client can approve or reject it with a comment. The approver's name, email, IP and timestamp are recorded.
- FR-9.6 On approval, the event forecast attendance and committed values update, exposure recalculates, and **supplier-update tasks** are created for the owner. Suppliers are not emailed automatically in the MVP.
- FR-9.7 Statuses: `Draft → Internal review → Sent to client → Approved | Rejected | Expired | Withdrawn → Applied`.

### 4.10 Post-event
- FR-10.1 After an event is `Delivered`, each contract records the actual penalties charged (attrition, F&B, other) and the invoice reference.
- FR-10.2 The variance report compares exposure projected at T-30, T-7 and the event start (from saved daily snapshots) with the actual charges.
- FR-10.3 The penalties-avoided report sums the exposure reductions linked to decisions (e.g. rooms released before cutoff), by event and client.

### 4.11 Portfolio overview
- Headline figures: current exposure (agency / client / unassigned), cancellation exposure, payments due in 30 days, overdue obligations. Each figure links to its breakdown. **No decorative charts.**
- An events-at-risk table, sortable, with saved views.
- A deadlines list for the next 14 days.

### 4.12 Search and navigation
- Global search across events, clients, suppliers, contracts and change requests.
- A command menu (Ctrl/⌘+K) for navigation and "new" actions.

---

## 5. Non-functional requirements

| Area | Requirement |
|---|---|
| Correctness | Exposure engine 100% unit-tested, including edge cases (§11). Integer money. Deterministic output |
| Auditability | Every change to clauses, pickup, approvals and decisions is recorded in the activity log (who, when, before → after) |
| Performance | Portfolio overview under 1s with 200 active events and 2,000 contracts. Tables paginate server-side |
| Security | Organisation-scoped data on every query. Role checks on the server. Hashed approval tokens that expire. Files stored privately |
| Privacy | Contracts may contain personal data. No contract text is sent to the LLM when extraction is disabled |
| Accessibility | WCAG 2.2 AA: keyboard navigation, focus states, labelled form fields, contrast |
| Responsive | Full function on desktop. Tablet supported. Phone: overview, deadlines, alerts, and the client approval page |
| Reliability | Reminders and escalations run from scheduled jobs that can be re-run without sending duplicates |
| Timezones | Stored in UTC. Supplier deadlines shown in the supplier's local time with the organisation's time beside it |
| Observability | Structured logs for jobs, extraction runs and email sends, each with a correlation ID |

---

## 6. Core workflows

**W1: contract to obligations**
```
Upload PDF → [text layer?] ─no→ manual entry
                 │yes
                 ▼
      Extraction (LLM) → Review screen → confirm/edit/reject each field
                 ▼
      All confirmed → Contract Active → obligations generated → exposure recalculated
```

**W2: monitoring**
```
Daily job: snapshot exposure → evaluate reminders → evaluate escalations → notify
Pickup update (manual/CSV) → recalculate → threshold crossed? → alert → decision recorded
```

**W3: change control**
```
Change raised → priced (rules) → impact (cost, margin, exposure before/after)
 → [needs internal approval?] → MD approves → client link sent
 → client approves → applied: forecast updated, exposure recalculated, supplier tasks created
```

**W4: post-event**
```
Event Delivered → actual penalties recorded → variance vs snapshots → Reconciled
```

---

## 7. Information architecture

```
Overview                   Portfolio exposure, events at risk, deadlines, approvals waiting for me
Events                     Table (saved views) → Event workspace
  └ Event                  Overview · Contracts · Obligations · Exposure (+ scenarios) · Changes · Activity
     └ Contract            Terms (clauses) · Document · Obligations · Versions · Activity
        └ Review           Extraction review (document | proposed fields)
Deadlines                  All obligations, filterable (mine / team / all; due window; type; status)
Changes                    All change requests, by status; my approval queue
Clients                    Table → Client (agreements & liability matrix, events, exposure by bearer)
Suppliers                  Table → Supplier (contracts, events, penalty history)
Reports                    Exposure by client · Payments schedule · Expected vs actual penalties · Decisions
Settings                   Organisation · Branding · Terminology · Users & roles · Clause types · Reminders &
                           escalation · Pricing rules · Approval limits · Currencies & FX · Email templates ·
                           Integrations · Extraction
/approve/:token            External client approval page (no app chrome)
```

---

## 8. Data model

All tables carry `id` (UUID), `org_id`, `created_at`, `updated_at`. Money is `*_minor` (bigint) plus a `currency` (ISO 4217).

```
organizations        id, name, slug, base_currency, timezone, config (jsonb: branding, terminology, thresholds…)
users                id, org_id, email, name, role, status, calendar_token_hash
clients              id, name, industry, billing_contact, notes
client_agreements    id, client_id, name, effective_from, effective_to, document_file_id
liability_rules      id, agreement_id, category {DEPOSIT|ATTRITION|FB_SHORTFALL|CANCELLATION|OTHER},
                     bearer {CLIENT|AGENCY|SPLIT}, agency_pct
events               id, client_id, name, type, start_date, end_date, destination, timezone,
                     status, owner_id, forecast_attendance, base_currency
event_members        event_id, user_id
suppliers            id, name, type, city, country, normalized_key, contacts (jsonb)
contracts            id, event_id, supplier_id, reference, version, supersedes_id, status,
                     signed_date, currency, contracted_value_minor
files                id, owner_type, owner_id, storage_key, filename, mime, size, sha256, has_text_layer
extraction_runs      id, contract_id, file_id, model, status, started_at, finished_at, error,
                     proposed_count, confirmed_count, edited_count, rejected_count
clauses              id, contract_id, type, status {PROPOSED|CONFIRMED|REJECTED}, data (jsonb, validated
                     per type), source_quote, source_page, confirmed_by, confirmed_at
room_block_nights    id, clause_id, night_date, rooms, rate_minor
pickup_snapshots     id, clause_id, captured_at, source {MANUAL|CSV}, file_id
pickup_values        snapshot_id, night_date, rooms_picked_up, forecast_final
obligations          id, contract_id, clause_id, kind {PAYMENT|CUTOFF|REVIEW|GUARANTEE|TIER_CHANGE|OTHER},
                     label, due_at, due_tz, amount_minor, owner_id, status, done_at, done_by
payments             id, obligation_id, paid_at, amount_minor, reference
exposure_snapshots   id, event_id, taken_at, payload (jsonb: per-contract lines, allocation, fx used)
alerts               id, event_id, obligation_id, rule, severity, status {OPEN|DECIDED|AUTO_RESOLVED},
                     opened_at, decided_at
decisions            id, alert_id, event_id, type, note, change_request_id, exposure_delta_minor, by_user
change_requests      id, event_id, number, title, type, reason, status, attendance_delta,
                     requested_by_type, created_by, internal_approved_by, internal_approved_at
change_lines         id, change_request_id, contract_id, description, cost_delta_minor, price_delta_minor
approval_tokens      id, change_request_id, token_hash, recipient_email, expires_at, used_at,
                     outcome, approver_name, comment, ip
tasks                id, event_id, change_request_id, title, owner_id, due_at, status
actual_penalties     id, contract_id, category, amount_minor, invoice_ref, recorded_by
notifications        id, user_id, kind, payload, read_at, emailed_at, dedupe_key (unique)
activity_log         id, actor_id, actor_type, entity_type, entity_id, action, diff (jsonb), at
saved_views          id, user_id, entity, name, filters (jsonb), sort
fx_rates             id, from_ccy, to_ccy, rate, as_of
```

---

## 9. Permissions

| Capability | Admin | Ops Director | Event Manager | Finance | MD | Client (link) |
|---|---|---|---|---|---|---|
| View portfolio | ✓ | ✓ | Own/team events | ✓ | ✓ | — |
| Create/edit events | ✓ | ✓ | Own/team | — | — | — |
| Upload contracts, confirm clauses | ✓ | ✓ | Own/team | — | — | — |
| Enter pickup | ✓ | ✓ | Own/team | — | — | — |
| Record payments / actual penalties | ✓ | ✓ | — | ✓ | — | — |
| Raise change requests | ✓ | ✓ | Own/team | — | ✓ | — |
| Internal approval of changes | Configurable (default: MD, Ops Director) | | | | | — |
| Approve/reject a change | — | — | — | — | — | That change only |
| Record decisions | ✓ | ✓ | Own/team | ✓ | ✓ | — |
| Clients & agreements | ✓ | ✓ | View | ✓ | ✓ | — |
| Settings | ✓ | — | — | — | View | — |

Role names and the internal-approval role mapping can be configured per deployment.

---

## 10. Integrations

| Integration | MVP | How |
|---|---|---|
| LLM clause extraction | **Yes** | Claude API with structured output. Off unless a key is configured |
| Email (reminders, escalations, client approval links) | **Yes** | Transactional email provider via an adapter. With no provider set, links can be copied manually, and the UI says emails are not being sent |
| Calendar | **Yes** | ICS feed per user (read-only) |
| Pickup import | **Yes** | CSV with column mapping (fits Passkey/GroupSync/hotel pickup report exports) |
| Registration platforms (Cvent, Bizzabo, Swoogo) | Later | Attendance via API → forecast |
| Housing (Passkey, GroupSync) | Later | Automatic pickup sync |
| Accounting (Xero, QuickBooks, NetSuite) | Later | Payments and actual penalties export |
| E-signature | Later | Automatic ingestion of signed contracts |
| Slack / Teams | Later | Escalation delivery |

Every integration has an adapter interface. A disconnected integration shows a clear status in Settings. None is ever faked.

---

## 11. Automation rules (defaults, all configurable)

| # | Trigger | Condition | Action |
|---|---|---|---|
| R1 | Daily 06:00 in the organisation's timezone | — | Exposure snapshot for all non-closed events |
| R2 | Daily | Obligation due in {30, 14, 7, 1} days | Remind owner (deduplicated per obligation × offset) |
| R3 | Hourly | Obligation overdue for more than 24h | Alert + escalate to Ops Director |
| R4 | On recalculation | Event current exposure ≥ threshold (org default, can be overridden per event) | Alert + escalate to Ops Director and MD |
| R5 | Daily | Cancellation tier steps up within 14 days | Notify owner + Ops Director with the tier delta |
| R6 | Daily | Room-block cutoff within 21 days and projected attrition > 0 | Alert: "Release or renegotiate before cutoff" |
| R7 | Change submitted | Value > limit OR margin < floor | Route to internal approval |
| R8 | Change approved by client | — | Apply: update forecast, recalculate, create supplier tasks, notify owner |
| R9 | Approval link | Past its expiry | Mark `Expired`, notify owner |
| R10 | Event end date passed | Status `Live` | Prompt owner to mark `Delivered` and record actual penalties |

---

## 12. Edge cases

1. **Missing clause values:** exposure is `INCOMPLETE` with the missing fields listed. Never zero.
2. **Unconfirmed extracted clauses:** excluded from totals and flagged at contract and event level.
3. **Pickup above the block:** attrition floors at 0. Overflow is shown as information.
4. **Several room blocks in one contract, or sub-blocks:** each block is its own clause and calculated separately.
5. **Cumulative vs per-night basis:** both supported. The basis is always shown beside the number.
6. **Cancellation tier boundaries:** tier ranges must not overlap or leave gaps (validated on save). The boundary date belongs to the later, higher tier, and this is documented.
7. **Deposit credited vs additional:** a flag on the clause. Net and gross are both shown.
8. **Contract amendment:** a new version. The old version's obligations are superseded, and open alerts on them auto-resolve with a note.
9. **Event postponed:** obligations are kept. A banner asks the owner to review the dates, because contract terms decide what happens.
10. **Event cancelled:** cancellation exposure at the cancellation date becomes the expected charge. The post-event flow still runs.
11. **Currency mismatch:** calculated in the contract currency. Portfolio conversion shows the FX rate date. A missing FX rate makes the total `INCOMPLETE` for that currency.
12. **Timezone of deadlines:** a hotel cutoff at "5:00 pm local" is stored with its timezone. Shown in supplier time plus organisation time.
13. **Approval link reused, expired or forwarded:** single use. Later visits show the outcome read-only. Expired links can be reissued by the owner.
14. **Change approved after a relevant deadline passed:** a warning in the impact panel and in the approval confirmation.
15. **Duplicate supplier:** the normalised key suggests a merge. The admin chooses.
16. **No client agreement:** allocation goes to `Unassigned`, which appears as its own total everywhere.
17. **Concurrent edits:** optimistic locking on the contract, clauses and change requests. A conflict shows who changed what.
18. **Scanned PDF with no text layer:** extraction is not attempted. The reason is shown and manual entry offered.
19. **Zero or negative attendance delta pushing the forecast below 0:** blocked by validation.
20. **Reminder job re-run:** a dedupe key prevents duplicate notifications.

---

## 13. Error states (user-facing wording)

| Situation | Message pattern |
|---|---|
| Extraction failed | "We couldn't read the terms from this document. You can enter them manually; the file is saved." Retry is available |
| Extraction disabled | "Automatic term extraction isn't set up for this workspace. Enter terms manually, or ask an admin to enable it in Settings → Extraction." |
| CSV import errors | Row-level table: row, column, problem, value. Valid rows can still be imported |
| Email not configured | A persistent notice in Settings and on send actions: "Emails aren't being sent. Copy the approval link to share it." |
| Exposure incomplete | Inline: "Incomplete: missing F&B forecast, FX rate EUR→USD", each item linking to where it's fixed |
| Permission denied | "You don't have access to this event. Ask an Operations Director to add you." |
| Save conflict | "This contract was updated by {name} at {time}. Review their changes before saving." |
| Expired approval link | "This approval link has expired. {Agency name} has been notified and can send a new one." |

---

## 14. White-label architecture

**Core logic** (never changes per client): the exposure engine, the obligation and alert lifecycle, change-control state machine, audit log, permission checks.

**Client configuration** (per organisation, stored in `organizations.config` and seeded from `config/<client>.json` at deploy):

| Area | Configurable |
|---|---|
| Brand | Product name, logo, favicon, primary/accent colours (validated for contrast), font family (from an approved list) |
| Terminology | Event/Programme/Project · Client/Account · Change request/Variation · Supplier/Vendor (singular and plural) |
| Workflow | Event types, statuses shown, change request types, decision types |
| Clause library | Enabled clause types, defaults (commitment %, damages %, surcharge %) |
| Rules | Reminder offsets, escalation thresholds and recipients, approval limits, margin floor, approval link expiry |
| Pricing | Markup % by cost category, management fee % |
| Roles | Role display names, internal-approver role(s) |
| Finance | Base currency, enabled currencies, FX rates |
| Email | Sender name and address, templates (reminder, escalation, approval request, outcome) with variables |
| Integrations | Extraction on/off (and model), email provider, future connectors |
| Domain | App URL, approval-link domain |

Deploying for a new agency means a config file, a branding pass and setting environment variables. No code forks.

---

## 15. Admin configuration (Settings screens)

Organisation · Branding (with live preview) · Terminology · Users & roles · Clause types & defaults · Reminders & escalation · Pricing rules · Approval limits · Currencies & FX · Email templates (with a test send) · Integrations (status of each) · Extraction (on/off, accuracy stats).

---

## 16. MVP boundaries

**In the MVP:**
- Clients and agreements with the liability matrix
- Events, suppliers, contracts with versions
- All six clause types
- LLM extraction with the confirmation review, plus manual entry
- Pickup by manual grid and CSV import
- The full exposure engine, including scenarios and allocation
- Obligations, reminders, escalations, decisions
- ICS feed
- Change control with internal approval and the tokenised client approval page
- Post-event actual penalties and the variance report
- Portfolio overview, deadlines, changes, reports (four listed)
- Global search and command menu
- Settings for all §14 areas
- Email adapter
- Audit log
- Clearly labelled demo workspace seed data (a fictional agency, marked "Demo data" in the UI)

**Not in the MVP (on the roadmap):**
- Client login portal (the MVP uses approval links only)
- Supplier portal and automatic supplier emails
- Registration, housing, accounting and e-signature integrations
- Full budget ledger (qondor territory)
- Mobile apps
- Automatic FX rate feeds
- SSO
- Multi-organisation admin console

**Must be validated with operators (before or during build):**
- How often penalties occur and how large they are
- Typical number of contracts per event
- Whether clients will use approval links
- Which of the six clause types matter most
