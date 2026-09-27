# Teaching Playbook: Tool 01, the Exposure Register

**For:** aspiring GTM Engineers following the 30 Tools in 90 Days challenge.
**The point:** how to go from "event management companies" to a system a real agency would pay to have built, and the reasoning at each step. The code comes last.

---

## 1. Industry research

**What we did:**
- Started from first-party and industry sources: the Events Industry Council, BLS, Cvent's planner survey, the Incentive Research Foundation, MPI, hotel group contract terms, and professional associations (ADMEI, IAPCO, GBTA).
- Avoided "top 10 event tools" articles.
- Labelled every claim **[V]** verified or **[A]** assumption.

**What we found:**
- "Event management" covers several different businesses. Wedding planners are B2C with cheap tools already, so they fail the $30 Tool Test by design. The B2B segments (corporate agencies, M&I companies, DMCs, PCOs) have procurement, contracts and financial exposure.
- **Budgets are squeezed from both sides.** Clients hold budgets flat while 72% of planners expect costs to rise.
- **Money is committed in documents and discovered in spreadsheets.** Supplier contracts create obligations (attrition, F&B minimums, cancellation tiers), but reconciliation happens after the event.

**Lesson:** research the *money flows* of the business, not just its activities. The best internal systems sit where money is committed or lost.

## 2. GTM model

How an event agency wins and keeps customers:
- **Repeat programmes** (the same SKO or conference every year) are the base.
- **RFPs** bring new work. Clients often invite 7–12+ agencies, and a proposal costs 60–300 hours.
- **Preferred-supplier rosters** under master services agreements, often run by procurement.
- **The user, buyer and payer are three different people:** the client's event manager, procurement or the budget owner, and finance.

**Why this matters for the build:** the agency's credibility with a client rests on "no surprises". A system that warns early about penalties, and makes the client approve changes that cost money, *is* client retention. That becomes a selling point for the buyer, not just an ops convenience.

## 3. Workflow

How it works today (from research, labelled as assumption where not verified):
1. The agency signs hotel, venue, catering, AV and transport contracts. Each is a PDF with dates and penalty terms.
2. Someone copies key dates into a calendar or spreadsheet, or doesn't.
3. Registration or room pickup is checked against the block, occasionally.
4. Headcount changes are agreed by email or phone. The F&B guarantee and the room block may or may not be adjusted.
5. After the event, finance reconciles invoices, often discovering the attrition charge for the first time.

## 4. Bottleneck

Four candidate bottlenecks turned out to be one problem seen from different angles:
- pitch economics
- budget fragmentation
- contract exposure blindness
- uncontrolled change

**Nobody can say what the agency owes if nothing changes, what it would owe if the event were cancelled today, or whose money that is.** The contract says what the penalty is. The client agreement says who pays it. Pickup data says how likely it is. Those three live in three different places.

## 5. System design

**Why an "Exposure Register" with change control, and not the alternatives:**
- A **pitch desk** mostly fails the $30 Tool Test, because a CRM plus a scorecard gets 60% of the way.
- A **budget ledger** competes head-on with qondor, a funded product.
- **Hotel block tools** exist (Blocks, Passkey), but only for rooms.
- The custom part, which a cheap tool can't have, is **every supplier contract × pickup × the liability split per client agreement**. Change control closes the loop: a change is the moment exposure moves.

**Key design decisions:**
- **Human-confirmed data only.** AI can propose terms, but nothing counts until a person confirms it. Unconfirmed or missing inputs make a figure *incomplete*. They're never silently counted as zero. Missing data is shown, never guessed.
- **Every number explains itself.** The working drawer and the number come from the same calculation object, so the two can't disagree.
- **Deadlines are generated, not typed.** Confirming a contract produces its deadlines in the supplier's timezone (hotel cutoffs are local time).
- **Markers vs tasks.** A cancellation step-up or a passed cutoff isn't a job someone forgot. Treating them as "overdue" was a real bug found in testing. It destroyed trust in the deadline list until the model separated markers from tasks.
- **Liability is data.** Who pays attrition under client A's agreement is a row in a table, not an `if` in code. That one decision makes the product white-label.

## 6. Engineering

- **Stack:** Next.js 16 (Server Components and Actions), PostgreSQL, Drizzle, Better Auth, Zod, Tailwind with Radix primitives. It's chosen for one deployable, typed end to end, and hostable anywhere. Why each choice beat its alternative is recorded in [docs/05](05-architecture.md).
- **Layers:** `core/` is pure calculation with no I/O, so it can be unit-tested exhaustively. `services/` handles authorisation, audit and locking. Pages only call services.
- **Money:** integer minor units, BigInt for percentages and FX, explicit rounding rules. Floating-point currency is how exposure tools lose trust.
- **How Claude Code was used:**
  - Phases gated by documents: research → opportunities → spec → UX → architecture → build.
  - Building in milestones, each run, screenshotted at desktop and phone width, tested and fixed before moving on. Read [docs/06](06-build-log.md) for the issues that surfaced; they're the real teaching material.
  - Examples of what only showed up by *using* the product, not by reading code:
    - "49 days overdue" on a delivered event
    - the portfolio taking 4s at 200 events
    - a 500 on a malformed URL
    - a table pushing the page sideways on a phone
