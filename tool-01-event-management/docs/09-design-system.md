# 09 — Design system (DESIGN.md)

Written **before** the visual rebuild (milestone 12) so every screen follows one set of decisions instead of each component inventing its own. If a screen needs something this file does not cover, add it here first.

## Why this exists

Two earlier passes were rejected: a plain grey UI ("bland") and then a calm Inter/blue restraint pass ("still looks vibe coded"). Research into why AI-built interfaces look generic found the same tells in both passes:

| Tell (what AI tools default to) | Where we had it | Replacement |
|---|---|---|
| Inter everywhere | every screen | Fraunces display + Manrope UI |
| Lucide / Heroicons | 29 files | Phosphor |
| Generic blue or purple accent | `#2952CC` | Midnight + stage gold |
| No imagery | none | Real venue photography: wallpapers + an event cover per event |
| Symmetric, evenly padded card grids | overview KPIs | Asymmetric "Next up" hero; 8 / 16 / 24 / 48 rhythm |
| Nothing says what industry this is | the whole product | Venue photography, hospitality typography |

Sources: [The Crit — vibe-coding design guide](https://thecrit.co/resources/vibe-coding-design-guide), [Superdesign — why AI design looks generic](https://superdesign.dev/blog/why-ai-design-looks-generic), [Superdesign — how to make AI UI look less generic](https://superdesign.dev/blog/how-to-make-ai-ui-look-less-generic). Event products that read as event products all lean on a cover photo per event and curated type: [Luma cover images](https://help.luma.com/p/event-cover-images), [Luma themes](https://help.luma.com/p/event-themes-and-customization), [Eventbrite rebrand by BUCK](https://buck.co/work/eventbrite).

## Palette

| Token | Value | Use | Why |
|---|---|---|---|
| `--midnight` | `#0E1726` | Sidebar, top bar, photo scrims, primary figures on dark | The colour of a ballroom after the house lights go down; reads premium without the "dark mode dashboard" look because content surfaces stay light |
| `--canvas` | `#F6F4EF` | Page background in Plain mode | Warm ivory (table linen, printed menus) instead of cold grey |
| `--surface` | `#FFFFFF` | Panels, tables, cards, sheets | Data must sit on white for legibility |
| `--sunken` | `#EFECE5` | Kanban columns, inset areas | Ivory one step down |
| `--ink` | `#141B2B` | Body text | 17.2:1 on white |
| `--muted` | `#4A5468` | Secondary text | 7.6:1 on white |
| `--faint` | `#5E6779` | Tertiary text, captions | 5.7:1 on white, 4.8:1 on sunken ivory (AA everywhere) |
| `--rule` / `--rule-strong` | `#E6E1D6` / `#D3CCBD` | Borders | Warm, low-contrast dividers |
| `--brand` (config `primaryColor`) | `#8A5D12` deep gold | Primary buttons, links, focus ring, active tab | 5.8:1 with white text — the white-label check (≥ 4.5:1 on white) still applies |
| `--accent` (config `accentColor`) | `#C8912E` stage gold | Active nav indicator, product mark, highlights on midnight and photo scrims, chart line | 6.4:1 on midnight; never used as text on white (2.8:1) |
| `--risk` | `#B42318` | Exposure over threshold, overdue, errors | Meaning only |
| `--watch` | `#B54708` | Due soon, pending | Meaning only |
| `--settled` | `#067647` | Met, approved, released | Meaning only |
| `--bearer-agency` / `--bearer-client` | `#6D4AD8` / `#0B7A6A` | Who carries the exposure | Distinct from status and gold; both ≥ 5.2:1 on white so they work as text |

Rules:
- **Colour means something.** Status colours appear as small dots and as risk text, never as card backgrounds or borders.
- **Gold is scarce.** One gold element per region: the active nav item, the primary button, the current timeline step. If two gold things compete, one becomes neutral.
- **Text on gold is midnight** (accent) or **white** (brand). Never white on accent.
- **Gold links are always underlined** (a 40% gold underline, solid on hover). Deep gold against body ink is 2.98:1, under the 3:1 needed to tell a link apart by colour alone.

## Type

| Role | Family | Size / weight | Where |
|---|---|---|---|
| Display | Fraunces (variable, optical size on) | 28–34 / 500 | Page titles, event name on the cover banner, sign-in headline |
| Figure | Fraunces, tabular | 24–30 / 500 | KPI figures, hero money |
| Heading | Manrope | 15–16 / 600 | Panel titles, column headers |
| Body / UI | Manrope | 13–14 / 400–500 | Everything else |
| Caption | Manrope | 12 / 500 | Metadata, timestamps |

- Numbers use `font-variant-numeric: tabular-nums` (`.num`).
- Serif is for **names and figures** only. Never for buttons, labels, tables or form fields.
- Sentence case everywhere. Semibold (600) is the heaviest weight in the UI; bold is not used.

## Spacing, radius, elevation

- Rhythm: **8 / 16 / 24 / 48**. Tight inside lists and tables (8), medium inside panels (16), between panels (24), between page sections (48). Uneven gaps are intentional: they group things.
- Radius: **6** for controls, chips and thumbnails; **10** for panels, cards and photo surfaces. No pills except status chips.
- Shadows: only on floating layers (menus, sheets, dialogs) and on cards that carry a photo. Flat panels use a 1px `--rule` border.

## Icons

Phosphor, regular weight, 16–18px in UI, 20px in navigation. Duotone only for empty-state illustrations. Every icon sits next to a text label or has an `aria-label`. Icons are imported only through `src/ui/icons.ts` so the family can be swapped in one place.

## Photography

- **Source:** Unsplash, under the [Unsplash License](https://unsplash.com/license) (free for commercial use, attribution not required). Credits are still kept in [image-credits.md](image-credits.md).
- **Subjects:** venues and destinations: ballrooms, banquet rooms, theatres and stages, hotel lobbies, resort terraces, host-city skylines.
- **Rejected on review** (every photo was looked at before it was accepted):
  - faces as the focal point
  - real brands or event logos on screens and signage
  - monochrome
  - saturated purple or blue stage wash
  - overexposed shots
- **Wallpaper mode:** the chosen wallpaper sits fixed behind the page under a midnight scrim (`rgba(14,23,38,0.80)` deepening to `0.90` at the bottom; 0.80 is the minimum that keeps the faintest on-photo text at 4.5:1 over a pure-white patch). Content panels on top stay opaque; there is no glass or blur. The page behind the photo is midnight, not ivory, so light text still reads if a photo fails to load.
- **Text on photos** always sits on a scrim gradient that guarantees at least 4.5:1 for white text on the lightest crop. It is checked by the axe sweep in `e2e/accessibility.spec.ts`.
- **Delivery:** `next/image` with explicit `sizes`, WebP sources, and `object-position` from each photo's focal point in the catalogue.
- **Customising:** a new client adds entries to `scripts/imagery-manifest.json`, runs `node scripts/fetch-imagery.mjs` and `node scripts/gen-imagery.mjs` (which writes `src/config/imagery.ts`), then looks at every new photo. Uploading covers per event is on the roadmap; it needs the storage adapter.

## Money (milestone 13)

Summary screens must not look like a trading platform. The tells to avoid:
- cents on every figure
- red and green % chips with arrows
- line charts and sparkbars by default
- industry jargon as headings

Money is shown in three layers:

| Layer | Where | How money looks |
|---|---|---|
| **Summary** | Overview, event header and figures, board cards, lists, alerts, the Monday brief | `formatMoneyShort`: a symbol, no cents, compact from 10k (`$7,106`, `€98.6k`, `$1.2M`). `<MoneyShort>` puts the exact amount in the tooltip and screen-reader text |
| **Decision** | "What to do" panels, alerts | A sentence with a verb, a date and the money: "Give back 56 room nights at Hotel Alvorada Lisboa by Oct 3, 2026 to save up to €8,127" |
| **Detail** | Exposure tab, working drawer, contracts, reports, settings, timeline table | `formatMoney`: currency code and cents, for finance |

**Words.**
- Headings use plain words, with the industry term shown small underneath (`src/ui/copy.ts`).
- Examples: "Penalties if nothing changes" (term: exposure), "Cost to cancel today" (cancellation charge), "Unused rooms" (attrition), "Above your limit" (over threshold), "Yours / Client's / Not agreed yet" (carried by).
- Detail screens keep the industry terms planners use.

**Change over time** is a sentence ("That's down $31k on last week, mostly Solvane Sales Kickoff"), never a percentage chip. The 30-day chart sits behind a disclosure.

**One word per event** summarises its state:
- **Needs a decision:** a high alert, over the limit, or money due or rising within 7 days
- **Keep an eye:** watch alerts, or figures missing
- **On track:** everything else

The rules live in `src/core/exposure/status.ts`.

**One source of wording.** The overview and the Monday brief email build their sentences with the same functions (`src/services/brief.ts`), so the screen and the inbox never disagree.

## Motion

CSS only, and all of it is off under `prefers-reduced-motion: reduce`:
- a 150ms lift (`translateY(-1px)` plus a shadow) on photo cards when hovered
- a 200ms slide for sheets (Radix)
- a 300ms fade-in for photos once decoded

No motion library, no looping animation, no parallax.

## Layout signatures

- **Event workspace:** a 200px cover banner. The event name is in Fraunces, with the client, dates, city and status chip over the scrim; actions sit to the right. The commitment timeline follows below.
- **Overview:** an asymmetric hero, with the wide "Next up" event card (cover, days to go, live exposure) on the left and a stacked KPI column on the right.
- **Event board:** each card starts with a 72px cover strip. Columns sit on the wallpaper.
- **Lists:** 40×40 cover thumbnails lead each event row.
- **Sign-in:** a split screen, with a full-bleed venue photo and scrim plus the product mark on the left and the form on the right.
