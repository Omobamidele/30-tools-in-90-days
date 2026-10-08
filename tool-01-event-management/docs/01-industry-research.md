# Phase 1 — Industry Research: Event Management Companies

**Tool:** 01 · **Researched:** 2026-09-23 · **Status:** Complete, ready for Phase 2

Labels used throughout:
- **[V]**: verified, with the source cited in brackets
- **[A]**: assumption or inference. These need validating with real operators before they drive design decisions.

---

## 0. Scope: what "event management company" means here

An event management company is a firm paid to plan, source, produce and run events **for someone else**. The industry splits into distinct business types with different buyers and workflows:

| Segment | What they do | Typical client | In scope? |
|---|---|---|---|
| **Corporate event / experiential agency** | Strategy, creative, logistics and production for sales kickoffs, user conferences, product launches, customer events | Corporate marketing, sales ops, internal comms, procurement | **Primary** |
| **Meetings & incentives management company** | Logistics-heavy delivery of high volumes of meetings and incentive trips. Often runs a client's Strategic Meetings Management (SMM) programme | Corporate procurement / travel / SMM owners | **Primary** |
| **Destination Management Company (DMC)** | Local ground expertise: transport, venues, tours, activities, event logistics in one destination [V: [ADMEI](https://www.admei.org/about/)] | Agencies, incentive houses, corporate planners (often B2B2B) | **Primary** |
| **Professional Congress Organiser (PCO)** | Full management of association congresses: programme, registration, abstracts, exhibitor/sponsor sales, finance [V: [IAPCO](https://www.iapco.org/)] | Associations and medical/scientific societies | Secondary |
| **Event production / AV company** | Technical production, staging, AV, crew and equipment | Agencies and venues | Secondary (their core ops are served by rental software, see §8) |
| **Social / wedding planners** | Private events | Consumers | **Out of scope.** B2C, small tickets, and cheap tools like HoneyBook already cover it. It fails the $30 Tool Test by design |

Focusing on the B2B segments is deliberate. They have multi-stakeholder buying, procurement, contracts with financial exposure, and cross-functional handoffs. That's where a custom internal system can be justified.

---

## 1. Market context

- Business events drew **1.65 billion participants** in 2025 across 180+ countries and generated **US$1.3 trillion in direct spending**. They supported US$3.1 trillion in total business sales, US$1.8 trillion of GDP and 24.2 million jobs. [V: [EIC 2026 Global Economic Significance Study, via Exhibitor Online](https://www.exhibitoronline.com/news/article.asp?ID=25306); conducted with Oxford Economics, 1,600+ survey respondents]
- North America accounts for **US$487.7 billion (37.8%)** of direct spend. [V: same]
- Direct spend by event type in 2025: **corporate/business events US$566B**, conventions/conferences US$383.2B, trade shows US$178.5B, incentive events US$86.6B. [V: same]
- US employment of meeting, convention and event planners is projected to grow **6% from 2025 to 2035**, with about 16,800 openings a year. The median wage was **$61,160** (May 2025). [V: [BLS Occupational Outlook Handbook](https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm)]
- **Outlook for 2026:** 85% of meeting professionals are optimistic, the highest since 2021. **71% expect per-attendee costs to rise**, and about 38% name cost inflation as their top challenge. [V: [Amex GBT 2026 Global Meetings & Events Forecast](https://www.amexglobalbusinesstravel.com/meetings-events/me-forecast/). Figures taken from coverage of the report, because the primary PDF could not be fetched]
- 72% of planners expect event costs to rise, and **35% say staying within budget is their biggest concern**. [V: [Cvent 2026 Planner Sourcing Report, n=1,650](https://www.cvent.com/en/blog/events/venue-sourcing-trends)]
- Incentive travel spend per person rose only 4% to about **$5,100**. Hotels, air and F&B are the largest budget drivers. Planners are cutting programme elements rather than "doing more with less". [V: [IRF 2026 Trends Report](https://theirf.org/research_post/irf-2026-trends-report/)]

**What this means [A]:** demand is healthy, but budgets aren't keeping up with cost inflation. Agencies are being squeezed from both sides: clients want more for flat budgets, and supplier costs are rising. **Margin control and cost visibility matter more now than creative differentiation alone.**

---

## 2. Business model

### How agencies make money
[V: [Bash Creative, agency pricing models](https://www.bash-creative.com/blog-post/understanding-standard-agency-pricing); [J.Shay Events](https://jshay.events/how-much-does-event-management-cost/)]

| Model | Mechanics | Implication for systems |
|---|---|---|
| **Management / flat fee** | Fixed fee for the defined scope, plus overage terms | Scope creep has to be tracked, or margin disappears |
| **Hourly** | Time billed at agreed rates | Needs time capture against events |
| **Markup** | Percentage added to supplier (hard) costs, often undisclosed | Internal cost and client price are different numbers, so two views of one budget are needed |
| **Commission / percentage of budget** | Fee as a percentage of total event spend. Requires cost transparency | The budget *is* the revenue base, so the accuracy of the reconciliation decides what the agency earns |
| **Supplier commissions** | Hotels commonly pay about **10%** on rooms, trending toward 7%. Some agencies pass this back to clients | Commission receivables have to be tracked against actual room pickup |
| **Hybrid** | Fee plus markup or commission | Most common in practice [A] |

**[A]** Hard costs (venue, F&B, AV, transport, accommodation) typically dwarf agency fees. The agency's real P&L exposure sits in **the difference between what was proposed, what was contracted, and what was actually invoiced.**

### Revenue concentration [A]
- Most revenue comes from repeat clients and annual programmes (the same SKO, user conference or incentive every year).
- Enterprise clients consolidate work onto **preferred-agency rosters** under master services agreements (MSAs), usually through procurement-led SMM programmes. [V: SMM framework, [GBTA](https://gbta.org/professional-development/education-growth/the-fundamentals-of-strategic-meetings-management/). The roster detail is an inference from SMM "preferred supplier" practice]

---

## 3. Customer types and buyer types

| Customer type | Typical events | Buyer / decision-maker | Influencers |
|---|---|---|---|
| Enterprise corporates | SKOs, user conferences, product launches, customer advisory boards, incentives | VP Marketing / Events, Head of Sales Enablement, CMO | Procurement, Finance, Legal, Travel/SMM manager |
| Mid-market corporates | Customer events, offsites, roadshows | Marketing director, Chief of Staff | Finance |
| Life sciences (pharma, med-device) | HCP speaker programmes, advisory boards, congress presence | Commercial / medical affairs | **Compliance.** HCP meals, travel and fees are reportable under CMS Open Payments (the Sunshine Act) [V: [CMS Open Payments](https://www.cms.gov/priorities/key-initiatives/open-payments/natures)] |
| Associations | Annual congresses, conventions | Executive director, meetings committee | Board, local organising committee |
| Agencies (for DMCs) | Ground programmes in a destination | Agency account/programme manager | End client |
| Incentive houses | Reward trips | Programme director | End client sales leadership |

**Key point [A]:** the **user** (the client-side event manager) is often not the **buyer** (procurement or a budget owner), and neither of them is the **payer approver** (finance). Agencies sell to three audiences at once.

---

## 4. Acquisition channels

| Channel | Evidence |
|---|---|
| **Repeat and renewal business** | [A] The dominant source. Annual programmes are re-awarded, or put out to re-pitch every 2–3 years |
| **RFP / competitive pitch** | [V] Clients commonly invite **7–12+ agencies**, and in one cited case 20 [[micebook, 2026](https://micebook.com/blog/2026/03/10/from-rfp-to-partnership-fixing-the-event-pitch-process/)] |
| **Procurement rosters / SMM preferred supplier lists** | [V] SMM programmes consolidate spend on preferred suppliers [[GBTA](https://gbta.org/professional-development/education-growth/the-fundamentals-of-strategic-meetings-management/)] |
| **Referrals: hotels, venues, CVBs/DMOs** | [V] CVBs/DMOs often recommend only accredited PCOs for international congress bids [[IAPCO](https://www.iapco.org/)]. [A] Hotel sales teams refer planners to local DMCs |
| **Agency → DMC subcontracting** | [V] 29% of incentive buyers call a good DMC a destination "must-have" [[IRF](https://theirf.org/research_post/irf-2026-trends-report/)]. [A] A DMC gets most of its leads as RFPs from agencies and incentive houses |
| **Industry trade shows and associations** | [A] IMEX, IBTM, MPI, PCMA, SITE, ILEA membership and events |
| **Thought leadership / case studies / awards** | [A] Proof of work is the main marketing asset |

---

## 5. Sales motion

Client-side view:

```
Business need → Internal brief → (RFI / pre-qualification) → RFP to shortlist
→ Agency proposals (strategy + creative + budget) → Pitch presentations
→ Selection → Contract (MSA + SOW) → Delivery → Debrief → Renewal / re-pitch
```

The facts from the micebook panel of agency leaders, 2026 [V: [micebook](https://micebook.com/blog/2026/03/10/from-rfp-to-partnership-fixing-the-event-pitch-process/)]:
- A proposal takes **60–300 hours**, including **80–100+ hours of senior leadership time**. External costs can exceed **$30,000**.
- About a third of clients pay a pitch fee of **$5,000–$10,000**. Agencies say that doesn't cover the cost.
- Common problems: unclear briefs with no success metrics, too many agencies invited, missing or unrealistic budgets, little feedback after the decision.
- Agency leaders say **three** agencies is the right number for a full creative pitch.

**[A]** Pitching is the agency's single largest unbilled cost. Few agencies run a disciplined **go/no-go qualification**, and fewer still measure win rate by client type, event type, budget band or source. They decide from gut feel on whether to spend 100+ hours.

---

## 6. Customer journey (client ↔ agency)

| Stage | Client does | Agency does | Artifacts |
|---|---|---|---|
| 1. Brief | Defines objectives, audience, dates, budget range | Qualifies, asks clarifying questions | Brief / RFP document |
| 2. Proposal | Compares agencies | Concept, programme outline, **costed budget**, team, timeline | Proposal deck, budget workbook |
| 3. Award | Negotiates, contracts | Signs SOW, re-bases budget | MSA, SOW, approved budget v1 |
| 4. Sourcing | Approves venue and suppliers | Sends venue RFPs, compares responses, negotiates, contracts | Venue RFPs, supplier quotes, contracts |
| 5. Planning | Approves changes, supplies attendee data | Registration, rooming, agenda, suppliers, production | ESG, rooming lists, run of show, change orders |
| 6. Delivery | Attends / hosts | Runs onsite operations | Run of show, onsite changes |
| 7. Reconciliation | Reviews final invoice | Matches supplier invoices, calculates attrition/F&B shortfalls and overages, issues final invoice or credit | Reconciliation, final invoice |
| 8. Debrief | Evaluates ROI, decides on rebooking | Post-event report, recommends next year | Post-event report, survey results |

---

## 7. Operational workflow (inside the agency)

### 7.1 Venue and supplier sourcing
- Planners send one RFP to many properties at once through platforms such as the Cvent Supplier Network, which lists about 340,000 hotels and venues. [V: [Cvent](https://www.cvent.com/en/blog/events/venue-sourcing-trends); network size via [Hippo Video on Cvent](https://www.hippovideo.io/blog/cvent-supplier-network-guide-find-event-venues-online/), May 2025 figure]
- 63% of planners expect a reply within **four business days** for events of up to 50 attendees. The hardest stages are **researching venue specs (25%)** and **response delays (24%)**. Nearly **one-third** say sourcing technology gets in the way or adds nothing. [V: [Cvent 2026 Planner Sourcing Report](https://www.cvent.com/en/blog/events/venue-sourcing-trends)]
- 48% source non-hotel venues (restaurants, galleries, special event spaces). These usually sit **outside** the structured RFP networks. [V: same]
- A venue RFP contains: event overview, dates, attendance min/max, room specifications, F&B requirements and spend, technology, and budget. [V: [Cvent RFP guide](https://www.cvent.com/en/blog/events/rfp-process)]

### 7.2 Contracting: where financial exposure is created
[V: [MPI Chicago on cancellation and attrition](https://www.mpi.org/chapters/chicago-area/chapter-news/single-blog/c-c-articles/2018/06/26/what-to-know-about-cancellation-and-attrition); [Marriott group terms, example](https://www.marriott.com/content/dam/marriott-digital/si/emea/hws/a/amssi/en_us/document/assets/si-amssi-meetings-terms-22-20702.pdf); [Groups360](https://groups360.com/blog/5-tips-to-avoid-room-block-attrition/)]
- **Room block attrition:** the client commits to filling a percentage of the block (commonly around 80–90%). The shortfall is charged at the group rate. It can be measured **per night** or **cumulatively**.
- **Cutoff date:** the date after which unused rooms return to the hotel. Usually 30 days before arrival, and anywhere from 14 to 90 days.
- **F&B minimums:** a committed spend on food and beverage, often combined with room attrition.
- **Cancellation schedules:** tiered penalties that rise as the event gets closer.
- **Deposit schedules**, **final guarantee** deadlines [A: F&B guarantees are commonly due about 72 hours before], and **rooming list** deadlines.

**[A]** A mid-sized agency running 30–100 events a year can hold **hundreds of live contract dates**. Each one is a point where money is lost if nobody acts. They're usually tracked in spreadsheets, calendars, or individual planners' heads.

### 7.3 Budgeting and cost control
[V: [qondor, event budget management](https://qondor.com/blog/event-budget-management)]
- Budgets are split into direct costs (venue, F&B, AV, transport, accommodation, entertainment) and indirect costs (staff time, PM overhead), with a contingency of **10–15%**.
- "A budget that splits across multiple files, versions, or systems is a budget that will be wrong at the moment you need it most." Client-facing proposals, internal tracking and finance records drift apart.
- Reconciliation against supplier invoices is **largely manual**. Service charges, tax and labour overages drift away from the proposal. One agency (KRS LIVE) reported saving **675+ hours** once reconciliation was automated.
- Common practice is to complete post-event reconciliation **within two weeks**, line by line: estimate, actual, variance, and whether it's charged or credited. [V: [ProductionPlanner.io](https://productionplanner.io/blog/event-production-budget-guide/)]
- Changes should go through **change orders or project change notices**, which decide what the agency absorbs and what it passes on with markup. [V: [IT Associates / Procim](https://www.itassociates.co.uk/post/event-budgeting-software)]

### 7.4 Event specification and handoff to suppliers
- The industry standard is the **APEX Event Specifications Guide (ESG)**. It has four parts: Narrative, Function Schedule, Function Set-up Orders, and Exhibitor Set-up Orders. Revisions are dated and changes highlighted. [V: [EIC APEX ESG template](https://insights.eventscouncil.org/Portals/0/APEX_Event_Specifications_Guide.pdf); [MeetingsNet](https://www.meetingsnet.com/association-meetings/four-s-s-and-esg)]

### 7.5 Production and onsite
- Production companies manage crew and equipment in dedicated rental and production software (Rentman, Current RMS) with skills-based crew scheduling, freelancer job boards, and RFID warehouse tracking. [V: [Rentman](https://rentman.io/solutions/event-production-planning-software)]

### 7.6 Compliance (life sciences)
- Pharma and med-device manufacturers must report payments and transfers of value to covered recipients: meals, travel, speaker fees, and support for educational events. Agencies running HCP events have to capture **per-attendee spend** in a form their clients can report. [V: [CMS Open Payments](https://www.cms.gov/priorities/key-initiatives/open-payments/natures)]

---

## 8. Common systems

| Job | Typical tools | Notes |
|---|---|---|
| Registration, attendee management, event marketing | Cvent, Bizzabo, Swoogo, Stova | Attendee-facing. Mature and crowded |
| Venue sourcing | Cvent Supplier Network, direct email, hotel brand portals | RFP distribution is well served. Comparing responses and non-hotel venues are less so [V: Cvent sourcing report] |
| Venue-side operations | Momentus (formerly Ungerboeck), Tripleseat | Built for **venues**, not agencies [V: [Momentus](https://gomomentus.com/about-us)] |
| Production, crew, equipment | Rentman, Current RMS, Flex | Built for **AV/production** companies |
| Agency financials / PSA | qondor, Procim, Scoro | Budget, proposal and reconciliation platforms aimed at agencies [V: [qondor](https://qondor.com/blog/event-budget-management); [Scoro](https://www.scoro.com/industries/event-management-software/)] |
| Small-planner all-in-one | Planning Pod, HoneyBook | Budgets and templates for small teams [V: [Planning Pod](https://planningpod.com/budgeting)] |
| CRM / new business | HubSpot, Salesforce, Pipedrive | Generic pipelines. Agency new business is "relationship-first and nonlinear" [V: [HubSpot blog](https://blog.hubspot.com/marketing/best-crms-for-event-management-businesses) and related coverage] |
| Project management | Asana, monday.com, Smartsheet | [A] Timelines and task lists |
| Accounting | QuickBooks, Xero, NetSuite | [A] |
| **The system of record in practice** | **Excel/Google Sheets, email, shared drives** | [A, strongly supported by the qondor fragmentation evidence] |

**[A] The gap:** attendee-facing tools, venue tools and production tools are all mature. The **agency's own commercial operating layer** is the least served part: pitch qualification, budget-to-contract-to-invoice integrity, contract risk dates, and change control. Where tools do exist (qondor, Procim, Scoro), they are horizontal PSA or budget platforms. None is built around the agency's **contractual exposure and pitch economics**.

---

## 9. Manual processes (observed or strongly indicated)

1. Assembling proposal budgets in spreadsheets from supplier quotes that arrive by email and PDF. [V: qondor]
2. Keeping the client-facing budget (with markup) consistent with the internal cost budget. [V: qondor]
3. Comparing venue RFP responses side by side (rates, concessions, attrition terms, F&B minimums). [A]
4. Tracking contract dates: deposits, cutoffs, attrition review points, cancellation tiers, final guarantees. [A]
5. Reconciling rooming lists and registration headcount against the contracted block. [A]
6. Raising and approving change orders, and recalculating budgets when headcount or scope changes. [V: Procim/IT Associates]
7. Post-event reconciliation: matching supplier invoices to budget lines, working out attrition and F&B shortfalls, and producing the final client invoice or credit. [V: qondor, ProductionPlanner]
8. Deciding go/no-go on RFPs and tracking win/loss reasons. [A, based on micebook pitch-cost evidence]
9. Capturing per-HCP spend for life-sciences clients. [A]
10. Handing off from sales to operations: making sure the assumptions in the winning proposal carry into delivery. [A]

---

## 10. Data sources

| Data | Where it lives today |
|---|---|
| Client briefs / RFPs | Email attachments (PDF, DOCX), procurement portals |
| Proposal budgets | Spreadsheets |
| Supplier quotes | Email, PDF |
| Venue RFP responses | Cvent Supplier Network, email |
| Contracts (hotel, venue, supplier) | PDF, e-signature platforms |
| Attendee / registration data | Cvent / Bizzabo / Swoogo exports, client HR/CRM lists |
| Rooming lists | Spreadsheets exchanged with hotels |
| Supplier invoices | Email, accounting system |
| Time / staffing | PSA or timesheets, if tracked at all |
| Win/loss and pipeline | CRM, if maintained |

---

## 11. Important business events (possible triggers for automation)

| Event | Why it matters |
|---|---|
| RFP / brief received | Starts the go/no-go clock. Deadline-driven |
| Pitch decision (won/lost) | Win-rate learning, and the handoff to ops |
| Contract signed | Creates the dated obligations: deposits, cutoffs, attrition, cancellation |
| Deposit due | Cash flow |
| Registration pace falls below block pickup curve | Early warning of attrition exposure |
| Cutoff date approaching | Last chance to release rooms without penalty [A: many contracts allow block reductions before set dates] |
| Headcount / scope change | Budget, F&B guarantee and supplier changes. Needs a change order |
| Final guarantee deadline | F&B commitment is locked |
| Event delivered | Starts the reconciliation clock |
| Supplier invoice received | Must be matched to the budget line |
| Final client invoice issued | Revenue is realised |
| Hotel commission due / received | Often forgotten revenue [A] |

---

## 12. Likely bottlenecks (hypotheses for Phase 2)

These are **hypotheses**, ranked by strength of evidence rather than importance.

| # | Bottleneck | Evidence | Who feels it |
|---|---|---|---|
| **B1** | **Pitch economics.** 60–300 hours per proposal, 7–12+ agencies invited, weak qualification, little feedback | **Strong** [V: micebook] | Agency founders, new-business leads |
| **B2** | **Budget fragmentation and late reconciliation.** Proposal, internal budget, contracts and invoices drift apart, and margin loss is found only after the event | **Strong** [V: qondor, ProductionPlanner] | Account directors, finance |
| **B3** | **Contractual exposure blindness.** Attrition, F&B minimums, cutoffs and cancellation tiers across many contracts, with no forward-looking risk view | **Medium** [V: clause mechanics; A: how it's tracked] | Ops leads, finance, the client |
| **B4** | **Sourcing comparison friction.** Response delays, researching specs, technology that adds no value, and non-hotel venues outside the networks | **Medium** [V: Cvent survey] | Planners, sourcing specialists |
| **B5** | **Uncontrolled change.** Scope and headcount changes aren't priced or approved, so costs are absorbed | **Medium** [V: change-order practice; A: frequency] | Account directors |
| **B6** | **Sales-to-ops handoff loss.** Proposal assumptions don't survive into delivery | **Weak–Medium** [A] | Ops teams |
| **B7** | **DMC lead triage.** DMCs receive many agency RFPs with short turnaround and uncertain conversion | **Weak** [A] | DMC sales teams |
| **B8** | **HCP spend capture.** Per-attendee transfer-of-value data for life-sciences clients | **Medium** [V: regulation; A: agency burden] | Agencies with pharma clients |

**Pattern [A]:** B1, B2, B3 and B5 are all the same problem seen at different points. **The agency's money is committed in documents (proposals, contracts, change orders) and only discovered in spreadsheets (reconciliation).** No mainstream tool treats that commercial chain as the agency's core system of record.

---

## 13. Research limitations

- The full EIC report, Amex GBT forecast PDF, Northstar forecast and BTN pages were blocked (403 errors or bot checks). Where figures are cited, they come from reputable secondary coverage of those reports and are labelled.
- The APEX ESG PDF was retrieved but couldn't be parsed. Its structure is confirmed through MeetingsNet.
- There is no credible public data on **agency win rates, gross margins, or how often attrition penalties are actually paid**. These are the most important gaps to close through **operator interviews** before a spec is final.
- Suggested validation: 3–5 conversations with agency ops directors, finance leads, and a DMC sales lead.

---

## 14. Sources

- Events Industry Council / Oxford Economics, 2026 Global Economic Significance of Business Events: [EIC news](https://news.eventscouncil.org/eic-releases-full-2026-global-economic-significance-of-business-events-study/), [Exhibitor Online summary](https://www.exhibitoronline.com/news/article.asp?ID=25306)
- [U.S. Bureau of Labor Statistics — Meeting, Convention & Event Planners](https://www.bls.gov/ooh/business-and-financial/meeting-convention-and-event-planners.htm)
- [Amex GBT 2026 Global Meetings & Events Forecast](https://www.amexglobalbusinesstravel.com/meetings-events/me-forecast/)
- [Cvent 2026 Planner Sourcing Report (n=1,650)](https://www.cvent.com/en/blog/events/venue-sourcing-trends)
- [Cvent — RFP process for hotels & venues](https://www.cvent.com/en/blog/events/rfp-process)
- [Incentive Research Foundation — 2026 Trends Report](https://theirf.org/research_post/irf-2026-trends-report/)
- [micebook — From RFP to Partnership: Fixing the Event Pitch Process (2026)](https://micebook.com/blog/2026/03/10/from-rfp-to-partnership-fixing-the-event-pitch-process/)
- [ADMEI — DMC definition](https://www.admei.org/about/) · [ADMEI accreditation requirements](https://www.admei.org/admc)
- [IAPCO — Professional Congress Organisers](https://www.iapco.org/)
- [GBTA — Strategic Meetings Management](https://gbta.org/professional-development/education-growth/the-fundamentals-of-strategic-meetings-management/)
- [MPI — Cancellation and attrition](https://www.mpi.org/chapters/chicago-area/chapter-news/single-blog/c-c-articles/2018/06/26/what-to-know-about-cancellation-and-attrition)
- [Marriott — Group meeting terms (example contract)](https://www.marriott.com/content/dam/marriott-digital/si/emea/hws/a/amssi/en_us/document/assets/si-amssi-meetings-terms-22-20702.pdf)
- [Groups360 — Room block attrition](https://groups360.com/blog/5-tips-to-avoid-room-block-attrition/)
- [EIC — APEX Event Specifications Guide](https://insights.eventscouncil.org/Portals/0/APEX_Event_Specifications_Guide.pdf) · [MeetingsNet on the ESG](https://www.meetingsnet.com/association-meetings/four-s-s-and-esg)
- [CMS — Open Payments natures of payment](https://www.cms.gov/priorities/key-initiatives/open-payments/natures)
- [qondor — Event budget management](https://qondor.com/blog/event-budget-management)
- [IT Associates — Procim event budgeting for agencies](https://www.itassociates.co.uk/post/event-budgeting-software)
- [ProductionPlanner.io — Event production budget guide](https://productionplanner.io/blog/event-production-budget-guide/)
- [Scoro — Event management PSA](https://www.scoro.com/industries/event-management-software/)
- [Rentman — Event production planning](https://rentman.io/solutions/event-production-planning-software)
- [Momentus Technologies](https://gomomentus.com/about-us)
- [Planning Pod — Budgeting](https://planningpod.com/budgeting)
- [Bash Creative — Agency pricing models](https://www.bash-creative.com/blog-post/understanding-standard-agency-pricing)
- [J.Shay Events — Event management costs and hotel commission](https://jshay.events/how-much-does-event-management-cost/)
- [HubSpot — CRMs for event management businesses](https://blog.hubspot.com/marketing/best-crms-for-event-management-businesses)
