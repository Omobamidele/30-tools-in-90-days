# Phase 4 — UX / UI design: Expansion Signal Desk

The visual system is in [09-design-system.md](09-design-system.md) ("Signal room"). This document covers structure and behaviour.

## 1. Navigation

- **Top bar (ink):**
  - product mark and org name
  - modules: **Overview · Signals · CSQLs · Accounts · Results**, plus **More ▾** (Rules, Settings) for RevOps and Admin
  - right side: search (Ctrl K), notifications, avatar
- **Icon rail:** the same modules, for narrow screens and quick switching. Active item: a chartreuse bar plus Phosphor fill.
- **Phone (<768px):** the rail becomes a bottom bar (Overview, Signals, CSQLs, Accounts, More). Sheets go full-screen.
- **Breadcrumbs** on detail pages: `Accounts › Brightwater Logistics`, `CSQLs › CSQL-0142`.
- **Terminology from config:** labels like "CSQL" come from the organisation config, so a tenant can say "Expansion lead".

## 2. Page hierarchy and primary screens

### Overview (`/`)
1. **Answer sentence** (display type):
   > "This quarter, signals created **$412k** of expansion pipeline; **$138k** has been won."

   With no data yet: "No signals have turned into pipeline yet this quarter."
2. **Three figures in one line,** not tiles:
   - **Waiting for triage:** 14 · $212k est.
   - **Waiting for sellers:** 5
   - **Won this quarter:** $138k
3. **My work**, by role:
   - **CSM:** my top signals, as cards with a trace and Accept/Dismiss
   - **Seller:** CSQLs waiting for me, with their deadlines
   - **Leaders:** a "Needs reassigning" panel (overdue + 2 business days)
4. **Recent outcomes:** the last five CSQLs won or lost, each as a sentence.
5. **Footer:** data freshness ("Usage updated 06:00 today · 212 accounts"), and the simulated-data notice when it applies.

### Signals (`/signals`)
- **Board** (default for CSMs):

  | New | Snoozed | Accepted (7d) | Dismissed (7d) |
  |---|---|---|---|
  | count + estimated value | count + estimated value | count + estimated value | count + estimated value |
- **List:** columns are priority, account, rule tag, explanation, est. value, trace, age, triage deadline, CSM.
- **Filters** (chips with counts, kept in the URL): rule type, CSM (default "Mine"), value band, deadline (overdue / due soon), segment. Free-text search on account name.
- **Bulk action:** dismiss selected with one reason, for noise such as a contractor-heavy account.
- **Clicking a card opens the triage sheet.**

### Triage sheet (on Signals; also the full page `/signals/[id]`)
- **Header:** account, rule tag, priority, and "Detected 2 days ago · due tomorrow".
- **Explanation sentence**, plus a large trace with axes and a threshold label.
- **Estimated value with its working** ("3 seats needed × $1,200 = $3,600 ARR"), or "Not estimated" with the reason.
- **Priority breakdown:** value band + rule weight + modifiers, as plain-English lines.
- **Account context:**
  - plan, ARR, renewal date (and "renewal in 84 days" when that boosts priority)
  - CSM and owner
  - other open signals
  - open CSQL (if any)
  - support escalation flag
- **Actions:**
  - **Accept → CSQL:** handoff note (required), contact picker, adjusted value (optional), "Route to: Dana Reyes (account owner)" preview, and "Add to open CSQL-0139" when one exists.
  - **Dismiss:** reason select (required) plus note. Shows "Won't fire again for 30 days unless the value grows 25%".
  - **Snooze:** date picker, with presets of 2 weeks, next month and start of next quarter.
- **Disabled actions explain themselves:** e.g. "Only the account's CSM or a CS leader can triage."

### CSQLs (`/csqls`)
- **Board:**

  | Routed | Accepted | Opportunity | Won | Lost / no opp |
  |---|---|---|---|---|
  | count + value | count + value | count + value | count + value | count |
