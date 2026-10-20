# Design system · Wedding Enquiry Tracker (rev 2, 20 Oct 2026)

Rev 1 was rejected as looking vibe-coded: coloured initial avatars on every row, rounded pills in every cell, card stacks, a "Good morning" header and a row of numbers. Rev 2 follows the Field Lab guide `linkedin-content/field-lab-2026-10-20/anti-vibe-coded-ui.md` (it's outside this repo).

## Patterns taken from real products
- **Attio:** table views as the main object, view tabs, a toolbar with filters, and a record preview panel that keeps the table in view.
- **Linear:** a quiet neutral sidebar with line icons and grey counts, less chrome, more density, contrast set on purpose.
- **Stripe:** colour on a predictable contrast scale, and colour never the only signal (every status is a dot plus a word).
- **HoneyBook:** the pipeline language planners already use (inquiry, follow-up, booked).

## Tokens (`src/styles.css` `:root`)
- Neutrals (Mo Bamidele brand lock): page `#fff`, sidebar `#f7f7f5`, hover/selected `#f4f4f2`, hairline `#e4e6ea`, ink `#0f1222`, greys `#5b6070` / `#6b7080`.
- One accent, from config (`brandColor`, `#5423e7`). Used only as a line: the active view tab, the 2px bar on the selected row, focus rings and link hover. Never a fill, never a gradient (a browser test checks this). Primary buttons are near-black `#0f1222`.
- Status marks have different shapes, not just colours: hollow ring (New), half-filled ring (Replied, Asked), solid grey (Quote sent), green (Booked), red/amber dots for time pressure.
- Status colours: red (late), amber (due), green (done), blue (new), grey (closed). Shown as a 7px dot; only overdue text turns red.
- Type: Inter (system sans as the fallback), tracked -0.006em for body and -0.012 to -0.016em for titles, 13px body, 12px meta, 14–16px titles, weights 400/500/600, tabular numbers, sentence case.
- Radius: 4px controls, 6px dialogs, 0 for table rows. Hairline borders, with shadows only on the dialog and the floating panel.
- Rows are 38px, headers 32px and the top bar 48px.

## Rules (checked by `tests/e2e.test.js` "design system guardrails")
No gradients, no emoji, no radius over 6px on boxes. No KPI tiles or charts: numbers live in columns, view-tab counts and one sentence under Today.

## Rev 3 (20 Oct 2026)
Brand colours and Inter; uneven, specific sample data; planner column; weddings in the next 14 days on Today; no sidebar clock; row buttons are secondary; see `11-vibe-coded-audit.md` for every tell found and fixed.
