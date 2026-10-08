# Phase 2 — Opportunity Discovery: B2B SaaS (mid-market)

**Context:** a SaaS vendor with $20M–$150M ARR, selling contracts of $25K–$150K a year to mid-market companies (see [01 §0](01-industry-research.md)). Evidence labels follow doc 01: **[V]** verified, **[V2]** widely cited but read secondhand, **[W]** weak, **[A]** assumption.

The candidates below are **not ranked**. Each ends with its trade-offs. The user selects one.

## The constraint that shapes every candidate

**Off-the-shelf tools exist for each single function:**
- **CS platforms:** Gainsight, ChurnZero, Vitally
- **Forecasting:** Clari
- **Routing:** LeanData, Chili Piper
- **Billing:** Chargebee, Stripe
- **CPQ:** Salesforce CPQ, DealHub

**What those tools already cover:**
- **[V]** Gainsight's Renewal Center already offers a renewal list, likelihood-to-renew scores, a forecast, and rule-based reminders at 90/60/30 days (Gainsight support docs).
- **[W]** Mid-market CS platforms are typically quote-priced at about $12K–$40K a year, before admin time (third-party pricing write-ups).

So a credible internal system must do one or more of these:
- **join data the single-function tools keep apart:** contract terms, usage, billing and the CRM
- **encode this vendor's own rules:** its pricing model, contract clauses, team handoffs and approval limits
- **serve a vendor that can't justify the enterprise stack plus the admin staff to run it**

---

## Candidate 1 — Renewal Desk (contract-aware renewals)

**Problem**
- **[V]** 27–29% of renewals are late (ICONIQ 2026).
- **[V]** Contracts are getting shorter, so renewals come around more often.
- **[A]** The facts that decide a renewal are scattered:
  - **contract** (PDF or contract tool): notice period, auto-renew, uplift cap, committed seats or usage, termination rights
  - **billing:** what is actually invoiced and paid
  - **product:** actual usage
  - **CRM:** the renewal opportunity
- **[A]** Teams find out about a 60-day notice clause with 40 days left, or quote a 7% uplift on a contract capped at 5%.

**User:** CSMs, account managers or renewals reps (daily); the VP of CS and finance (weekly).

**Workflow**
1. Import contracts. Terms are extracted, and a person confirms each one (the Tool 01 pattern).
2. Each subscription gets a **renewal timeline:** notice date, renewal date, and internal prep milestones.
3. A **renewal brief** per account shows:
   - committed vs used, and billed vs paid
   - the uplift allowed by the contract
   - risk signals
   - a recommended renewal quote
4. Approvals apply when the quote breaks policy (a discount, a downsell, removing the uplift).
5. The outcome is recorded: renewed, expanded, downsold or churned, with a reason.
6. A renewal forecast built from those facts, plus gross and net retention actuals.

**Data:** contracts, CRM accounts and opportunities, billing subscriptions and invoices, a product usage summary, support tickets (optional).

**Business impact**
- Fewer missed notice dates and fewer auto-renewals at the wrong price.
- Uplifts collected up to the contract cap.
- Earlier warning of risk.
- **[A]** For a $50M ARR vendor, 1% of gross retention is $500K a year. We don't claim a specific improvement.

**Existing alternatives**
- Gainsight Renewal Center
- ChurnZero and Vitally renewal views
- Salesforce opportunities with reminders
- Spreadsheets

**$30 tool test**
- **[V]** Gainsight covers forecasting and reminders, but works from CRM opportunity dates.
- **[A]** Our view of it is that it doesn't extract contract clauses like notice periods or uplift caps, or reconcile committed usage against billing, without custom work.
- **[A]** Mid-market vendors often run renewals from a spreadsheet.
- **Weakness:** this overlaps an established category, so differentiation must come from contract terms plus usage and billing, not from "a renewal list".

**Customisation:**
- contract clause types
- uplift policy and approval limits
- who owns renewals (CS, account managers or a renewals team)
- prep milestones
- risk rules
- fiscal calendar

**Automation:**
- clause extraction
- notice-date alerts
- uplift calculation
- auto-assembled renewal brief
- approval routing
- forecast roll-up
- weekly renewals digest

**White-label:** high. Every vendor has renewals; terminology, policies and integrations are configuration.

**Commercialisation:**
- implementation (contract backfill plus integrations)
- renewal-policy design
- managed renewal operations

**Trade-offs**
- **Strong:** clear evidence for the problem; money is directly measurable (retention, uplift collected).
- **Strong:** strong proof-of-value loop (the Tool 01 ledger pattern).
- **Weak:** the closest to Tool 01 (contracts, dates, money), so it shows less range across the 30 tools.
- **Weak:** it's in a category incumbents already market.

---

## Candidate 2 — Expansion Signal Desk (customer-success-qualified leads)

**Problem**
- **[V]** Opportunities sourced by customer success (CS) win most often: about 52%, versus about 38–43% for sales (ICONIQ 2026).
- **[V]** Operators credit "formal CSQL programs" and "product telemetry" for that (ICONIQ 2026).
- **[A]** In practice, the signals live in product analytics and billing:
  - seats near or over the limit
  - a new department adopting the product
  - usage passing the commitment
  - a premium feature tried on a trial
  - a new executive joining
