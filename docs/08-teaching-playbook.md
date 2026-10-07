# Teaching playbook: Expansion Signal Desk

How another GTM engineer could find, design, build and sell this, with the reasoning behind each step.

## 1. Industry research
- **"B2B SaaS" is two businesses.** Pick one before researching: the vendor selling software, or the company buying it. We chose the vendor ([01 §0](01-industry-research.md)).
- **Use benchmark surveys with stated samples, and label every claim.** Sources: ICONIQ (150+ GTM leaders), Salesforce State of Sales (4,050 sellers), KeyBanc/Sapphire, The Bridge Group, Gainsight's CS Index.
- **The finding that shaped everything** came from ICONIQ: CS-sourced opportunities win about 52% of the time, the highest of any source, and operators credit "formal CSQL programs" and "product telemetry".

## 2. GTM model
Mid-market SaaS vendors are mostly sales-led (62%), with hybrid motions growing. Growth now leans on existing customers:
- net revenue retention is the headline metric
- AEs are increasingly paid on net retention
- contracts are shorter
- usage pricing creates more expansion moments

## 3. Workflow
**Usage happens in the product → someone may notice it in a dashboard → maybe a Slack message to sales → maybe an opportunity in the CRM → nobody can tell which of those signals mattered.**

## 4. Bottleneck
- **Not detection.** Alerts are cheap.
- **The bottleneck is the accountable handoff:**
  - who decides a signal is real
  - who gets it and by when
  - why a signal was ignored
  - what it eventually turned into
- That's why this passes the "$30 tool test": the value is in the vendor's own rules, routing, credit and evidence, not in an alert.

## 5. System design
1. **Deterministic, explainable rules, not a model.** RevOps has to trust and tune them, and CSMs have to defend them to sellers. Every signal shows:
   - its evidence
   - its value working ("12 seats × $1,200 …")
   - a priority score that is a visible sum
2. **Dismissals need a reason.** Dismissal reasons are the training data for humans: the rule page shows why each rule gets dismissed, so thresholds are tuned with evidence.
3. **Cooldowns, with one refinement found while building.**
   - A dismissal can be overridden by a big change in value, because the CSM's reason may be out of date.
   - A closed deal cannot be overridden: a seller just spoke to the customer.
4. **Only recorded outcomes count.** Estimates help prioritise; pipeline and won revenue come only from what sellers record. That's what makes the Results page credible at a QBR.
5. **The signature visual is the data itself:** a small "signal trace" of the metric against its threshold, on every signal.

## 6. Engineering
- **Stack:** Next.js 16, Postgres, Drizzle, Better Auth, Zod, Vitest, Playwright and axe. Reused from Tool 01 on purpose, so the time went to the product.
- **Pure core** (`src/core`): rule functions, value, priority, business-day deadlines, state machines, routing. Unit-tested with hand-worked numbers.
- **The seed is a test.**
  - The demo replays three months of team work through the real services, with the clock set back: weekly detection, CSMs accepting and dismissing, sellers winning and losing.
  - That replay found two real bugs before any user saw them:
    - contacts duplicated within one batch
    - a signal re-raised three days after a lost deal
- **Performance was measured, not assumed.** A script times detection, the queue and the account list at 2,000 accounts × 90 days. It caught an account list that was too slow, fixed by replacing three per-row subqueries with one grouped query.

## 7. Automation
- daily detection at 06:00 in the org's time zone, and immediately after each usage upload
- deadline reminders that escalate: due soon, then overdue, then "needs reassigning" for the leader
- snooze wake-ups and auto-expiry
- outbound signed webhooks with retries
- inbound CRM updates through the same state machine
- the Monday digest

All jobs are idempotent: re-running changes nothing.

## 8. Commercialization
Sell the evidence loop, not the dashboard. Open with a rule preview on the prospect's own data, then price the implementation on:
- data work
- rule design
- CRM depth

Then sell tuning as a managed service. See [07](07-commercialization.md).

## 9. White-labeling
- The tenant's product vocabulary (seats, credits, add-ons), price book, segments, deadlines and reasons are config.
- Rule types are code; rule instances are config.
- A new client is a config file plus a data feed.

## 10. Lesson
1. **In crowded categories, look between the tools.** CS platforms, product analytics and CRMs each do their part; the money is lost in the handoff between them.
2. **Make the system explain itself.** Explanations, value working and visible priority sums are why people act on a signal.
3. **Make "no" useful.** Reasons for dismissal and return turn rejections into rule improvements.
4. **Count only what people record.** That keeps your results from being dismissed as made up.
5. **Build the demo through the product.** Replaying realistic history through real services gives a believable demo and a free integration test.
