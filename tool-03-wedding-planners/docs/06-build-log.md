# Phase 6 — Build Log

## Milestones

**20 Oct 2026 · M1: folder, rules and data.** Renamed `tool-03` to `tool-03-wedding-planners`. Moved the prototype's sales rules (first reply, day 3/day 7 nudges, day 14 referral ask) out of `index.html` into `src/rules.js` and `config/rules.json`, and added the capacity rule (2 weddings a date, same venue blocked, open quotes warned). Sample data rebuilt as JSON; the 28 compact "earlier" enquiries from the prototype got fictional names so every one is a real record.
- Run: the Today queue for the sample clock gives Grace, Maya, Amelia, Freya, Ruby, Lucy, Aisha.
- Checked: the month summary reproduces the numbers in the LinkedIn draft (40 enquiries, median first reply 40 min, 12 over 2 hours or no reply, 3 of 5 bookings from referrals).

**20 Oct 2026 · M2: the app.** Today, Enquiries (table, tabs, channel filter, search), detail panel, add-enquiry form, Quote follow-ups, Referrals and reviews, House rules.
- Dropped from the prototype: wedding boards, vendor change, payments and final week. They are ops, not this GTM job.
- Issues found and fixed: the couple column wrapped to three lines (added minimum widths); the favicon 404 showed as a console error (inline empty icon); the duplicate test double-counted rows.

**20 Oct 2026 · M3: tests.** 50 rule tests, 6 data tests, 10 browser tests (Chrome via playwright-core). All 60 pass.

## Testing checklist (brief §14)
- [x] Happy paths: reply, quote, both nudges, booked; thank-you logged
- [x] Incorrect inputs: future arrival, past date, invalid date, 0 / fractional / negative guests, negative budget, unknown channel
- [x] Missing information: no names, no arrival time; optional fields empty
- [x] Duplicate records: names reversed, same phone with different spacing; "Add anyway" path
- [ ] Permissions: n/a (single user, no roles)
- [x] Edge cases: exactly on the reply target, day 7 waiting on day 3, gone-quiet boundary, venue clash with a planner free, quoting or booking a full date blocked
- [ ] Failed integrations: n/a (no integrations)
- [x] Empty datasets
- [x] Large datasets: 2,000 enquiries through the queue under 500 ms
- [x] Mobile / responsive: no sideways scroll at 390 px on every screen
- [x] Navigation, keyboard (`/`, Escape)
- [x] Forms: inline errors, live date check
- [x] Automation: queue order, booked date held for the next enquiry
- [x] Data persistence: survives reload
- [ ] Authentication / authorization: n/a in this MVP

## Product polish pass (brief §15)
Done once on screenshots of every screen: no KPI strip, no charts, no money as the hero; plain labels; one primary action per row. Not done: a full WCAG contrast audit with a tool (colours were picked for AA but not machine-checked).

## Final quality gate (brief §20)
- [x] Engineering: functional, tested
- [x] Product: workflow is one clear loop
- [x] White-label: one config file
- [x] Teaching: playbook written
- [ ] Business / Differentiation: **not proven.** HoneyBook and Aisle Planner cover much of this. Needs planner conversations (L2).
- [ ] Commercial: low ability to pay; mainly a teaching and audience tool
