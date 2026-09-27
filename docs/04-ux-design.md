# Phase 4 — UX / UI Design: Exposure Register

**Tool:** 01 · **Written:** 2026-09-23 · **Input:** [03-product-spec.md](03-product-spec.md) · **Status:** Draft for review

---

## 1. Design position

**Subject:** signed contracts, and the money they commit over time.
**Audience:** operations directors, event managers, finance leads and agency owners who spend their working day in it.
**Primary job:** show what is at risk, when it becomes due, and who carries it, then get the right person to act.

This is a working instrument, not a marketing surface. The design borrows from the materials of the trade: the contract (clauses, quoted terms, versions), the ledger (aligned figures, debit/credit clarity) and the schedule (dates, tiers, deadlines). It does **not** borrow from the generic SaaS dashboard.

### What we take from established products (conventions, not styling)

| Product | Pattern we adopt | Where |
|---|---|---|
| Linear | Keyboard-first lists, command menu, calm density, status as a small glyph plus text | Tables, ⌘K, statuses |
| Attio / HubSpot | Record page: attributes on one side, associated records and activity alongside | Event, Contract, Client pages |
| Airtable / Linear | Saved views (filters, sort, columns) per user | Events, Deadlines, Changes |
| Contract-review tools (e.g. Ironclad) | Split view: document on the left, extracted fields on the right, each linked to its highlighted source | Contract review |
| Spend-approval tools (e.g. Ramp) | Approval as one focused decision screen with the numbers that matter and nothing else | Internal and client approval |

### Visual clichés we refuse
No gradients, glass or blobs. No sparkle icons, including on extraction: it's labelled plainly as "Read terms from document". No KPI tiles with decorative sparklines. No oversized rounded cards. No dark-mode-first dashboards. No emoji. No fake activity.

---

## 2. Design tokens

### Colour

A light theme first. Neutrals lean slightly green-grey, like ledger paper, rather than warm cream or blue-grey.

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#F4F5F2` | App background |
| `surface` | `#FFFFFF` | Tables, panels, forms |
| `ink` | `#1B2220` | Primary text, figures |
| `ink-muted` | `#5B6561` | Secondary text, column headers |
| `rule` | `#DADFDB` | Borders, table rules |
| `brand` | `#1F4F73` | **White-label.** Primary actions, selected nav, focus ring. Overridden per client (contrast-checked at ≥ 4.5:1 on white) |

**Meaning colours.** These are fixed and never white-labelled, because a client's brand red must not be mistaken for "overdue":

| Token | Hex | Meaning |
|---|---|---|
| `risk-high` | `#B42318` | Overdue · exposure over threshold · cancellation tier stepping up within 7 days |
| `risk-watch` | `#A15C07` | Due soon · projected attrition > 0 |
| `settled` | `#1D6B4F` | Done · approved · paid |
| `bearer-agency` | `#7A4E9C` | Exposure carried by the agency |
| `bearer-client` | `#2F6F8F` | Exposure carried by the client |
| `bearer-unassigned` | `#8A918E` shown **with 45° hatching** | Liability with no rule. The hatching means "not determined", and it stays readable in greyscale and for colour-blind users |

Bearer colours are the only categorical colours in the product. They appear only where money is split by bearer.

### Typography

