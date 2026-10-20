# Design system · Wedding Enquiry Tracker (rev 2, 20 Oct 2026)

Rev 1 was rejected as looking vibe-coded: coloured initial avatars on every row, rounded pills in every cell, card stacks, a "Good morning" header and a row of numbers. Rev 2 follows the Field Lab guide `linkedin-content/field-lab-2026-10-20/anti-vibe-coded-ui.md` (it's outside this repo).

## Patterns taken from real products
- **Attio:** table views as the main object, view tabs, a toolbar with filters, and a record preview panel that keeps the table in view.
- **Linear:** a quiet neutral sidebar with line icons and grey counts, less chrome, more density, contrast set on purpose.
- **Stripe:** colour on a predictable contrast scale, and colour never the only signal (every status is a dot plus a word).
- **HoneyBook:** the pipeline language planners already use (inquiry, follow-up, booked).

## Tokens (`src/styles.css` `:root`)
- Neutrals: page `#fff`, sidebar `#f7f7f6`, hover `#f3f3f2`, hairline `#e7e7e5`, ink `#1d1f22` / `#53575e` / `#7b7f86`.
- One accent, from config (`brandColor`, default `#2f5d50`). Used only for the primary button, the workspace mark, the selected row tint and focus rings.
- Status colours: red (late), amber (due), green (done), blue (new), grey (closed). Shown as a 7px dot; only overdue text turns red.
- Type: IBM Plex Sans (system sans as the fallback), 13px body, 12px meta, 14–16px titles, weights 400/500/600, tabular numbers, sentence case.
- Radius: 4px controls, 6px dialogs, 0 for table rows. Hairline borders, with shadows only on the dialog and the floating panel.
- Rows are 38px, headers 32px and the top bar 48px.

## Rules (checked by `tests/e2e.test.js` "design system guardrails")
No gradients, no emoji, no radius over 6px on boxes. No KPI tiles or charts: numbers live in columns, view-tab counts and one sentence under Today.
