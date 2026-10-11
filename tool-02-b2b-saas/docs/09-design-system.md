# 09 — Design system (DESIGN.md)

> **Current: Revision 5, "HubSpot-style CRM" (2026-10-11), at the end of this file.** Earlier revisions are kept as history.

Chosen by the user on 2026-10-07, from three directions: **Signal room** (selected), workplace photography, and editorial/financial paper. Written **before any screen**. If a screen needs something this file doesn't cover, add it here first.

## Idea

A revenue team's control desk. Tool 01 sold itself with venue photography. This product's subject *is* data: seat counts, usage pace, thresholds crossed. So **the data is the image.**
- The chrome is deep ink-teal.
- One "signal" chartreuse marks only things that are live: a new signal, a crossed threshold, the active nav item.
- Every signal carries a small **signal trace**: the metric over 30 days against its threshold line. It explains the signal at a glance, and it's the product's visual signature.

**Avoiding the AI-default look (lessons from Tool 01, docs/09 there):**

| Default | Replacement |
|---|---|
| Inter | Space Grotesk (display, UI), JetBrains Mono (figures, IDs, evidence) |
| Lucide | Phosphor (regular weight; fill only for the active state) |
| Blue or purple accent | Ink-teal chrome, chartreuse used only for live markers |
| Symmetric KPI card grid | An answer sentence, then a queue. Figures sit inline, not as tiles |
| Decorative charts | One chart type, the signal trace, and only where it explains a signal |
| Glass, blobs, gradients | Opaque panels on a faint 24px grid canvas |

## Palette

Contrast was computed with the WCAG relative-luminance formula (script in the build log).

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--ink` | `#0F2B2E` | Top bar, rail, sign-in panel, hero band | white on ink 14.9:1 |
| `--ink-2` | `#163B3F` | Hover and active on ink | — |
| `--on-ink-muted` | `#A9BDBA` | Secondary text on ink | 7.6:1 |
| `--signal` | `#C8F03C` | **Live markers only:** new-signal dot, threshold-crossed segment, active nav bar, focus ring on ink | 11.4:1 on ink; ink text on signal 11.4:1. **Never text on white** |
| `--signal-ink` | `#4A6600` | Signal-coloured text or icon on light surfaces | 6.6:1 white, 6.0:1 canvas |
| `--canvas` | `#F3F5F3` | Page background, with a 24px grid at 4% ink | — |
| `--surface` | `#FFFFFF` | Panels, tables, sheets | — |
| `--sunken` | `#E8EDEB` | Board columns, inset areas | — |
| `--text` | `#10201F` | Body | 16.8:1 |
| `--muted` | `#485957` | Secondary | 7.4:1 white, 6.2:1 sunken |
| `--faint` | `#5A6967` | Captions | 5.8:1 white, 4.9:1 sunken |
| `--rule` / `--rule-strong` | `#DDE3E1` / `#C3CCC9` | Dividers (decorative, no 3:1 needed) | — |
| `--field` | `#7A8B88` | Form-field borders (UI component, ≥3:1) | 3.6:1 |
| `--brand` (config `primaryColor`) | `#0D6B6B` | Primary buttons, links, selected tab | white text 6.3:1; the white-label check needs ≥4.5:1 |
| `--accent` (config `accentColor`) | `#C8F03C` | = `--signal`; white-label colour for live markers on ink | needs ≥3:1 on ink |
| `--risk` | `#B42318` | Overdue, errors | 6.6:1 |
| `--watch` | `#A15C07` | Due soon | 5.2:1 |
| `--won` | `#157347` | Won, accepted | 5.9:1 |
| `--by-cs` / `--by-sales` | `#6B46C1` / `#1D5FA6` | Attribution: CS-sourced vs seller work, in Results only | 6.4:1 / 6.5:1 |

**Rules**
- **Chartreuse is scarce.** At most one live marker per row, and it only ever means "new, live, or over the line".
- **Links are underlined** (teal on body text is 2.67:1, under 3:1).
- **Status colours** appear as a dot plus a word, never as a card background.
- **Dark mode is not offered.** This is a daily work tool on light surfaces; the ink chrome supplies the contrast.

## Type

| Role | Family | Size / weight | Where |
|---|---|---|---|
| Display | Space Grotesk | 28–32 / 500, tracking −1% | Page titles, the overview answer sentence |
| Heading | Space Grotesk | 15–16 / 600 | Panel titles |
| UI / body | Space Grotesk | 14 / 400–500 (13 in dense tables) | Everything else |
| Figure | JetBrains Mono | 20–28 / 500 | Money and counts in headers |
| Data | JetBrains Mono | 12–13 / 400 | Evidence values, IDs (CSQL-0142), dates in tables |
| Caption | Space Grotesk | 12 / 500 | Metadata |

