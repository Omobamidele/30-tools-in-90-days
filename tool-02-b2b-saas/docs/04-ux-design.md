# Phase 4 — UX / UI design: True-up Desk

The visual system is in [09-design-system.md](09-design-system.md) (revision 6, shadcn/ui kit). This doc covers structure and behaviour.

## 1. Navigation
**Collapsible left sidebar** (shadcn `Sidebar`; collapses to icons, becomes a drawer on phones):
- **Header:** workspace (org logo mark, org name, product name).
- **Work:** Overview, Exceptions (open count badge), Accounts, Invoices.
- **Insight:** Ledger.
- **Admin** (ADMIN/REVOPS only): Rules, Settings.
- **Footer:** the user menu (name, role, Your account, Sign out).

**Inset header bar:**
- sidebar toggle, breadcrumbs
- **⌘K command search** (jump to an account or exception, or run "Reconcile this month")
- notifications

## 2. Page hierarchy and primary workflows
| Page | Purpose | Primary action |
|---|---|---|
| **Overview** | This month's close, plus what needs me | "Review exceptions" |
| **Exceptions** | The work queue: a data table with filters | Open one (a sheet); bulk "Assign to me" |
| **Exception** (`/exceptions/[id]`) | Contract vs usage vs invoice, then decide | Propose / Approve / Record / Send to CS / Dismiss |
| **Accounts** | Every customer with a contract | Open account |
| **Account** | Contract terms, month-by-month reconciliation, invoices, usage | Open a month's exception |
| **Invoices** | What billing sent us, matched or not | Import CSV |
| **Ledger** | Recorded recoveries and credits | Export CSV |
| **Rules** | Tolerances and thresholds per exception type | Preview, then save a version |
| **Settings** | Feeds and keys, imports, people, webhooks | — |

**Main flow:**
1. Overview, then Exceptions (filtered to me, open).
2. A row opens the **sheet**: summary, the gap, quick actions.
3. "Open full record" for detail.
4. **Propose adjustment** (a dialog: amount pre-filled with the gap, memo). It is auto-approved when within my limit.
5. Later, **Record** (a dialog: invoice or credit-note reference). It appears in the Ledger.

## 3. Tables (shadcn data table)
- **Toolbar:**
  - a search input
  - faceted filter buttons (Type, Status, Owner, Month) showing their selected values as badges
  - a "Reset" link
  - a column-visibility menu
- **Columns:** a select checkbox; Account (link); Type (badge); Gap (amount in words-aligned text, left-aligned, not a ticker column); Status (badge); Owner; Due.
- Pagination at 25 rows, with "n of N selected".
- Row click opens the sheet. Keyboard: Enter opens it, Esc closes it.

## 4. Detail views
**Exception record:**
- **Header:** account name, type badge, status badge, due.
- **Card "What we compared":** three columns (Contract, Usage, Invoiced), then a "Gap" row with the explanation sentence and the working lines.
- **Card "Decide":** the actions allowed for my role and the state.
- **Tabs:** Details, Activity (the timeline).
- **Sidebar card:** account, CSM, billing owner, contract term.

## 5. Overview
1. **"October close" card:**
   - a checklist of steps with a progress bar: usage feed fresh, invoices received (34 of 36), reconciliation run (date), exceptions decided (18 of 24)
   - button: "Run reconciliation" (RevOps, Admin)
2. **"Needs you" card:** a compact table of my open exceptions.
3. **"Recently recorded" card:** sentences ("Billed $2,400 of unbilled overage to Bluefin, recorded by Dana, 2 days ago").

There are no KPI tiles (CLAUDE.md locked rule).

## 6. Forms
- shadcn inputs and labels; native `<select>` for reason lists, for accessibility and testing.
- Server-side validation shown inline, plus a summary alert.
- Dialogs for decisions; a toast confirms ("Adjustment recorded").

## 7. States
- **Empty:** an icon, a sentence and the next action (e.g. "No invoices yet. Connect the invoice feed or import a CSV").
- **Loading:** skeletons with `role="status"` and `aria-busy`.
- **Error:** an alert with a reference.
- **Stale feed:** a warning badge on Overview and the account.

## 8. Responsive
- **Under 1024px:** the sidebar becomes an off-canvas drawer behind a header button.
- **Tables under 768px:** become stacked rows (account, type, gap, status).
- **Dialogs** become full-height sheets on phones.