- **Performance lesson:** the first portfolio query loaded each event separately (N+1), then joined in memory with nested filters (O(n²)). Batching, keyed maps and two indexes took it from about 4s to under 1s. Always generate a realistic dataset before calling a dashboard done.

## 7. Automation

| Automated | How | Why it's safe |
|---|---|---|
| Term extraction from PDFs | Claude with a structured-output schema, and source quotes verified against the document text server-side | Proposals only. A person confirms each value |
| Deadlines | Generated from confirmed terms | Deterministic, and recalculated when terms change |
| Reminders and escalation | Daily and hourly jobs with dedupe keys | Re-running a job never double-notifies (tested with a fake clock) |
| Exposure recalculation and alerts | After every pickup, forecast, contract or change update | Alerts close on their own when the condition clears |
| Change approval routing | Internal approval over a limit or under the margin floor, then a client link | The requester can never approve their own change |
| Close-out | Delivering an event waives non-payment deadlines and resolves forward-looking alerts | Payments stay open, because the money is still owed |

**Lesson:** use AI where reading unstructured text is the bottleneck (contracts). Use plain deterministic code where the result must be auditable (money).

## 8. Commercialization

See [docs/07](07-commercialization.md). In short:
- **Buyer:** the agency MD, COO or CFO.
- **Value drivers:** penalties avoided, scope changes recovered, portfolio liability visibility.
- **Revenue:** implementation work (liability setup and contract backfill), integrations, and managed service.

**The sales move:** backfill one real event and show the client their own exposure figure.

## 9. White-labeling

- One JSON config per deployment covers brand, terminology, workflow lists, clause defaults, rules, pricing, role labels, currencies, email and extraction.
- It's loaded into the database at seed time, edited in Settings, and exported back to JSON.
- The brand colour is rejected at seed time and in Settings if white text on it would fall below 4.5:1 contrast.
- A new deployment is config plus env vars plus `db:migrate` plus `db:seed -- --org-only`, with no code changes.
- **Test for any white-label claim:** grep the core for a client name. There shouldn't be one.

## 10. Lesson

1. **Follow the money.** The workflow worth systematising is the one where money is committed in one place and discovered in another.
2. **The custom logic is the moat.** Hotel-block tools exist. "Who pays, under which agreement, across every supplier" is what an agency can't buy for $30.
3. **Never show a number you can't explain.** Incomplete beats wrong, and a working drawer beats a chart.
4. **Test like a customer, at realistic scale, on a phone.** Most of the important fixes in this build came from using it, not from reading the code.
5. **Write down what isn't done.** Live extraction isn't verified, hosted storage isn't built, logo upload is missing, and core branch coverage is 87%, not 100%. A buyer trusts the builder who says so.
6. **"Not vibe coded" means "obviously built for this industry", not "less decoration".** The first redesign added decoration and the second removed it. Both were rejected, because both looked like any SaaS product. What worked:
   - research into the default choices AI tools make (Inter, Lucide, blue, symmetric card grids, no imagery)
   - a written design system *before* touching screens
   - the industry's own visual language: venue photography on every event, and hospitality typography
   - checking every photo by eye (9 of 30 were rejected, mostly for real brands on screen)
   - proving that text over photos meets contrast with arithmetic and axe, not by eye

   See [docs/09](09-design-system.md) and build-log milestone 12.
7. **Validate with evidence, and show the uncertainty.** When asked "is this a real problem?", separate three things:
   - what is verified: a third of room nights fall outside the block, per-night attrition, charges that step up
   - what is weak: generic agency-finance statistics
   - what nobody knows yet: how often agencies actually pay

   Then write the interview script that closes the gap ([docs/10](10-problem-validation.md)). A buyer trusts "here's what I don't know yet" more than a confident number.
8. **Money is a language, not a chart.** Non-specialists read a sentence ("If nothing changes, you'll owe about $100k; $36k is yours") faster than a dashboard. Keep precision for the people who need it (finance, on the detail tabs), and give everyone else rounded amounts, plain words, and one next action with a date and an amount.
9. **Look for value the data already holds.** The contracts already stored "reduce up to 10% by Oct 3". Turning that into "give back 56 room nights, save €8,127" needed no new data entry, only a question: what would a good ops director do with this date?
10. **Price is set by delivery, not logic.** The exposure maths was worth money from milestone 9. What a buyer hesitates over is how their data gets in, whether it stays current, and how they'll prove value later. Ask "what would stop them signing?" and build that next.
11. **Only count what a person recorded.** The system suggests savings; the ledger counts decisions. Mixing the two produces a number nobody believes at renewal. Measure the recorded amount with the same engine (the seed does exactly that: the room release is priced by the exposure calculation, then recorded, then the contract is amended).
12. **Seeding the real workflow finds real bugs.** Seeding an amendment through the services (instead of inserting rows) exposed that amendments dropped pickup history. Demo data built through the product is a free integration test.
13. **Decide what an external page can never contain, then enforce it in the data, not the template.** The client view model has no field for the agency's share, so no template change can leak it.