- **[A]** The CSM must notice the signal, judge it and hand it to sales. Most signals die in a dashboard, and nobody measures what happened to them.

**User:** CSMs (who triage the signals), AEs or account managers (who work the qualified ones), the CS leader and the CRO (who check conversion).

**Workflow**
1. Signals arrive from usage, billing and the CRM.
2. The vendor's own rules (configurable) score them and attach context.
3. The CSM accepts or dismisses each signal, with a reason.
4. An accepted signal becomes a **CSQL** with a brief and an SLA, routed to the right seller.
5. The seller works it, and it becomes a CRM opportunity.
6. The outcome closes the loop: which signal types actually turn into revenue.

**Data:** product usage aggregates, seat counts, billing (plan, commitment, overage), CRM accounts, opportunities and owners.

**Business impact:**
- more expansion pipeline from existing customers
- measurable CS-sourced pipeline
- learning which signals are worth acting on
- **[A]** expansion is the biggest lever on net retention

**Existing alternatives**
- Gainsight and ChurnZero rules engines
- product-led sales tools (Pocus, Common Room; **[A]** this market consolidated in 2024–25)
- HubSpot or Salesforce workflows
- Slack alerts from analytics tools

**$30 tool test**
- Alerts are cheap.
- **[A]** What isn't cheap is the triage-and-handoff workflow with accountability:
  - dismissal reasons
  - SLAs
  - ownership rules (does CS or sales get credit and compensation?)
  - signal-to-revenue attribution tuned to the vendor's pricing model
- **Weakness:** some product-led sales tools target exactly this.

**Customisation:**
- signal definitions (depend entirely on the product)
- score weights
- routing and crediting rules (tied to compensation)
- SLAs
- terminology (CSQL, PQL, upsell lead)

**Automation:**
- signal detection jobs
- context assembly
- routing
- SLA reminders
- CRM opportunity creation
- conversion analytics per signal type

**White-label:** high. Signal definitions are configuration, and the workflow is universal.

**Commercialisation:**
- signal design workshop
- integration with analytics and the CRM
- quarterly signal tuning as a managed service

**Trade-offs**
- **Strong:** clearly different from Tool 01 (signals, routing, attribution rather than contracts).
- **Strong:** a very relevant story for GTM engineers; it's the "GTM engineering" job itself.
- **Weak:** a real demo needs believable product-usage data, so mock usage feeds must be clearly isolated and labelled.
- **Weak:** its value is pipeline, which is less directly "money saved" than renewals.

---

## Candidate 3 — Commitment & Usage Reconciliation (true-up desk)

**Problem**
- **[V]** About 48% of vendors use hybrid pricing as their primary model, and usage and outcome pricing is rising.
- **[V]** Running pay-as-you-go "takes real operational maturity… billing infrastructure, usage instrumentation, and forecasting discipline" (ICONIQ 2026).
- **[A]** Gaps appear between what contracts commit, what the product meters and what billing invoices:
  - overages that go unbilled
  - true-ups never sent
  - credits or prepaid drawdowns miscounted
  - customers far under their commitment, a churn risk nobody sees until renewal

**User:** finance and billing ops (monthly), CSMs (who see under-use), RevOps.

**Workflow**
1. Each month, compare the contract commitment, metered usage and invoiced amounts per account.
2. Raise exceptions:
   - unbilled overage
   - over-billing
   - under-use risk
   - a commitment that ends without a true-up
3. A person reviews each exception and approves an invoice adjustment or a CS action.
4. A record of revenue recovered and risks raised.

**Data:** contracts (commitments, rates, true-up terms), usage, billing invoices and credits, CRM.

**Business impact:**
- directly recovered revenue (unbilled overage)
- avoided disputes (over-billing)
- earlier churn warning
- **[A]** revenue leakage is a known audit theme, but its size for SaaS is unverified here

**Existing alternatives**
- usage-billing platforms (Metronome, Orb, m3ter, Chargebee usage)
- finance spreadsheets
- **[A]** larger vendors build this into their billing stack

**$30 tool test:** billing platforms meter and invoice, but the three-way reconciliation against *contract terms* with human review sits between finance and CS. **[A]**

**Customisation:**
- pricing model per vendor (seats, credits, tiers, prepaid drawdown)
- true-up rules
- tolerances
- approval thresholds

**Automation:**
- monthly reconciliation job
- exception classification
- invoice adjustment drafts
- CS alerts

**White-label:** medium-high. Pricing models vary a lot, so each one is a configuration effort and the core must be general.

**Commercialisation:**
- revenue-leakage audit as the opening offer (a one-off reconciliation)
- then an ongoing managed service
- **[A]** a strong "pays for itself" pitch

**Trade-offs**
- **Strong:** the money is the most concrete of all the candidates.
- **Weak:** finance-heavy, so less of a GTM story.
- **Weak:** needs realistic usage and billing data.
- **Weak:** overlaps candidate 1 (both use commitments); it could be folded into it.

---

## Candidate 4 — Closed-Won Handoff & Commitments Register

