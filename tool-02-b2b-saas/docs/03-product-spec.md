# Phase 3 — Product Specification: True-up Desk

> Replaces the Expansion Signal Desk spec (2026-10-11; see [02 § Selected system (revised)](02-opportunity-discovery.md)). Evidence labels as in doc 01: **[V]** verified, **[A]** assumption.

## 1. Product brief
A mid-market SaaS vendor sells contracts that mix a platform fee, seats and a usage commitment, with overage beyond it. Each month three systems should agree, and often don't:
- **The contract:** what the customer committed to and the overage rules.
- **The product:** what the customer actually used (seats, metered units).
- **Billing:** what was actually invoiced.

**[A]** Gaps leak money both ways:
- overage nobody billed
- seats above the contract nobody trued up
- invoices that charge too much (a dispute waiting to happen)
- a missing invoice
- a customer using a fraction of their commitment (a renewal at risk that CS hasn't seen)

**[V]** True-ups are standard contract terms. Vendors reconcile used licences against contracted ones at an interval and invoice the gap ([GitLab: billing for seat overages](https://docs.gitlab.com/subscriptions/quarterly_reconciliation/); [DealHub: true-up billing](https://dealhub.io/glossary/true-up-billing/)).

**True-up Desk** runs that reconciliation every month for every account. It raises **exceptions** with the arithmetic shown. A person decides each one: bill the gap, credit the customer, hand it to customer success, or dismiss it with a reason. **Only adjustments a person records count in the ledger.**

**What it is not:** a billing system. It doesn't meter, rate or send invoices. It reads usage and invoices from the systems that do, and writes back decisions (webhooks, CSV).

## 2. Personas
| Persona | Role key | Daily job in the tool |
|---|---|---|
| Billing ops ("Dana Cho") | `BILLING` | Works the exception queue, proposes adjustments, records them once invoiced or credited |
| Finance lead ("Marcus Webb") | `FINANCE_LEAD` | Approves adjustments above the approval limit; owns the monthly close |
| CSM ("Priya Nair") | `CSM` | Receives under-use exceptions on their accounts; records what they did |
| CS lead | `CS_LEAD` | Sees all CS actions; reassigns |
| RevOps ("Sam Okafor") | `REVOPS` | Configures pricing, tolerances and rules; manages feeds and keys |
| Admin | `ADMIN` | Everything, plus people |
| Executive | `EXEC` | Reads the ledger and the monthly close |

## 3. User stories (MVP)
1. As billing ops, I see this month's exceptions, biggest gaps first, so I fix the money before invoices go out.
2. As billing ops, I open an exception and see **contract vs usage vs invoice** side by side, with the arithmetic, so I can trust the number.
3. As billing ops, I propose an adjustment (amount and memo). If it's within my approval limit I approve it myself; otherwise it goes to the finance lead.
4. As finance lead, I approve or reject proposed adjustments with a reason.
5. As billing ops, once the adjustment is invoiced or credited in the billing system, I record it with the invoice or credit-note reference. It then counts in the ledger.
6. As billing ops, I dismiss an exception with a reason from a fixed list (e.g. "Contract amendment not in the system yet").
7. As a CSM, I'm told when one of my customers is far under their commitment. I record what I did (a call booked, a plan agreed, nothing needed).
8. As finance lead, I see the monthly close as a checklist: usage received, invoices received, reconciliation run, exceptions reviewed.
9. As RevOps, I tune tolerances and thresholds, preview how many exceptions a change would raise, and save it as a new version with a note.
10. As an executive, I read in one sentence what we recovered and credited this quarter, and can open every line.

## 4. Functional requirements
**Data in:**
- **FR-1:** Usage arrives per account per day through the existing ingest API or CSV, unchanged from the previous build.
- **FR-2:** Invoices arrive through `POST /api/ingest/invoices` (INGEST key) or CSV:
  - fields: invoice number, account CRM ID, period start and end, issued date, lines (kind, quantity, unit price, amount, description), and an external reference
  - rows are validated one by one, rejected rows are reported back, and resending the same reference updates rather than duplicates
- **FR-3:** Accounts and contracts import from CSV (existing importer), extended with billing cadence and true-up terms.

**Reconciliation:**
- **FR-4:** A monthly job (`runMonthly`, also on demand) reconciles each account with a contract active in that month. It is idempotent per org and month: re-running refreshes the numbers and never duplicates exceptions.
- **FR-5:** Expected billing for a month (`src/core/recon/expected.ts`):
  - **Recurring:** ARR ÷ 12 for monthly billing. Quarterly and annual billing put the full amount in the period's first month.
  - **Seat true-up**, if the contract allows it: (peak active seats in the month − seats purchased) × seat price ÷ 12, when above zero.
  - **Usage overage:** units used beyond the annual commitment *during this month*, × the overage rate. Monthly overage contracts bill it monthly; term-end contracts bill the term total in the term's last month.
  - Each expected line carries a plain-English `working` string.
- **FR-6:** Invoiced amounts are the sum of invoice lines whose period falls in that month, grouped by kind.
- **FR-7:** Exception types (`src/core/recon/classify.ts`):

| Type | Raised when | Amount | Goes to |
|---|---|---|---|
| `UNBILLED_USAGE` | Expected usage overage − invoiced overage > tolerance | Gap to bill | Billing |
| `UNBILLED_SEATS` | Expected seat true-up − invoiced seat true-up > tolerance | Gap to bill | Billing |
| `UNDER_BILLED` | Recurring fees invoiced below contract by more than tolerance | Gap to bill | Billing |
| `OVER_BILLED` | Total invoiced − total expected > tolerance | Credit owed | Billing |
| `MISSING_INVOICE` | Expected > 0 and no invoice for the account and month | Full expected amount | Billing |
| `UNDER_USE` | ≥ 25% of the term elapsed and projected term usage < under-use threshold | None (risk) | The account's CSM |
| `RENEWAL_TRUE_UP` | Term-end overage contract, term ends within N days, projected overage > 0 | Projected true-up | Billing |

  Tolerance is the larger of `toleranceMinor` and `tolerancePct` × expected, configurable per type.
- **FR-8:** If a re-run finds a gap closed (e.g. a later invoice included it), the open exception resolves automatically with a system note. If the gap changed, the amount refreshes.

**Decisions:**
- **FR-9:** Money exceptions move through **NEW → PROPOSED → APPROVED → RECORDED**, or **DISMISSED** with a reason.
  - Proposals within the approval limit are approved in the same step.
  - Above it, a `FINANCE_LEAD` or `ADMIN` approves or rejects with a reason. A rejection returns the exception to NEW.
- **FR-10:** `UNDER_USE` moves through **NEW → WITH_CS** (assigned to the account's CSM, or the CS lead if there's none) **→ DONE** (an action note is required), or DISMISSED.
- **FR-11:** Every change writes the activity log. Writes check the lock version and refuse a stale update.
- **FR-12:** Review deadline is N business days from raise (config). Reminders run when it's due soon and when it's overdue; leaders are escalated after +2 days (the existing reminder pattern).

**Ledger and reporting:**
- **FR-13:** The ledger lists recorded adjustments only: INVOICE (recovered) and CREDIT_NOTE (credited back). It answers by period (quarter, year, all) in a sentence, with a table and a CSV export. Proposed or approved but unrecorded adjustments are shown separately as "in progress" and never added to recovered.
- **FR-14:** The monthly close checklist for the current month:
  - usage feed fresh (≤ stale days)
  - invoices received for every billable account
  - reconciliation run
  - exceptions decided (n of N)

**Notifications and integrations:**
- **FR-15:** In-app and email notifications: assigned, approval needed, approved or rejected, sent to CS, overdue.
- **FR-16:** Outbound signed webhooks: `exception.raised`, `adjustment.approved`, `adjustment.recorded`, `exception.dismissed`.

**Configuration:**
- **FR-17:** Per org, in `config/clients/<name>.json`:
  - price book (seat price, credit tiers, overage per 1,000)
  - reconciliation (tolerances, under-use %, term-ending days, approval limit, review days)
  - reason lists, terminology, brand
- **FR-18:** Rules are versioned per type: enabled, tolerance, and threshold. A rule can be previewed against the current month before saving.

## 5. Non-functional requirements
- **Correctness first:** all money is bigint minor units; the engine is pure, deterministic and unit-tested; every number on screen can be traced to its working.
- **Performance:** reconciling 2,000 accounts in under 60s locally; list pages in under 1s warm.
- **Security:** role-based permissions enforced in services (not just the UI); API keys stored hashed; webhooks HMAC-signed.
- **Accessibility:** WCAG 2.1 AA; an axe sweep in CI; keyboard use everywhere (the command search, dialogs, sheets).
- **Honesty:** demo invoices and usage are labelled SIMULATED everywhere they appear.

## 6. Permissions
| Action | ADMIN | REVOPS | FINANCE_LEAD | BILLING | CS_LEAD | CSM | EXEC |
|---|---|---|---|---|---|---|---|
| View exceptions and accounts | ✓ | ✓ | ✓ | ✓ | ✓ | own book | ✓ |
| Propose, record, dismiss money exceptions | ✓ | | ✓ | ✓ | | | |
| Approve above the limit | ✓ | | ✓ | | | | |
| Act on under-use | ✓ | | | | ✓ | own | |
| Rules, settings, feeds, keys | ✓ | ✓ | | | | | |
| People | ✓ | | | | | | |
| Ledger | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## 7. Edge cases and error states
- Contract mid-month start or end: recurring fees are prorated by days.
- No contract: no reconciliation, and the account shows "No active contract".
- Stale usage (older than `staleAfterDays`): usage-based exceptions are held, and the account is flagged "Usage feed stale".
- An invoice for an unknown account: the row is rejected with the reason.
- A duplicate invoice reference: upsert, no duplicate.
- A negative gap inside tolerance: nothing is raised.
- Currency mismatch: the row is rejected.
- Two people acting on one exception: the lock version conflict asks the second to refresh.
- The approval limit is checked on the server; an attempt above the limit returns "Needs finance approval".

## 8. White-label
Brand, terminology, price book, tolerances, reasons and approval limits are all in client config. The pricing model (seats + commitment + overage tiers) is core; the numbers are config. Another consultant onboards a client by writing one config file and connecting two feeds (usage, invoices).

## 9. MVP boundaries
**In:**
- monthly reconciliation
- seven exception types
- the decision workflow and ledger
- feeds and imports
- rules with preview
- notifications, webhooks, roles

**Out (roadmap):**
- native Stripe, Chargebee, Metronome, Orb and Salesforce connectors (webhooks and CSV only for now)
- multi-currency, mid-term amendments, ramp deals and prepaid credit drawdown models
- revenue-recognition outputs
