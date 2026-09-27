# Commercialization: Exposure Register

No prices are invented here. This document explains what would determine the price, and where the revenue would come from.

Evidence labels follow docs/01: **[V]** verified with a source, **[A]** assumption to validate with operators.

---

## Target user

The people who use it every day:
- **Operations director / head of delivery** at a B2B event agency, meetings & incentives company, DMC or PCO. Owns the alerts and decisions, and approves changes.
- **Event managers**, who keep contracts, pickup and forecasts current for their own events. This is the person whose spreadsheet the system replaces.
- **Finance**, who records deposits and payments, reconciles actual penalties, and pulls the payment schedule.

## Buyer

The **MD, COO or CFO** of an agency running enough events that no one person can hold every contract date in their head. [A] That point is roughly 30+ contracted events a year, or several large programmes with many supplier contracts each.

What they're buying is the answer to two questions they can't answer today:
1. "How much money do we have at risk right now across all events, and how much of it is ours rather than the client's?"
2. "What did that headcount change actually cost, and did the client approve paying for it?"

A secondary buyer is the **corporate in-house events team** (e.g. a sales-kickoff owner at an enterprise), where the "client" is an internal budget holder.

## Business problem

- Supplier contracts create dated money obligations: attrition, F&B minimums, cancellation tiers, deposits, guarantees [V: MPI, Marriott group terms]. These are tracked in PDFs, calendars and people's heads [A].
- Budgets are under pressure: 72% of planners expect costs to rise, and 35% name staying within budget as their biggest concern [V: Cvent 2026, n=1,650]. Clients want more for flat budgets while supplier costs rise.
- Changes are agreed on calls and absorbed instead of priced [V: change-order practice; A: frequency].
- Existing tools cover **hotel room blocks** (Blocks, Cvent Passkey, Groups360) [V]. None covers every supplier contract type, the agency portfolio, and the liability split under each client agreement together.

## Implementation

What a GTM Engineer or agency does to deploy it for a client. This is where most of the effort and the service revenue sits:

| Work | What it involves | Effort driver |
|---|---|---|
| Discovery | Map the agency's event types, client agreements, approval limits, who escalates to whom | Number of client agreement templates |
| Configuration | Terminology, rules (reminder offsets, thresholds, margin floor, approval limit), pricing (markup by category, management fee), roles, currencies, branding | Mostly fixed; this is a config file |
| **Liability setup** | Translate each client MSA into the liability matrix: who bears attrition, F&B shortfall, cancellation, deposits, and at what split | Number of clients × agreement versions. **This is the custom logic that makes the system worth buying** |
| **Contract backfill** | Load every live contract and confirm its terms (extraction proposes them, a person confirms) | Number of live contracts and their quality (scans need manual entry) |
| Pickup feed | Start with CSV. Later, integrate the housing or registration system | Which system the agency uses |
| Training | Ops director, event managers, finance (three short role-based sessions) | Team size |
| Hosting | Vercel + managed Postgres, or the agency's own infrastructure | Security and data-residency requirements |

## White-label opportunity

A consultant or agency-services firm can deploy it under their own brand without touching code:
- **Product name, colour and terminology** are configuration. "Events / Clients / Change requests" can become "Programmes / Accounts / Change orders".
- **Rules and pricing** are per deployment, so the same build serves a DMC (fixed-margin ground services) and a full-service agency (markup plus a management fee).
- **Liability rules are data.** A consultant who specialises in agency operations can bring standard MSA templates and load them as starting points.
- One deployment per client keeps data separate. There's no multi-tenant risk to explain to a procurement team.

**Current gap:** logo upload isn't built yet. The config field exists, and it's a small addition.

## Service opportunity

| Service | Why a client pays for it |
|---|---|
| **Implementation** (discovery, configuration, liability setup) | The agency doesn't have time to translate its MSAs into rules |
| **Contract backfill** | A one-off load of the current portfolio, so the first portfolio figure is complete on day one |
| **Integration** | Pickup from housing and registration systems; payments into accounting |
| **Managed service** | Keeping contracts current for a small agency without ops staff, and a weekly exposure review |
| **Optimisation** | Tuning thresholds and reminder offsets from the projected-vs-actual penalty record |
| **Training** | Onboarding new event managers into the discipline, not just the tool |
| **Maintenance / hosting** | Upgrades, backups, monitoring for agencies without IT |

## Product opportunity

It could become a standalone product if the following hold:
- The **clause library** generalises. The six clause types cover the common hotel, venue and F&B contracts. Enough deployments would show which supplier-specific terms recur.
- **Pickup integrations** become connectors rather than per-client work.
- **Multi-tenancy** is added (today every table carries `org_id`, so the data model is ready, but deployment is single-organisation).
- The **projected vs actual penalty** data across agencies becomes a benchmark ("agencies like you pay X% of projected attrition"). No competitor has that dataset.

The risk to a product path is **Blocks** moving from hotel blocks into general supplier contracts. The defence is the liability-allocation and change-control layer, which is agency-operating logic, not contract storage.

## Pricing value drivers

What should determine the price (not the price itself):

1. **Penalties avoided.** Attrition and F&B shortfall charges avoided through earlier room releases and renegotiation. The post-event report measures this directly (projected vs actual). [A] Penalty frequency and size are the key unknowns, so validate them in the first implementation and price on evidence afterwards.
2. **Scope changes recovered.** Changes that are priced and approved instead of absorbed. The change-request log gives the number.
3. **Portfolio size.** Events a year, live contracts and users drive both the value and the implementation effort.
4. **Liability complexity.** More client agreements with different splits mean more setup work and more value from getting it right.
5. **Time replaced.** Event manager and finance hours spent keeping contract dates in spreadsheets and reconciling penalties after the event [V: one agency reported saving 675+ hours when reconciliation was automated, per qondor].
6. **Risk reporting to leadership.** An MD- and CFO-level liability figure that didn't exist before. This is often the actual reason to buy.

**How to sell it (for the GTM Engineer):** lead with a **backfill of one real event**. Load its contracts, show the exposure figure and its bearer split, and show the next cutoff. The demo is the client's own money. Then price implementation on the portfolio size and the number of client agreements, and the ongoing service on events under management.

## What milestone 14–17 changed about the sale

The honest answer to "is this worth a $10k build?" was: the logic was, the delivery wasn't. Each upgrade targets one reason a buyer would hesitate.

| Upgrade | Buyer's hesitation | Value driver it strengthens |
|---|---|---|
| Bulk contract import | "Loading our contracts will take weeks" | Time to first value: a backfill of one real event in an afternoon, not a data-entry project. Implementation effort now scales with review time, not typing |
| Emailed hotel reports | "The figures will go stale" | Accuracy without extra work: pickup arrives the way hotels already send it, so the exposure figure stays current. Sells as a per-supplier setup service |
| Money protected ledger | "How do we know it paid for itself?" | Evidence at renewal: only recorded decisions and billed changes count, each linked to its record, exportable for finance. It turns driver 1 (penalties avoided) and driver 2 (changes recovered) into numbers the buyer produced themselves |
| Client share link | "Our clients keep asking where we stand" | Client retention and account transparency: the agency looks more in control than competitors. Also a reason for the client's side to know the product exists (referral path) |

**Still missing before a $10k sale is comfortable:** a hosted deployment with blob storage, a live run of contract reading on the buyer's own PDFs (needs an API key), and one agency's real numbers (docs/10 interview plan).