**Problem**
- **[A]** At signing, the AE knows:
  - the customer's goals and success criteria
  - who the stakeholders are
  - what was promised (features, timelines, integrations)
- **[A]** The CSM gets a CRM record and a 30-minute call.
- **[W]** Vendor-published data links poor onboarding to higher first-year churn.
- **[A]** Promises the product can't keep surface at the first renewal.

**User:**
- AEs: a structured handoff at close, enforced before commission is released
- onboarding and CSMs (daily)
- the product team: promises that need roadmap work
- CS leadership

**Workflow**
1. At close-won, a handoff form is required (configurable), with quotes pulled from call notes or transcripts.
2. Promises are logged as commitments with owners and dates.
3. Onboarding milestones are tracked to "first value".
4. Overdue commitments and stalled onboarding are escalated.
5. A promise ledger by AE and by feature.

**Data:** CRM opportunities and contacts, call transcripts (optional), onboarding milestones, product roadmap items.

**Business impact:**
- faster time to value
- fewer broken-promise churns
- accountability for over-selling
- **[A]** hard to put in dollars until renewal outcomes accumulate

**Existing alternatives:**
- onboarding tools (Rocketlane, GuideCX)
- CS platforms
- CRM handoff fields
- Gong deal summaries

**$30 tool test:** onboarding tools manage projects, but the "promises made in the sale" register, enforced at close and tied to commission, is organisation-specific. **[A]**

**Customisation:** handoff fields, required evidence, milestone templates per product or plan, escalation rules.

**Automation:**
- handoff gate at close-won
- summary of transcripts or notes into draft commitments, confirmed by a person
- SLA timers
- escalation

**White-label:** high.

**Commercialisation:** sales-to-CS process redesign plus the tool; sells well alongside RevOps consulting.

**Trade-offs**
- **Strong:** a clear process story; works with little data.
- **Weak:** the weakest quantitative evidence (mostly **[W]**/**[A]**).
- **Weak:** the value shows up slowly.
- **Weak:** adoption depends on AEs filling in a form, a known failure mode.

---

## Candidate 5 — Inbound Speed-to-Lead & Routing

**Problem**
- **[V]** Responding within an hour makes a lead about 7x more likely to qualify, but only 37% of firms do it (HBR 2011).
- **[A]** Mid-market vendors without routing tools match leads to accounts by hand and assign them by round-robin.

**User:** SDRs, marketing ops, RevOps.

**Workflow:** a lead arrives → it's matched to an account and existing owner → it's assigned under territory rules → a response SLA starts → escalation if missed → reporting on speed and conversion.

**Data:** form submissions and sign-ups, CRM accounts and owners, territories, calendars.

**Business impact:** higher inbound conversion, and measurable SLA compliance.

**Existing alternatives:** LeanData, Chili Piper, Default, HubSpot or Salesforce native assignment rules.

**$30 tool test:** **weak.**
- Mature, reasonably priced products exist.
- Customisation is mostly territory rules, which those tools already handle.

**White-label:** high, but commoditised.

**Commercialisation:** low as a custom build; better as an implementation of an existing tool.

**Trade-offs:** included for completeness. It probably **fails** the brief's $30 tool test.

---

## How the candidates relate

```
           Sale → Handoff (4) → Adoption → Expansion signals (2) → Renewal (1)
 Inbound (5) ↗                        ↘ Commitment vs usage vs billing (3) ↗
```

- **Candidates 1 and 3** share the contract-commitment data. A Renewal Desk could include a light reconciliation; a full true-up desk is a separate finance tool.
- **Candidates 2 and 3** both start from usage data. 2 turns usage into revenue opportunities, 3 into billing corrections and risk.
- **Showing range across the 30-tool challenge:** Tool 01 was contracts → dates → money.
  - Candidate 1 repeats that shape.
  - Candidate 2 is the most different (signals → routing → attribution).
  - Candidate 3 sits in between.

| | 1 Renewal Desk | 2 Expansion Signals | 3 True-up Desk | 4 Handoff Register | 5 Speed-to-Lead |
|---|---|---|---|---|---|
| Evidence for the problem | Strong [V] | Strong [V] | Medium [V]+[A] | Weak [W]/[A] | Strong [V], but solved |
| Passes $30 test | Yes, via contract + usage + billing | Yes, via triage/handoff/attribution | Yes | Partly | Probably not |
| Money measurable | Retention, uplift | Pipeline, expansion revenue | Recovered revenue | Indirect | Conversion |
| Different from Tool 01 | Low | High | Medium | Medium | High |
| Demo data needs | Contracts + billing + usage summary | Usage events (mocked, labelled) | Usage + invoices | CRM + notes | Leads |
| GTM-engineer teaching value | High | Highest | Medium | Medium | Low |

## Selected system
**Candidate 2, Expansion Signal Desk** (selected by the user, 2026-10-07).

Why it fits the challenge: it is the most different from Tool 01, and it is the job GTM engineers are hired to do (turn product data into routed, accountable pipeline). The main risk, believable usage data for a demo, is handled by an ingest API plus a clearly labelled usage simulator (spec §10).
