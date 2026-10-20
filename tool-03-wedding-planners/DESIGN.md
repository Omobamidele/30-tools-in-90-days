# Design: Wedding Enquiry Tracker (rev 5)

Modelled on **HoneyBook** (the tool wedding planners already use), not on a component library's defaults. The tokens below were sampled from real HoneyBook screenshots published in HoneyBook's help centre ([Customize your pipeline](https://help.honeybook.com/en/articles/2463528-customize-your-pipeline-in-honeybook), [Navigate, sort and filter projects](https://help.honeybook.com/en/articles/5758575-navigate-sort-by-and-filter-projects-in-your-pipeline)). The images are third-party, so they are kept outside the repo. The full values are in [`design.json`](design.json).

## What we took from HoneyBook
- **Dark navigation rail** (#131416) with light text, a lighter active row (#2b2c2d), and a rule between the work views and settings. There are no ALL-CAPS group labels.
- **Light grey canvas** (#f6f7f8) with the search as a grey pill in the top-left corner, not a white top bar.
- **Big bold page title** on the left, actions on the right, and **underlined view tabs** under it (HoneyBook's "Main view | Opportunities").
- **Flat white surfaces** with a hairline edge and **no card shadows**. The only shadow is on overlays.
- **Small radii**: 4px on controls, about 8px on panels, and full pills for search and status.
- **Geometric sans**: HoneyBook uses Proxima Nova, so we use **Figtree**, the closest free geometric sans. We don't use Inter or Geist.

## Brand (Mo Bamidele)
Purple **#5423e7** appears in exactly three places:
- the logo mark
- the primary button (one per screen)
- the 3px active-nav indicator in the rail

Yellow #ffc233 is not used. Everything else is neutral grey. There are no gradients, glows, tinted areas or purple-tinted selection.

## Tokens
| Role | Token | Value |
|---|---|---|
| Headings, rail | ink | #131416 |
| Body text | fg | #2e3036 |
| Secondary text | muted | #646875 (5.2:1 on canvas, 5.6:1 on white) |
| Icons and placeholders only | faint | #9a9ea8 |
| Hairlines | line | #e3e5e8 |
| Control borders | line-strong | #cdd0d6 |
| Page | canvas | #f6f7f8 |
| Hover, pills, search | sunken | #eceef0 |
| Panels, sheet | surface | #ffffff |
| Accent | brand | #5423e7 |
| Late / due / done (text) | danger / warn / ok | #b42335 / #8a5100 / #17704a |

- **Type** (Figtree):
  - title 28/36 bold
  - sheet title 20/28 bold
  - section 16/24 semibold
  - body and table 14/20
  - meta 13/20
  - table headers 13px medium muted, in sentence case
- **Spacing**: 4, 8, 12, 16, 20, 24, 32 and 40px.
- **Radius**: control 4px, panel 8px, pill 999px, sheet 0.
- **Shadow**: one token (`overlay`), used on dialogs, the sheet and toasts only.
- **Icons**: Phosphor, regular weight, bold for the active nav item. We don't use Lucide.
- **Motion**: only the record sheet slides in (160ms). There are no fade-ups and no hover lifts.

Tailwind's default palette, radii and shadows are switched off in `app/globals.css` (`--color-*: initial` and so on), so a class like `bg-indigo-500` or `shadow-sm` does nothing. Only the tokens above exist.

## Patterns
- **One panel per screen** holds the main list. Secondary information sits on the canvas, separated by spacing and rules. Examples are Today's "Next 14 days" list, the month summary sentence, and every section of House rules.
- **Status** uses one neutral pill with a small dot. Colour means urgency only: red for late, amber for due, green for done. The "first reply" column is plain text, and it's red only when it's overdue.
- **Tables** have:
  - a white header in sentence case
  - 56px rows
  - sort carets, with sort and page kept in the URL
  - "Showing 1–8 of 8"
  - row click opens the record
- **Record** opens in a right sheet with its URL (`?open=e02`). It has a sticky action bar with the primary button on the right. Esc closes it and focus returns.
- **Feedback**: every action shows a dark toast in the bottom-right that repeats the button's verb ("Mark reply as sent" shows "Reply marked as sent").
- **Copy**: plain verbs in sentence case. There are no em dashes, middle-dot meta strings, arrows on buttons or hype words.

## Ban list (checked by `e2e/tells.spec.ts`)
- purple, blue or indigo gradients, and gradient text
- glows, glass and backdrop blur
- emoji and ✨
- ALL-CAPS eyebrow labels
- KPI card grids
- coloured left borders on cards
- fade-up entrance animations or hover lifts
- "→" on buttons
- em dashes or hype words ("seamless", "supercharge", "transform", "elevate", "unlock", "effortless")
- Inter, Geist or Lucide
- any shadow on a static panel
- a pointer cursor on anything that isn't clickable
- placeholder copy
- a "Demo data" pill in the main view (that note lives in House rules)