**Public Sans** (a variable font on Google Fonts, originally the U.S. government's typeface) is used throughout. It is plain, legible and institutional, which suits contracts and money, and it has true tabular figures. One family, with hierarchy from size and weight only.

| Style | Size / line | Weight | Use |
|---|---|---|---|
| Page title | 20 / 28 | 600 | One per page |
| Section | 15 / 22 | 600 | Panel headings |
| Body | 14 / 20 | 400 | Forms, prose |
| Table | 13 / 18 | 400 | Rows (500 for the primary column) |
| Meta | 12 / 16 | 400 | Timestamps, helper text |
| Figure-L | 28 / 32 | 600, `tnum` | Headline exposure figures only |

- All figures use `font-variant-numeric: tabular-nums` and are right-aligned in tables.
- Currency is always shown with its code when it differs from the base currency (`EUR 48,200`).
- Sentence case everywhere. No all-caps labels.

### Space, shape, elevation
- 4px base grid. Table rows are 36px (compact 30px, set per user).
- Radius: 4px for controls, 6px for panels and popovers. Status pills have no radius; they're plain text with a glyph.
- Elevation: none on the page. Popovers, menus and drawers get one shadow (`0 4px 16px rgb(27 34 32 / .12)`) plus a 1px `rule` border.
- Motion: 120ms ease-out for drawers and menus, only in response to user actions. `prefers-reduced-motion` turns motion off.

### Icons
Lucide, 16px, 1.5px stroke. Icons appear only next to navigation items and actions, never as decoration beside headings.

---

## 3. The signature element: the commitment timeline

Every event and every contract shows one horizontal strip from **today → event end**:

```
 Today                         Cutoff Oct 21        Guarantee Nov 12   Event Nov 15–17
   │                                │                     │                 ██
───┼────────────────────────────────┼─────────────────────┼─────────────────██──
   ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔│▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
   Cancellation 25%     │ 50% from Oct 16        │ 100% from Nov 1
   USD 61,300           │ USD 122,600            │ USD 245,200
          ◆ Deposit 2 due Oct 3 (USD 40,000)
```

- **Top track:** dated obligations (cutoffs, guarantees, other deadlines). Deposits are diamonds on the payment track.
- **Bottom track:** the cancellation liability **as a staircase**. Each tier step is labelled with its % and amount. The current tier is shaded solid; future tiers are outlined.
- Colour follows meaning: a step within 7 days is `risk-high`, within 21 days `risk-watch`, otherwise `ink-muted`.
- Hovering or focusing any mark shows its clause with the quoted source text. Clicking opens the obligation.
- Accessibility: it's a real SVG with focusable marks, and a "View as table" toggle is always there. The table is the accessible source of truth.

This is the one place the design is expressive. It exists because a planner's key question is "when does this get more expensive?", and a staircase answers that faster than a table can.

---

## 4. App shell and navigation

```
┌──────────────┬──────────────────────────────────────────────────────────────────┐
│ [Logo] Name  │  Events / Acme SKO 2027 / Contracts            [⌘K Search]  [?] [JM]│
│              ├──────────────────────────────────────────────────────────────────┤
│ Overview     │                                                                  │
│ Events       │                                                                  │
│ Deadlines  4 │                         page content                              │
│ Changes    2 │                                                                  │
│ Clients      │                                                                  │
│ Suppliers    │                                                                  │
│ Reports      │                                                                  │
│              │                                                                  │
│ ──────────── │                                                                  │
│ Settings     │                                                                  │
│ Demo data ●  │                                                                  │
└──────────────┴──────────────────────────────────────────────────────────────────┘
```

- The sidebar is 224px and collapses to 56px (icons plus tooltips), with the state remembered per user. The counts beside Deadlines and Changes are **items needing my action**, not totals.
- The top bar holds breadcrumbs (all levels clickable), global search, help and the user menu.
- **Command menu (⌘/Ctrl+K):** jump to any record; create an event, upload a contract, raise a change, or record pickup.
- **Keyboard:** `g o/e/d/c` go to a section · `j/k` move through rows · `Enter` open · `/` focus filter · `?` shortcut sheet.
- A demo workspace shows a persistent "Demo data" marker in the sidebar and on exports.

---

## 5. Screens

### 5.1 Overview (landing page)

The page answers three questions in order: *how much is at risk? · where? · what must I do this week?*

```
Overview                                                    As of Sep 23, 06:00 · Recalculate
┌───────────────────────────────────────────────────────────────────────────────────┐
│ Current exposure             Cancellation exposure      Payments due · 30 days    │
│ USD 312,480                  USD 1.94M                  USD 186,000 (7)           │
│ ████████████▓▓▓▓▓▓░░░░        if all live events         3 overdue                 │
│ Agency 118,200 · Client 162,900 · Unassigned 31,380                               │
└───────────────────────────────────────────────────────────────────────────────────┘
Events at risk                                      [Saved view: My events ▾] [Filter]
┌──────────────────────┬──────────┬────────────┬──────────┬──────────┬─────────────────┐
│ Event                │ Client   │ Starts     │ Exposure │ Bearer   │ Next deadline   │
├──────────────────────┼──────────┼────────────┼──────────┼──────────┼─────────────────┤
│ SKO 2027 Lisbon      │ Acme     │ Nov 15     │  84,210  │ ▇▇▇░     │ Cutoff in 11d ● │
│ Partner Summit       │ Northwind│ Oct 29     │  52,000  │ ▇▇▇▇     │ Guarantee 5d  ● │
└──────────────────────┴──────────┴────────────┴──────────┴──────────┴─────────────────┘
Needs your action                               Deadlines · next 14 days
• 2 alerts to decide                           Sep 25  Deposit 2 · Hotel Tivoli   40,000
• 1 change awaiting your approval              Sep 30  Rooming list · Pestana
                                               Oct 3   Tier → 50% · Centro Congressos
```

- The headline band is one panel with three figures, not three cards. Each figure is a link to its breakdown.
- The bearer bar is a single stacked bar (agency / client / unassigned-hatched) with exact figures under it.
- There are no charts beyond that one bar, and it's there because the split is the point.

### 5.2 Events list
- Table columns: Event · Client · Type · Dates · Status · Owner · Contracts (confirmed/total) · Current exposure · Cancellation exposure · Next deadline · Data (Complete / Incomplete).
- Controls: saved views, filter builder (field · operator · value), column picker, sort by any column, row density.
- Bulk actions: change owner, export CSV.
- The primary action is "New event".

### 5.3 Event workspace

```
Events / SKO 2027 Lisbon
SKO 2027 Lisbon                                            [Raise change] [Upload contract] [⋯]
Acme Corp · Nov 15–17, 2027 · Lisbon · Owner J. Mendes · Live · Forecast 420 attendees
[ commitment timeline ─────────────────────────────────────────────────────────── ]
Overview | Contracts (5) | Obligations (23) | Exposure | Changes (3) | Activity
┌─────────────────────────────────────────────┬───────────────────────────────────┐
│ Exposure by contract                        │ Details                           │
│ Hotel Tivoli     Attrition   48,210  Client │ Client agreement  Acme MSA 2026   │
│ Hotel Tivoli     F&B short.  12,000  Split  │ Liability rules   view            │
│ Centro Congressos —              0          │ Team              3 people        │
│ Pestana          Incomplete: pickup missing │ Data completeness 4/5 contracts   │
│                                             │                                   │
│ Open alerts (2)                             │ Recent activity                   │
│ ● Cutoff in 11 days, projected 38 rooms     │ Sep 22 Pickup CSV imported (JM)   │
│   short/night → Decide                      │ Sep 21 CR-012 approved by client  │
└─────────────────────────────────────────────┴───────────────────────────────────┘
```

- The header carries identity, status and primary actions. The timeline is always visible under it.
- Tabs are routed URLs, so they can be linked and the back button works.
- The right column is a fixed-width (320px) attribute and activity rail, in the style of a CRM record page.

### 5.4 Exposure tab and the "working" drawer
- A table, one row per exposure line: Contract · Type · Basis · Projection method · Amount · Bearer split · Status.
- **Clicking any amount opens the working drawer:**
```
Attrition · Hotel Tivoli · Block A                                     [×]
Basis: per night · Commitment 80% · Damages 100% of rate
Projection: current pickup (as of Sep 22 CSV)

Night    Block  Commit  Pickup  Short  Rate     Amount
Nov 14    120     96      71     25    189.00   4,725.00
Nov 15    220    176     140     36    189.00   6,804.00
…
Total                                               48,210.00
Bearer: Client (Acme MSA 2026 · Attrition → Client)
Source: "…Group agrees to utilize at least eighty percent (80%)…" p.4  View in document
```
- **The scenario panel** is a right-hand drawer with an attendance-change slider and number input (−100% to +50%) and a "cancel on" date picker. Results show before → after per line. A permanent "Not saved" label; "Raise change from this scenario" pre-fills a change request.

### 5.5 Contract page and extraction review

Contract page tabs: **Terms** (clauses grouped by type, with confirmation status) · **Document** · **Obligations** · **Versions** · **Activity**.

**Review screen, full width, split view:**
```
Hotel Tivoli — Group agreement v1                     8 of 14 confirmed  [Activate contract]
┌──────────────────────────────────────┬──────────────────────────────────────────────┐
│  PDF viewer (page 4)                 │ Room block · Block A                          │
│                                      │  Commitment %   [ 80 ]      ✓ Confirm  Edit  ✕│
│  …Group agrees to utilize at least   │  "at least eighty percent (80%)" p.4          │
│  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ ←───  │  Basis          [ Per night ▾ ]   ✓  Edit  ✕  │
│  highlighted source                  │  Cutoff         [ Oct 21 2027 17:00 Lisbon ]  │
│                                      │  Nights         4 rows  ▸ expand              │
│                                      │ Cancellation schedule                         │
│                                      │  Tier 1  until Oct 15   25% of contract value │
└──────────────────────────────────────┴──────────────────────────────────────────────┘
```
- Focusing a field scrolls the PDF to its source and highlights it. Unfound sources show "No source text: verify manually".
- Keyboard: `c` confirm · `e` edit · `x` reject · `j/k` next/previous field.
- "Activate contract" is disabled until every field is resolved, and the button's tooltip says how many remain.
- The manual entry form uses the same field layout without the PDF pane (or with the PDF shown for reference when there's no text layer).

### 5.6 Deadlines
- A list grouped by due date (Overdue · Today · This week · Later), filterable by mine/team/all, type, event and status.
- Row: date/time (supplier local time, organisation time on hover) · label · event · contract · amount · owner · status · quick actions (Mark done · Record payment · Snooze with a reason).
- "Subscribe in calendar" opens the ICS URL with copy and regenerate options.

### 5.7 Alerts and decisions
- Alerts appear on the event overview, in "Needs your action", and in the notifications menu.
- **Decide** opens a modal with the decision type (radio), note (required for "Accepted risk"), optional link to a change request, and optional exposure reduction (pre-filled when the decision is a room release on a block).
- The decision is written to Activity and closes the alert.

### 5.8 Change requests

**Editor page:**
```
CR-013 Headcount reduction                         Draft  [Save draft] [Submit for approval]
Type [Headcount change ▾]  Attendance change [ −60 ]  Reason [ Client budget cut … ]
Lines
 Supplier / contract        Description               Cost Δ        Price Δ
 Centro Congressos          Lunch covers −60 × 3d     −10,800.00    −12,420.00  (markup 15%)
 [+ Add line]
┌ Impact ─────────────────────────────────────────────────────────────────────────┐
│ Price −12,420 · Cost −10,800 · Margin 13.0% → 12.8%                             │
│ Exposure before → after                                                         │
│   Hotel Tivoli attrition      48,210 → 71,550   +23,340  Client                 │
│   Centro F&B shortfall             0 →  6,200    +6,200  Split 50/50            │
│ ⚠ Cutoff for Hotel Tivoli is in 11 days. Release rooms before approving?        │
│ Needs internal approval: margin below 14% floor                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```
- The impact panel stays visible (sticky) while editing on desktop.
- The status stepper at the top shows Draft → Internal review → Sent to client → Decision → Applied. It's a sequence, so numbering and steps are justified here.
- Internal approvers see Approve / Send back (with a required comment).

### 5.9 Client approval page (external)
- No app navigation. The agency's logo and name are at the top, then one decision.
```
[Agency logo]                                  Change request CR-013 · SKO 2027 Lisbon
Headcount reduction
Requested by J. Mendes on Sep 23

What changes                      Price change
Lunch covers −60 × 3 days         −USD 12,420.00

Effect on existing commitments
Projected hotel attrition charge rises by USD 23,340 (your responsibility under the MSA).

Your name [            ]  Comment (optional) [            ]
[Approve change]   [Reject change]
This link can be used once and expires Oct 7.
```
- It must work on a phone. The buttons sit side by side on desktop and stack at full width on mobile.
- After the decision, the page shows a confirmation ("Change approved. J. Mendes has been notified.") and later visits show the outcome read-only.

### 5.10 Clients, Suppliers, Reports
- **Client page:** attributes; agreements list; **liability matrix editor** (a grid of categories × bearer, with a % input for Split); events; exposure by bearer.
- **Supplier page:** attributes; contracts; events; penalty history (expected vs actual).
- **Reports:** each is a filterable table with CSV export. "Expected vs actual penalties" adds the one justified chart: paired bars per event (projected at T-30 vs actual charged).

### 5.11 Settings
- A left sub-navigation matching spec §15.
- **Branding shows a live preview** of the sidebar, a primary button and the approval page header.
- Brand colour input checks contrast and blocks save with an explanation if it's below 4.5:1.
- **Integrations** shows one row per integration, with status (Connected · Not configured · Error, with the last error message) and what depends on it.

---

## 6. Forms and validation
- Labels sit above fields, with helper text below. Required fields are marked "Required" rather than with an asterisk alone.
- Validation runs on blur and on submit. The error appears under the field, and on submit an error summary at the top links to each field.
- Money fields take the currency from context, accept pasted amounts ("€48.200,00" is parsed using the organisation locale), and display grouped digits.
- Dates use a picker plus typed input. Supplier-local times show their timezone abbreviation.
- Destructive actions (delete contract, withdraw change, reject all proposed clauses) use a confirm dialog that names the object: "Delete contract 'Hotel Tivoli v1'? Its 9 obligations will be removed." The confirm button says exactly what it does.

---

## 7. States

| State | Treatment |
|---|---|
| **Empty (first run)** | Overview shows three steps to first value: *Add a client and their liability rules → Create an event → Upload a contract.* Each is a link, and completed steps are checked off. The steps are a sequence, so numbering is justified |
| **Empty (filtered)** | "No events match these filters." Clear filters |
| **Empty (tab)** | Contracts tab: "No contracts yet. Upload a PDF, or enter terms manually." with both actions |
| **Loading** | Skeleton rows matching the table's real column widths. Figures show a fixed-width placeholder so the layout doesn't shift |
| **Extraction running** | A progress row on the contract: "Reading terms from 12 pages…" You can leave the page and are notified when it's ready |
| **Incomplete data** | A hatched-outline badge "Incomplete" plus a list of missing inputs, each a link to where it's fixed |
| **Error (page)** | What failed and what to do: "Couldn't load this event. Check your connection and retry." Retry button, plus the correlation ID in small text for support |
| **Success** | Toasts that repeat the action's name ("Change approved", "Contract activated"), with Undo where the action can be reversed |
| **Permission** | Actions you can't take are hidden. Pages you can't view show an access message naming who can grant access |
| **Stale** | If exposure inputs changed since the last calculation: "Figures updated 3 min ago · Recalculate" |

---

## 8. Responsive behaviour

| Breakpoint | Behaviour |
|---|---|
| ≥ 1280 | Full layout. The event workspace right rail is visible |
| 1024–1279 | The right rail becomes a "Details" drawer. Tables keep their priority columns and hide the rest behind the column picker |
| 768–1023 | The sidebar collapses to icons. The review split view stacks (fields on top, "Show source" opens the PDF in a drawer) |
| < 768 | Bottom navigation (Overview · Deadlines · Changes · Search). Tables become stacked rows (primary field, figure, status). Overview, Deadlines, alerts, decisions and the client approval page are fully usable. Contract review and settings show "Best on a larger screen" but are still reachable |

There is no horizontal page scroll. Wide tables scroll inside their own container, with the first column pinned.

---

## 9. Onboarding (admin, first deployment)
1. Organisation: name, base currency, timezone.
2. Branding: logo, colour (contrast-checked), product name.
3. Terminology: choose the labels your team uses.
4. Defaults: reminder offsets, exposure threshold, approval limits.
5. Invite teammates and assign roles.
6. Optional: enable term extraction and email. Each step can be skipped, and Settings shows what's still off.

A demo workspace can be loaded or cleared from Settings. Its data is always labelled.

---

## 10. Accessibility checklist
- Every interactive element is reachable by keyboard, with a visible 2px `brand` focus ring (offset 2px).
- Colour is never the only signal: statuses pair a glyph with text; the unassigned bearer uses hatching; risk figures carry a text label on the timeline.
- The timeline has a table alternative, and its marks are labelled for screen readers.
- Contrast is at least 4.5:1 for text and 3:1 for UI boundaries.
- Live regions announce toasts and recalculation results.
- Motion respects `prefers-reduced-motion`.

---

## 11. Copy rules for this product
- Say what things are: "Current exposure", "Cancellation exposure", "Payments due". Never "Insights" or "Smart alerts".
- Actions keep the same name through the whole flow: "Activate contract" → "Contract activated". "Raise change" → "Change raised".
- AI is named by what it does: "Read terms from document". Its output is always called "proposed" until someone confirms it.
- Numbers always carry their basis: "Projected (current pickup)", "As of Sep 22".
- Errors say what happened and what to do next, and they don't apologise.
