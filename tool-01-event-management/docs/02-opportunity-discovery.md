# Phase 2 — Opportunity Discovery: Event Management Companies

**Tool:** 01 · **Written:** 2026-09-23 · **Input:** [01-industry-research.md](01-industry-research.md) · **Status:** Awaiting selection

Six candidate internal systems follow. **They are not ranked.** Each has a different buyer, a different risk profile and different competition, and the tradeoffs are laid out so the choice is yours.

Labels: **[V]** verified with a cited source · **[A]** assumption.

---

## Where the opportunities sit

The research found a single commercial chain inside every B2B event agency. Every candidate below targets one or more links in it:

```
 WIN THE WORK            COMMIT THE MONEY              DELIVER & CHANGE          SETTLE THE MONEY
 ─────────────           ────────────────              ────────────────          ────────────────
 RFP / brief ──► Pitch ──► Proposal budget ──► Supplier contracts ──► Change orders ──► Actuals ──► Reconciliation
     [A]                        [B]                   [C]                   [D]                   [B]
                                                                                         (life sciences: [F])
 DMC variant: agency RFP ──► costed ground proposal [E]
```

---

## A. Pitch Desk: new-business qualification and pitch economics

| | |
|---|---|
| **Problem** | Agencies spend 60–300 hours per proposal (80–100+ of them senior leaders' hours), usually competing against 7–12+ other agencies, and most decide whether to bid on gut feel [V: [micebook](https://micebook.com/blog/2026/03/10/from-rfp-to-partnership-fixing-the-event-pitch-process/)]. Pitch cost is rarely measured, so win rate by client type, event type, budget band or source is unknown [A]. |
| **Users** | New-business lead, agency MD/founder (approver), strategy and creative leads (contributors) |
| **Workflow** | Brief arrives → structured intake (extract dates, headcount, budget, destination, deliverables, deadlines) → **budget realism check** against the agency's own past events → configurable go/no-go scorecard → approval by MD → pitch plan with hour budget → hours logged → outcome and loss reason → winning brief becomes the **handoff pack** for ops |
| **Data** | Brief/RFP documents, client and contact records, past events (actual cost per head, by format/destination/season), pitch hours, outcomes, competitor names, feedback |
| **Business impact** | Stops bids on unwinnable or under-funded pitches, and frees senior time. Makes pitch investment a managed cost [A] |
| **Existing alternatives** | Loopio adds a go/no-go module to its RFP content platform, from about $25–40k a year [V: [Loopio Go/No-Go](https://loopio.com/blog/go-no-go/); pricing from third-party estimates [AutoRFP](https://autorfp.ai/blog/loopio-pricing)]. HubSpot/Salesforce custom pipelines. Spreadsheets |
| **Why they fall short** | Loopio is built around answering questionnaires from a content library. Event pitches are creative and budget-led, not question-led. A CRM pipeline can't judge whether "$450/head for 3 days in Lisbon in June" is realistic, because it doesn't hold the agency's own cost history [A] |
| **$30 Tool Test** | **At risk.** A disciplined agency could get about 60% of the way with a HubSpot custom pipeline and a scorecard form. The part that justifies a custom system is the **budget realism engine fed by the agency's own delivery data** |
| **Customisation** | Scoring criteria and weights, approval thresholds, event types, loss-reason taxonomy, source channels |
| **Automation** | Extracting fields from brief PDFs (real LLM value), deadline reminders, auto-escalation above an hour budget, automatic handoff pack on "won" |
| **AI role** | Extraction from unstructured briefs. Drafting clarifying questions to the client |
| **White-label** | High. Every agency pitches, and only the scoring rules differ |
| **Commercial path** | Buyer: agency MD/founder. Value driver: senior hours saved and win-rate lift. Implementation: importing past events to seed benchmarks |
| **Demo strength** | Strong. A brief comes in, gets scored, a decision is made, a handoff happens. Easy to understand in 3 minutes |
| **Main risk** | The budget benchmarks are only as good as the agency's historical data, which is often in spreadsheets. A new agency starts cold |

---

## B. Event Commercial Ledger: one budget from proposal to reconciliation

| | |
|---|---|
| **Problem** | Budgets split across files, versions and systems. Client-facing proposals, internal cost tracking and finance records drift apart, and reconciliation is largely manual, so margin loss shows up only after the event [V: [qondor](https://qondor.com/blog/event-budget-management)] |
| **Users** | Account director / event manager (owner), finance (reconciliation), MD (portfolio margin) |
| **Workflow** | Budget lines with **two linked views**: internal cost and client price (markup, management fee and commission rules applied) → versions (proposal / contracted / current forecast / actual) → supplier invoices matched to lines → variance flags → final client invoice or credit → portfolio margin report |
| **Data** | Budget lines, suppliers, quotes, invoices, pricing rules, currencies/VAT, time entries |
| **Business impact** | Protects margin on large hard-cost volumes. Shortens reconciliation. One agency reported saving 675+ hours after automating reconciliation [V: qondor case study] |
| **Existing alternatives** | **qondor** (built for agencies, TMCs and venues), Procim, Scoro (PSA), Planning Pod (small teams) [V: [qondor](https://qondor.com/blog/event-budget-management), [Procim](https://www.itassociates.co.uk/post/event-budgeting-software), [Scoro](https://www.scoro.com/industries/event-management-software/)] |
| **Why they fall short** | Direct competitors exist and are credible. The custom case rests on **agency-specific commercial rules** (hybrid fee models, commission pass-back policies, client-specific rate cards) and integration with the agency's own accounting [A] |
| **$30 Tool Test** | **Fails for a generic agency.** qondor already does the core job. It passes only for agencies with unusual commercial models or accounting integration needs |
| **Customisation** | Pricing rules, budget categories, approval limits, currencies, tax, accounting export mapping |
| **Automation** | Invoice-to-line matching, variance alerts, reconciliation drafts |
| **AI role** | Extracting supplier invoice line items (useful but commoditised) |
| **White-label** | High, but you'd be competing with packaged products |
| **Commercial path** | Implementation and integration services around a well-known category. Harder to sell as a unique product |
| **Demo strength** | Medium. Finance-heavy screens are less compelling on video |
| **Main risk** | You'd be building a weaker version of a funded product |

---

## C. Exposure Register: contractual obligations and financial exposure across all supplier contracts

| | |
|---|---|
| **Problem** | Every signed contract (hotel, venue, catering, AV, transport) creates dated money obligations: deposits, room-block attrition, F&B minimums, cutoff dates, tiered cancellation penalties, final guarantees [V: [MPI](https://www.mpi.org/chapters/chicago-area/chapter-news/single-blog/c-c-articles/2018/06/26/what-to-know-about-cancellation-and-attrition), [Marriott terms](https://www.marriott.com/content/dam/marriott-digital/si/emea/hws/a/amssi/en_us/document/assets/si-amssi-meetings-terms-22-20702.pdf)]. An agency running many events holds hundreds of these, tracked in PDFs, calendars and people's heads [A]. Nobody can answer: **"What would it cost us today if this event shrank by 20% or cancelled, and whose money is that — ours or the client's?"** |
| **Users** | Head of operations (owner), event managers (maintain), finance (cash and liabilities), MD (portfolio risk), optionally the client (read-only exposure view) |
| **Workflow** | Contract uploaded → clauses extracted into structured obligations (with a human verifying each) → obligation timeline per event → **live exposure calculation**: current cancellation cost, projected attrition from pickup/registration pace, unmet F&B minimum → deadlines routed to owners → escalation when exposure passes thresholds → decision logged (release rooms, renegotiate, inform client) → post-event: expected vs actual penalties feed into reconciliation |
| **Data** | Contracts (PDF), clause terms, room blocks by night, pickup/registration counts (manual or CSV/integration), budgets, client liability terms (who bears which penalty under the agency's client contract) |
| **Business impact** | Prevents avoidable penalties and missed cutoff dates. Gives the MD a portfolio-wide risk number. Gives clients early warnings, which builds trust [A: frequency and size of penalties need validating with operators] |
| **Existing alternatives** | **Blocks**, $899–$2,250/month: extracts hotel contract terms, tracks per-night attrition exposure, cutoff alerts, rooming-list audit [V: [Blocks](https://www.blocks.travel/compare/cvent-passkey-alternative/)]. **Cvent Passkey** and **Groups360 GroupSync**: room-block pickup and threshold alerts for attendee self-booking [V: [Cvent Passkey](https://www.cvent.com/en/blog/events/unlock-better-room-block-management-with-passkey), [Groups360](https://groups360.com/organizer-solutions/housing/)] |
| **Why they fall short** | The existing tools are built around **hotel room blocks**. The gap is **all supplier contract types** at once (F&B minimums, venue and AV cancellation tiers, deposits), rolled up into an **agency portfolio view**, and tied to **who carries the liability** under each client agreement. That last point is agency-specific and the real custom logic [A] |
| **$30 Tool Test** | **Partially passes.** For hotel blocks alone, buy Blocks. A multi-supplier, multi-client liability model with approval routing is custom territory |
| **Customisation** | Clause types, liability-allocation rules per client MSA, exposure thresholds, escalation routes, calendars, currency |
| **Automation** | Clause extraction, deadline reminders at configurable offsets, exposure recalculation on pace updates, escalation, client exposure notices |
| **AI role** | Extracting clauses from contract PDFs, always confirmed by a human. This is where an LLM earns its place |
| **White-label** | High. The same logic applies to DMCs, PCOs and corporate in-house teams |
| **Commercial path** | Buyer: MD / COO / CFO. Value driver: penalties avoided and cash visibility. Services: contract backfill, clause-library setup, integration with registration/housing |
| **Demo strength** | Strong. "This event has $84k at risk in 11 days" is an easy screen to understand |
| **Main risk** | Clause extraction accuracy (mitigated by mandatory human confirmation). Blocks is moving into the same space from the hotel side |

---

## D. Change Control Desk: scope and headcount changes with client approval

| | |
|---|---|
| **Problem** | Mid-planning changes (headcount, added functions, AV upgrades) are agreed on calls and emails, then absorbed rather than priced and approved. Approved changes aren't reflected in budgets or supplier orders [V: change-order practice, [Procim](https://www.itassociates.co.uk/post/event-budgeting-software); A: frequency] |
| **Users** | Event manager (raises), account director (prices), client (approves), suppliers (notified) |
| **Workflow** | Change request → cost and margin impact priced from rate cards → internal approval above a limit → client approval link → budget and supplier instructions updated → audit trail for reconciliation |
| **Data** | Change requests, budget lines, rate cards, approvals, supplier orders |
| **Business impact** | Recovers revenue on scope creep. Reduces disputes at the final invoice |
| **Existing alternatives** | Generic approval tools, agency PSA tools such as Birdview, and construction change-order software, which models the same pattern well [V: search results, [Beam](https://www.trybeam.com/change-order-management)] |
| **Why they fall short** | Generic tools don't price event changes (per-head F&B, guarantee deadlines, supplier cut-offs) [A] |
| **$30 Tool Test** | **At risk as a standalone.** It works well as a module of B or C |
| **White-label** | High |
| **Demo strength** | Medium |
| **Main risk** | Too narrow alone. Clients may resist a new approval portal |

---

## E. DMC Proposal Desk: fast costed ground proposals

| | |
|---|---|
| **Problem** | DMCs receive many RFPs from agencies with short turnaround and uncertain conversion, and each needs a costed, multi-component proposal [A] |
| **Users** | DMC sales and programme managers |
| **Workflow** | Agency RFP → triage → assemble components (transfers, venues, activities) from supplier rate cards → price by group size → proposal → conversion tracking |
| **Existing alternatives** | Tourplan, Ezus, DMC Quote, Travefy: component quoting, margin, multi-currency, itinerary output [V: [Tourplan](https://www.tourplan.com/solutions/destination-management-company-solution/), [Ezus](https://ezus.io/post/best-dmc-software-2026), [DMC Quote](https://dmcquote.com/services/dmc-software-solutions)] |
| **$30 Tool Test** | **Fails.** A crowded category with established vendors |
| **Demo strength** | Medium |
| **Main risk** | No differentiation |

Included for completeness. The research doesn't support building this.

---

## F. HCP Event Spend Ledger: life-sciences transfer-of-value capture

| | |
|---|---|
| **Problem** | Pharma and med-device clients must report meals, travel, fees and educational support given to covered healthcare professionals under CMS Open Payments [V: [CMS](https://www.cms.gov/priorities/key-initiatives/open-payments/natures)]. Agencies running HCP events must capture per-attendee spend accurately and deliver it in the client's format [A] |
| **Users** | Agency compliance coordinator, event managers, client compliance teams |
| **Workflow** | Attendee roster with HCP identifiers → per-function attendance → cost allocation per HCP → client-specific caps and rules → exception review → export in the client's format |
| **Existing alternatives** | Client-side aggregate-spend and compliance platforms [A: not researched in depth] |
| **$30 Tool Test** | **Passes.** Regulated, client-specific rules |
| **White-label** | Medium. Useful only to agencies with life-sciences clients |
| **Commercial path** | High willingness to pay, narrow market |
| **Demo strength** | Low to medium. Hard for a general audience to follow |
| **Main risk** | Regulatory accuracy and liability. Needs domain validation beyond public sources. A narrow audience for a public challenge |

---

## Comparing the tradeoffs (not a ranking)

| | A. Pitch Desk | B. Commercial Ledger | C. Exposure Register | D. Change Control | E. DMC Proposals | F. HCP Ledger |
|---|---|---|---|---|---|---|
| Strength of evidence for the problem | Strong | Strong | Medium | Medium | Weak | Medium |
| Direct competition | Low–medium | **High** (qondor) | Medium (Blocks, hotel-only) | Low (generic) | **High** | Unknown |
| $30 Tool Test | At risk | Fails (generic) | Partially passes | At risk alone | Fails | Passes |
| Custom logic depth | Medium (benchmarks) | Medium (pricing rules) | **High** (clauses × liability × pace) | Medium | Low | High |
| AI with a real purpose | Brief extraction | Invoice extraction | **Contract clause extraction** | None needed | Low | None needed |
| Clear buyer with money | MD / founder | Finance / MD | MD / COO / CFO | Account director | DMC owner | Compliance |
| White-label breadth | Agencies | Agencies | Agencies, DMCs, PCOs, in-house teams | Agencies | DMCs | Pharma-facing agencies |
| Demo strength (public challenge) | Strong | Medium | Strong | Medium | Medium | Low |
| Main unknown to validate | Quality of historical data | Why not qondor? | Penalty frequency and size | Change frequency | — | Compliance rules |

## Combining candidates

These are system options, not recommendations:

- **C + D:** Exposure Register with change control. A headcount change becomes a priced change order *and* recalculates contract exposure. Covers "commit the money" and "change" in one system.
- **A + handoff:** Pitch Desk whose winning pitch hands its budget and assumptions to delivery. Covers "win the work".
- **B** only makes sense as a module inside C or D, not as the headline, because of qondor.

---

## Selected system: C + D, the Exposure Register with change control

**Decided 2026-09-23.** The user delegated the choice to Claude.

**Why this combination:**
1. **It holds up best against the $30 Tool Test.** Blocks and Passkey cover hotel room blocks. None of the tools found models *every* supplier contract type, the agency's *portfolio*, and *who carries each liability* under each client agreement. That third part varies by agency and client, which is exactly what makes a system custom.
2. **The AI has a real job to do.** Extracting clauses from contract PDFs saves hours, and a human confirms every value. Everything else is deterministic, auditable arithmetic.
3. **It answers questions an MD will pay to answer.** "How much money do we have at risk right now, across all events?" and "What does this headcount change cost us, and who pays?"
4. **Change control makes it an operating system rather than a dashboard.** Changes are the moment exposure moves. Pricing them, getting client approval, and recalculating exposure in one flow closes the loop: *commit → change → re-expose → decide*.
5. **It white-labels widely.** The same logic applies to agencies, DMCs, PCOs and corporate in-house event teams.
6. **It records well.** "This event has $84k at risk in 11 days, and the client approved the headcount reduction that caused it" can be followed by anyone in a short video.

**Why not the others:**
- **A (Pitch Desk)** is a good second choice, but a CRM plus a scorecard gets most of the way there.
- **B** competes head-on with qondor. It survives here only as the *committed value* view inside C.
- **E** is served by established vendors.
- **F** has a narrow audience and regulatory risk.

**Validation risk that remains:** how often penalties actually occur and how large they are hasn't been verified (see Phase 1, §13). The spec designs for it, and the post-event "expected vs actual penalty" record builds the evidence as the system is used.
