# 09 — Design system: "Signal room" (DESIGN.md)

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
