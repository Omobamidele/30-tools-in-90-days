# Phase 4 — UX / UI Design

## Navigation
Left nav: Today · Enquiries · Quote follow-ups · Referrals and reviews · House rules. Counts show only where something is waiting. The house rules are summarised under the nav so the planner always sees the rules the system is applying. At phone width the nav becomes a scrolling row.

## Page hierarchy and primary workflow
Today is the home page: three short groups (Reply first, Follow up on quotes, Thank past couples), each row a couple, the reason in plain words, and one button. Clicking opens the enquiry panel on the right, with the draft message ready.

## Tables, filters, detail views
Enquiries is the only table: couple, wedding (with the date check under it), first reply, status, next step. Tabs: Open, Needs a reply, Booked, Lost or quiet, All; plus a channel filter and global search (`/` focuses it). The detail panel holds the facts, the date check, follow-up steps, the draft, actions and history.

## Dashboards
None. One sentence of this month's numbers sits under the Today heading. The page leads with people, not figures (repo locked rule).

## Forms
Add enquiry: names, channel, arrival time, contact, referred by, date, venue (suggests known venues), guests, budget, note. The date check runs as soon as the date or venue changes. Duplicate warning offers "Open it" or "Add anyway".

## Empty, loading and error states
"All clear here" per Today group · "No enquiries match" with the search term · "No quotes out" · a loading line · a plain error if the data files can't load.

## Responsive and accessibility
Table rows become stacked cards under 760px; the panel becomes an overlay under 1100px. Visible focus rings, labelled fields, buttons for every action, `aria-current` on the nav, Escape closes the panel.

## Visual system
See [09-design-system.md](09-design-system.md).