- Sentence case everywhere. Labels never use all caps, except the 11px tracking-wide **rule-type tag** (`SEAT PRESSURE`), which reads as a code.
- Money follows Tool 01's lesson:
  - summary screens use rounded amounts (`$212k`), exact on hover and for screen readers
  - detail screens show exact amounts
  - no %-change chips or arrows

## Spacing, radius, elevation
- **Rhythm:** 4 / 8 / 12 / 16 / 24 / 40.
- **Radius:**
  - 6px: controls
  - 8px: panels
  - 999px: dots and tags only
- **Elevation:** panels are flat, with a 1px rule. Sheets and menus get one shadow (`0 8px 24px rgb(15 43 46 / 0.16)`).
- **Density:** table rows 40px; signal cards 88px collapsed.

## The signal trace (signature component)
- **Size:** a 120×32 inline SVG, from the last 30 daily snapshots.
- **Line:** the metric in `--text` at 1.5px.
- **Threshold:** a dashed `--muted` line.
- **The crossing:** the part above the threshold is drawn in `--signal-ink`, with a chartreuse dot at the latest point.
- **Accessibility:** `role="img"` with an `aria-label` sentence ("Active seats rose from 38 to 47 over 30 days; threshold 45").
- **Where it appears:** signal cards, signal detail (larger, with axes), and account usage panels.
- **Never** used decoratively or without a threshold.

## Iconography
- **Phosphor, regular weight.**
- **Rule-type icons:**

  | Rule type | Icon |
  |---|---|
  | `SEAT_PRESSURE` | `UsersThree` |
  | `USAGE_PACE` | `Gauge` |
  | `NEW_TEAM` | `TreeStructure` |
  | `FEATURE_INTENT` | `LockKeyOpen` |
  | `NEW_EXECUTIVE` | `IdentificationBadge` |

## Structure (kept from Tool 01, accepted by the user)
- Top module bar on ink, plus an icon rail.
- **Boards** with a count and value per column (Signals by status; CSQLs by stage), each with a List alternative.
- Slide-over **sheets** for triage and CSQL actions, so the queue stays visible.
- Opaque panels everywhere. No glass, no blur.

## Simulated data marker
Any record whose usage came from the simulator carries a `Simulated usage` tag (dashed outline, `--muted`). The account page's data-freshness line says "Usage source: simulator". The overview footer says "Demo workspace — usage is simulated" while any simulated rows exist.

## Revision, 2026-10-08: "it looks like a forex trader platform"

The user's review of the first build: the metrics looked like a trading terminal. This is the same lesson as Tool 01 (see the memory note "UI must be demo-worthy": money in plain words, not a trading dashboard). What changed:

| Before | After | Why |
|---|---|---|
| JetBrains Mono for every figure, count and ID | The interface sans with tabular numbers; mono only for API keys and code samples in Settings | Monospace figures are the strongest "ticker" cue |
| A sparkline on every card, list row and overview item | No sparklines in lists; the sentence carries it ("65 of 60 seats active for 16 days"). One chart remains, on the signal and account pages | Rows of mini-charts read as a market watchlist |
| Chart in black and chartreuse, with a neon dot | Grey line, brand teal above the threshold, small teal dot | Calmer; colour still marks the crossing |
| ALL-CAPS mono tag `SEAT PRESSURE` | Quiet "Seat pressure" label with an icon | Looked like a ticker symbol |
| Faint 24px grid behind everything | Plain canvas | Graph paper added to the terminal feel |
| Headline numbers in teal mono | Bold, in the text colour | Calmer sentence |
| Priority as a number with "+35 … = 55" | "High / Medium / Low priority", with the reasons as plain sentences ("Worth about $14,400 a year.") | People act on reasons, not scores |

Chartreuse now appears only on the dark top bar (active tab, notification badge, product mark).

---

# Revision 2, 2026-10-08: "Modern CRM workspace" (supersedes everything above)

**Why it changed:** after revision 1 the user still said the sign-in page and the interface "look like a trader's site" and don't feel like something people would pay real money for. They then chose **Modern CRM workspace** from three directions (CRM workspace, enterprise suite, calm and warm workspace). The structural changes matter more than colour.

