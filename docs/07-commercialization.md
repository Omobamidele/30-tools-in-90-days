# Commercialization: Expansion Signal Desk

No invented prices. This explains who pays, for what, and what should drive the price.

## Target user
- **Customer success managers (daily).** They triage signals on their book.
- **Account managers and AEs (daily).** They work the CSQLs routed to them.
- **CS and sales leaders (weekly).** They watch response times and reassign stuck work.
- **RevOps (weekly).** They own the rules, the data feed, routing and the CRM bridge.

## Buyer
- **Economic buyer:** the CRO, or the VP of customer success where CS carries an expansion number. **[A]**
- **Champion:** the head of RevOps, who owns the tooling and is usually the one asked to measure "CS-sourced pipeline". **[A]**
- **Why now** (from [01](01-industry-research.md)):
  - **[V]** Sales pay is moving to net revenue retention (ICONIQ 2026).
  - **[V]** Opportunities sourced by CS win about 52% of the time.
  - **[V]** Hybrid and usage pricing is rising, which creates more expansion moments and more of them hidden in usage data.

## Business problem
- Expansion signals sit in product data and billing, while the pipeline lives in the CRM. No one owns the step between them, so signals die in dashboards.
- Nobody can answer two questions with evidence:
  - "Which signals are worth acting on?"
  - "What did CS-sourced expansion produce this quarter?"
- The system makes that step explicit (signal → triage with a reason → routed with a deadline → recorded outcome) and measures it.

## Implementation
What a GTM engineer or agency customises per client, roughly in order of effort:

1. **The usage feed.** A nightly job from the client's warehouse (Snowflake, BigQuery) or product backend posting daily aggregates to `/api/ingest/usage`. This is usually the biggest piece, and it depends on how clean their product data is.
2. **Signal design.** Which usage patterns mean "ready to buy" *for this product*: which metric is "seats", what the commitment unit is, which add-ons can be gated. A workshop with CS, sales and product, then rule thresholds tuned using the editor's preview.
3. **Price book.** Seat price, commitment tiers, overage, add-ons. This is what makes estimates believable.
4. **Routing and deadlines.** Territories and segments, round-robin members, business days, holidays.
5. **CRM bridge.** Webhooks to create the opportunity (through Salesforce Flow, HubSpot workflows, Zapier or Make), and the inbound update endpoint for amounts and outcomes.
6. **Account import** from the CRM, with CSM and owner mapping.
7. **Branding and terminology:** "CSQL" vs "Expansion lead", "Seats" vs "Licenses", and so on.

## White-label opportunity
- **Everything client-specific is configuration** (`config/clients/<name>.json`): brand, wording, price book, segments, deadlines, reasons and the starting rule set.
- **Rule *types* are core; rule *instances* are config.** A new product with an "API calls" commitment is a renamed `USAGE_PACE` rule, not new code.
- A consultant can run it as their own branded "expansion desk" for each client: one deployment and database per client, which is the same isolation model as the code.

## Service opportunity
- **Implementation:** data feed, rules, price book, routing, CRM bridge.
- **Signal design workshop:** a stand-alone offering that also qualifies the implementation.
- **Rule tuning as a managed service:** monthly review of the funnel per rule, dismissal reasons, and estimate vs recorded amount, adjusting thresholds with a versioned change note. The product produces exactly the evidence this service needs.
- **Integration upgrades:** native Salesforce or HubSpot connectors, Slack alerts.
- **CS–sales process design:** credit rules, handoff standards and response deadlines. The tool enforces the process; the consultant designs it.

## Product opportunity
- **The engine is general:** usage aggregates → deterministic rules → triage → routing → outcomes. Productising it would need:
  - native connectors (warehouse, CRM)
  - multi-currency
  - risk and contraction signals (the same engine, inverted)
- **Risk:** product-led sales tools target overlapping ground. The defensible part is the accountable workflow and the evidence loop (dismissal reasons, rule versions, recorded outcomes per rule), not detection alone.

## Pricing value drivers
What should determine the price, not the price itself:
1. **The client's expansion base:** ARR and number of accounts. More accounts means more signals and more value from triage.
2. **Data work:** how far their product data is from clean daily aggregates. This drives implementation effort more than anything else.
3. **Number of products, pricing models and segments,** which multiply rules and price-book complexity.
4. **CRM integration depth:** webhook-only vs native, two-way.
5. **Ongoing tuning:** whether they want a managed service reviewing rule performance.
6. **Evidence of value:** after a quarter, Results shows CS-sourced pipeline and won ARR by signal type, from recorded outcomes only. Renewal pricing can rest on that, not on a projection.

**How to sell it (for the GTM engineer):**
1. Start with their own data. Export 90 days of seat and usage aggregates.
2. Run the rule preview on it.
3. Show the head of CS and the CRO the list of accounts that would have raised a signal today, with an estimate from their own price book.
4. That list is the demo.