- **Cards:** number (mono), account, value, owner avatar, deadline dot.
- **List** with the same filters (owner, CSM, rule type, stage, overdue).
- **CSQL detail:**
  - **left:** the handoff note (quoted, with the CSM's name), the evidence signals and their traces, a timeline
  - **right:** state actions (Accept, Return, Record opportunity, Mark won/lost, Close no opp, Reassign), with the opportunity fields
- **Actions follow the state machine,** so only valid next steps appear.

### Accounts (`/accounts`, `/accounts/[id]`)
- **List:**
  - columns: account, segment, ARR, seats used/purchased (mini bar), credits pace, renewal date, CSM, owner, open signals
  - filters: CSM, owner, segment, "has open signal", "stale data"
- **Detail:**
  - **header:** name, segment, plan, ARR, and the data-freshness line
  - **usage panel:** seats, credits pace and workspaces, each with a 90-day trace and its threshold
  - **subscription:** term, add-ons owned (and not owned)
  - **contacts:** with seniority and first seen
  - **signals and CSQLs** history
  - **notes and timeline**

### Results (`/results`)
- **Period switch** (quarter / year / all time) and a CSV export.
- **Answer sentence,** then:
  - **funnel:** signals raised → accepted → CSQLs → opportunities → won, with counts and values, as a horizontal stepped bar (the only chart)
  - **by rule type:** a table of conversion at each step and median value estimated vs recorded
  - **by CSM** (sourced) and **by seller** (worked): counts and won ARR, using the CS and sales attribution colours
  - **dismissal reasons:** a ranked list with counts
  - **response times:** median time to triage and to seller acceptance; % on time
- **Footnote:** "Only recorded outcomes count. Estimated values are shown separately and never added to won revenue."

### Rules (`/rules`, RevOps)
- **List:** name, type, on/off, version, and the 90-day funnel inline (raised · accepted · won).
- **Editor:**
  - parameters, with plain-English help ("Fire when active seats are at least **90%** of purchased for **14** days")
  - minimum ARR, segments, cooldown, weight
  - **live preview:** "With these settings, 12 accounts would have a signal today", listing the first ten
  - **Save** asks for a change note and creates a new version
- **History:** the list of versions with their notes.

### Settings (`/settings/*`)
Sections:
- **Branding and terminology:** live preview of the top bar.
- **Price book:** seats, credit tiers, overage, add-ons.
- **Routing:** segments → team or person, round-robin members, fallback.
- **Deadlines:** windows, business days, holidays.
- **Dismissal reasons**
- **Data feeds:**
  - ingest keys (create shows the key once, rotate, revoke)
  - last ingest, rows accepted or rejected, rejection reasons
- **CRM:**
  - inbound key
  - webhook endpoints: add, test-send, delivery log with status codes and retry
- **Imports:** CSV with column mapping and a preview.
- **Users and roles**

## 3. Forms and validation
- Labels sit above fields. Required fields are marked "Required" in text, not just with `*`.
- Errors appear inline under the field, plus a summary at the top on submit with links to each field.
- **Money input:** accepts `7,200` or `7200.00`, and shows the formatted result.
- **Destructive actions** (revoke key, delete rule) need typed confirmation. Turning a rule off needs a reason.

## 4. Empty, loading and error states
- **Empty states say what fills the screen and how:**
  - **Signals:** "No new signals. Signals appear when usage crosses a rule's threshold. Usage last updated 06:00 today."
  - **Accounts with no data:** "Import accounts from your CRM (CSV) or push usage to the ingest API." Links to both, for RevOps.
  - **Results with no outcomes:** "Nothing recorded this quarter yet. Won and lost CSQLs appear here when sellers record the outcome."
- **Loading:** skeletons shaped like the real content (card outlines with trace placeholders). No spinners on pages.
- **Errors:**
  - an error boundary with a short reference code
  - action errors show the message near the button
  - optimistic-lock conflicts name who changed what ("Dana accepted this at 10:14; refresh to see it")
- **Stale data:** a watch-coloured line on the account and signal ("Usage is 4 days old; no new signals until it updates").

## 5. Onboarding
- **First sign-in for RevOps or Admin:** a setup checklist on the Overview.
  1. Import accounts.
  2. Create an ingest key.
  3. Send usage (curl example).
  4. Review rules.
  5. Set routing.

  Each step ticks itself off from real state.
- **A CSM's first visit:** a one-line hint above the queue: "Accept sends it to a seller with your note. Dismiss teaches the rule what isn't worth it."

## 6. Responsive behaviour
- **≥1280px:** rail + content; the triage sheet docks right (480px).
- **768–1279px:** the rail collapses to icons; the sheet overlays.
- **<768px:**
  - bottom navigation
  - boards become swipeable columns with a column picker
  - tables become stacked rows (account + value + deadline)
  - sheets are full-screen

  Triage must be completable one-handed: the accept and dismiss buttons sit at the bottom of the sheet.

## 7. Keyboard
- Ctrl K opens the command menu (accounts, signals, CSQLs, pages).
- In the queue: J/K to move, **Enter** opens, **A** accept, **D** dismiss, **S** snooze (shown in a hint row; works only when focus is inside the queue).
- Boards: cards are focusable. Stage moves happen only through explicit actions in the sheet, never by drag. A drag that skipped validation would break the state machine.