| Area | Before | Now |
|---|---|---|
| Frame | Dark ink top bar with a chartreuse underline | **Light left sidebar** (#F7F7F5): workspace name, search, notifications, navigation with a "to review" count badge, an Admin group, and the user card at the bottom. Phones get a slim white top bar and a bottom navigation bar |
| Sign-in | Split screen with a dark marketing panel | **One centred card** on a soft background, with the logo, "Sign in to Fernway" and a quiet demo hint |
| Records | Text-only rows | **Company logo tile** beside every account (a stable colour per company; initials, since demo companies have no real logos) and **coloured avatars** for people, including "Priya → Tomás" handoffs |
| Signals | A four-column board | **Tabs** (To review, Snoozed, Accepted, Dismissed) over a roomy record list: logo, name, plain-language signal type, the sentence, handoff, value "a year", due date |
| Status | Coloured dot plus a word | **Soft pills** (tinted background plus text): "Due Thu", "2 days late", "High priority" |
| Deadlines | "Due in 2 business days" | **"Due Thu", "Due tomorrow", "2 days late"** |
| Type | Space Grotesk / JetBrains Mono | **Geist** throughout; Geist Mono only for API keys and code |
| Surfaces | Flat panels, 8px radius | White cards, 12px radius, hairline border, a very soft shadow |
| Home | Revenue headline sentence | "**5 customers look ready to grow.**", a one-card stat row (to review, with sellers, pipeline, won), "Ready to review" and "Recent wins" lists with logos |

**Palette (all text pairs AA):**
- text #18181B (17.7:1)
- muted #5C5F66 (6.4:1, 5.8:1 on sunken)
- faint #6B6E76 (5.1:1)
- field #8E8E96 (3.25:1)
- brand #0D6B6B (white on brand 6.3:1; brand on its tint 5.5:1)
- pills: risk 6.0:1, watch 5.4:1, won 5.6:1, neutral 7.4:1
- eight logo tile colours, each ≥5:1 with white text

Chartreuse is retired.


# Revision 3, 2026-10-11: "Customer stories" (supersedes revisions 1 and 2)

**Feedback (third rejection):** "still looking like some trading interface, it's not beautiful, it looks boring." The user then locked a workspace rule (CLAUDE.md §1, *LOCKED RULE: NEVER A TRADING INTERFACE*).

## Why revision 2 still read as trading
Revision 2 changed the colours but not the structure. Several patterns survived:
- a strip of four big numbers at the top of Home
- dollar figures right-aligned in their own column on every list
- green money
- line charts against a dashed threshold (the "signal trace")
- dense grey tables

That is the anatomy of a trading screen, whatever the palette.

## Research: what we took, and why
- **Linear triage and Front's shared inbox:** the Signals page is an inbox. A list sits on the left and the selected signal opens in a reading pane on the right. A CSM decides without losing their place. Dismiss or snooze returns to the inbox, which opens the next signal. ([Linear: Triage](https://linear.app/docs/triage), [Front: inbox redesign](https://front.com/blog/front-inbox-redesign))
- **Attio record pages:** a record is a details panel plus a story and a timeline, not a grid of figures. The account and CSQL pages follow this: who they are, who looks after them, how they use the product, what we've spotted, what happened. ([Attio: create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records))
- **Vitally:** CS platforms frame expansion as a team motion (playbooks, account plans). This is why the handoff, CSM to seller, is shown with both people's faces everywhere. ([Vitally: why Vitally](https://www.vitally.io/why-vitally))

## Principles
1. **Lead with customers and people, in sentences.** Every signal has a one-line story built from its evidence (`src/ui/story.ts`), e.g. "More people than seats: 65 using 60 analyst seats".
2. **Money is a quiet line, never the hero.** It appears as "Worth about $14k a year" in muted text. There are no money columns on lists and no green money.
3. **Evidence as pictures of the thing, not charts over time** (`src/ui/evidence.tsx`, the signature element):
   - seat map: one square per seat; striped squares are people without a seat
   - commitment meter: used so far, then this pace, against a marker for the commitment
   - a new team's people
   - a tally of attempts to open an add-on
   - a contact card for a new senior person

   Each picture has a sentence for screen readers, and the numbers are always repeated in the caption.
4. **One colour per signal type**, used for its icon tile, pill and evidence picture. This is where the colour comes from, instead of decoration.
5. **Words for status and time:** "Due tomorrow", "In 3 months", "Steady", "1 signal to review". There are no percentages in lists.

## Tokens
- **Neutrals:** canvas #FFFFFF; sidebar and sunken #F4F5F9; text #1A1C2B; muted #575C6E; faint #656A7C; rules #E8EAF0 and #D9DCE5.
- **Brand:** white-labelled `primaryColor`. Fernway's demo brand is ultramarine #3949C8.
- **Signal types (ink on tint):** seats #1C64A8 on #E9F2FB; usage #94560A on #FDF3E2; new team #1B7348 on #E7F5ED; add-on #6B3FBF on #F2ECFC; new senior contact #B0285B on #FCEBF1.
- **Type:**
  - Bricolage Grotesque for headings and customer stories (hero 32/38, display 26/32, story 18/25)
  - Instrument Sans for everything else
  - Geist Mono only for API keys
- **Company tiles:** initials in a dark hue on a 13% tint of the same hue, softer than the solid tiles of revision 2.

## Contrast (computed, WCAG AA)
| Pair | Ratio |
|---|---|
| white on brand #3949C8 | 7.09 |
| brand on brand tint | 6.30 |
| text on sidebar | 15.48 |
| muted on white / on sidebar | 6.64 / 6.10 |
| faint on white / on sidebar | 5.38 / 4.93 |
| seats / usage / new team / add-on / new senior contact, ink on tint | 5.40 / 5.31 / 5.20 / 5.89 / 5.54 |
| risk on risk tint | 5.97 |
| neutral on neutral tint | 7.31 |
| form border on white (non-text, ≥ 3:1) | 3.22 |

## Self-check applied to every screen
"Could this be mistaken for a trading app? Is it beautiful, not just tidy?"

All main screens were reviewed at 1440 and 390 px against this question: Home (CSM and seller), the Signals inbox and its phone view, signal, CSQL board and detail, accounts list and detail, Results, and sign-in.


# Revision 4, 2026-10-11: "Close-style workspace" (supersedes revision 3)

**Feedback:** "I prefer the green colour but it still looks vibe coded." The user supplied screenshots of Close CRM (Getting started, Inbox, Leads, Workflows, Reports) as the reference to mirror. They are kept privately because they show the user's own account. Revision 3's custom display font, per-type rainbow colours and decorative story cards read as generated.

## What we mirrored from Close, and how
- **Sidebar:**
  - white, with plain outline icons and dark medium-weight labels
  - the active item is a soft grey pill
  - groups are separated by hairlines (Home | Signals, CSQLs, Accounts | Results, Rules)
  - the current section's sub-items are indented under a thin line (Signals: Snoozed, Accepted, Dismissed), as Close does for Inbox (Done, Future) and Reports
  - a "Saved views" list of real filters (Close's Pinned smart views)
  - Settings at the bottom
- **Top bar:** a wide grey search field on the left, and notifications and the account menu on the right.
- **Page header band:** white, with a bold 28px title, a one-line description and the actions on the right (one solid primary button).
  - A row of pill tabs with icons and counts sits under the title (Close's Inbox: Primary, Emails, Calls…).
  - A toolbar row of outlined filter buttons sits under a hairline (Close's "Add filter", "Sort", "Columns").
- **Canvas:** light grey (#F7F7F8), holding white panels with a 1px border, 8px corners and no heavy shadow.
- **Lists:** white rows separated by hairlines with a logo tile, a bold name and one or two lines of plain text. The selected inbox row has a green bar on its left edge.
- **Empty states:** an icon in a soft tinted circle, a plain title, one muted line and the primary action (Close's Inbox, Leads and Workflows empty screens).
- **Avatars:** initials in a dark hue on a light tint of it (Close's "KB" bubble).

## What we deliberately did not copy
- **Close's Reports grid of big blue numbers:** it breaks the locked rule (no KPI tiles). Results stays a sentence, a short signal-to-win path, wins and people.
- **Close's AI promo block and trial banner:** they are Close's product marketing, not workflow.
- **Close's blue:** the user prefers green.

## Tokens
- **Neutrals:** sidebar and panels #FFFFFF; canvas #F7F7F8; search, pills and sunken #F2F2F3; hover #F0F0F1; text #1D1F24; muted #5F6368; faint #6B6F76; rules #E6E6E8 and #D6D6DA.
- **Brand (white-labelled `primaryColor`):** Fernway's demo is green #0B7A55. Signal types no longer have their own colours: icons are neutral, and evidence pictures draw in the brand. Red is kept only for "people without a seat".
- **Type:**
  - Inter for everything (page titles 28/34 bold, panel titles 16/24 semibold, body 15/22, table 14/20, meta 13/18)
  - Geist Mono only for API keys
- **Shape:** control radius 6px, panel radius 8px.

## Contrast (computed, WCAG AA)
| Pair | Ratio |
|---|---|
| white on brand #0B7A55 | 5.34 |
| brand on canvas | 4.99 |
| brand on brand tint | 4.78 |
| text on white / on canvas | 16.49 / 15.40 |
| muted on white / on canvas | 6.05 / 5.65 |
| faint on white / on canvas | 5.05 / 4.71 |
| field border on white (non-text) | 3.21 |


# Revision 5, 2026-10-11: "HubSpot-style CRM" (supersedes revision 4)

**Feedback:** "It looks ugly … you only changed the colour." Revisions 2 to 4 kept the same skeleton (left sidebar, rows of tiles and cards) and only re-skinned it. The user was asked to choose a structure and picked **top navigation (HubSpot)**. They named four dislikes: too crowded, initials tiles look cheap, grey background and boxes, and fonts and sizes.

## What changed structurally
- **Navigation:** a green top bar replaces the sidebar. It holds Home, Signals (with the waiting count), CSQLs, Accounts, Results, an Admin menu (Signal rules, Settings) for RevOps and admins, search, notifications and the account menu. Pages use the full width.
- **Index pages** (Signals, Accounts, CSQLs) follow HubSpot's index pages ([view and filter records](https://knowledge.hubspot.com/records/view-and-filter-records), [quick filters](https://knowledge.hubspot.com/records/customize-quick-filters)):
  - saved-view tabs underlined in green
  - quick-filter dropdowns (`FilterMenu`) instead of rows of chips
  - a white table with a soft header row and the record name as a green link
  - one calm line per record
  - on phones, a stacked list instead of a sideways-scrolling table
- **Record pages** (signal, account, CSQL) follow HubSpot's three-column record ([record page layout](https://knowledge.hubspot.com/records/work-with-records)):
  - left: name, status, and properties with the label above the value
  - middle: Overview and Activity tabs, with the work itself (the story, evidence, decision form, handoff note)
  - right: associated records (account, people, contacts, CSQLs)
  - columns are separated by hairlines, not boxes
- **The Signals reading pane is gone.** A row opens the record page, as in HubSpot. "Review the next one" jumps to the oldest waiting signal.

## Answers to the four dislikes
- **Too crowded:**
  - Lists show a name, one sentence and a due date.
  - Value, kind tags and avatars left the list rows; value lives on the record page.
  - Filters collapse into three dropdowns.
- **Initials tiles:** removed. Companies and people appear as names. `CompanyLogo` and `Avatar` are kept as no-ops, so a deployment with real logos can switch them back on in one place.
- **Grey background and boxes:** pages are white. Panels are sections with a heading over a hairline. The only tinted surface is the table header row.
- **Fonts and sizes:**
  - Lexend Deca, the typeface HubSpot uses across its CRM, is used throughout
  - body text 15/24, page titles 28/36 semibold, record names 22/30
  - controls 40px tall

## Tokens
- **Brand:** green #0B7A55 (white text 5.34:1). The top bar uses `brand-strong` (white text 7.8:1; inactive nav text #D9EFE5 at 6.5:1).
- **Neutrals:** surfaces #FFFFFF; table header and sunken #F5F7F6; text #1F2A24 (14.8:1); muted #56605A (6.5:1, 6.1:1 on sunken); faint #66706A (5.1:1, 4.8:1 on sunken); rules #E3E8E5 and #CFD6D2; field border #88918C (3.2:1).
- **Shape:** control radius 4px, panel radius 6px. There are no shadows except on menus.

# Revision 6, 2026-10-11: shadcn/ui kit (supersedes revision 5)

**Feedback:** "It doesn't look like software but a newspaper." Revision 5's all-white pages with hairlines and no chrome read as a document. The user chose a **premium UI kit look**, and the product itself changed to the True-up Desk at the same time ([02](02-opportunity-discovery.md)).

## System
- **Components:** [shadcn/ui](https://ui.shadcn.com) (Radix primitives with Tailwind v4), installed as source under `src/components/ui`. We use its standard app patterns:
  - the **Sidebar** block (collapsible, icon mode, mobile drawer)
  - an inset **header** with Breadcrumb and a ⌘K **Command** menu
  - **Card**, **Badge**, **Table**-based data tables with toolbar filters, **Sheet**, **Dialog**, **Tabs**, **DropdownMenu**, **Tooltip**, **Skeleton**, **Sonner** toasts
- **Type and icons:** Geist Sans and Geist Mono; lucide icons.
- **Colour:**
  - shadcn's neutral base (`--background`, `--card`, `--muted`, `--border`)
  - `--primary` comes from the org's brand colour (green #0B7A55 in the demo; white text on it is 5.34:1)
  - status badges: green (recorded), amber (needs approval), red (overdue, over-billed), blue (with CS), grey (dismissed)
- **The locked rule still applies:** no KPI tiles, money only in sentences and tables (left-aligned with its label), no line charts. The Overview leads with the close checklist and the work queue.
