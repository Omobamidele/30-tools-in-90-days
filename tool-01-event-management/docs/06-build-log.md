# Phase 6 — Build Log

**Tool:** 01 · Exposure Register · **Built:** 2026-09-23 · **Status:** Complete (local), not deployed

Each milestone was run, tested, inspected in the browser (screenshots at 1440px and 390px), fixed and re-verified before the next one started. Issues are recorded as found, because the fixes are part of the lesson.

---

## Milestones

### 1. Scaffold
**Built:**
- Next.js 16 on :3001 (the port is pinned in the dev and start scripts)
- Postgres 17 and Mailpit in Docker (:5401, :4001/:2501)
- the Drizzle schema (31 tables) and migrations
- Zod-validated env
- Better Auth: email and password, sign-up disabled, UUID ids
- the organisation config schema and demo config
- the app shell with sidebar, top bar, bottom nav on phones, and design tokens

**Found and fixed:**
- Git Bash rewrites `/route` arguments into Windows paths. The screenshot script now takes route names without the leading slash.
- Docker Desktop hung twice (the engine returned 500). Recovered with `wsl --shutdown` and a relaunch. This is recorded in case it recurs while screen-recording.

### 2. Calculation core
**Built:** pure functions for room attrition (per night and cumulative, with review points), F&B shortfall (minimum vs forecast, with a surcharge base), cancellation tiers (on contract value, room revenue or fixed amounts, with deposits credited or not), liability allocation, scenarios, and the cancellation staircase for the timeline. Money is integer minor units, and FX conversion uses string rates and BigInt.

**Found and fixed:**
- `convertMinor` accepted `"1.2.3"` as a rate. It now validates with a full regex.
- `daysBetween` had a month off-by-one. Rewritten on UTC calendar dates.
- A per-head F&B forecast was scaled twice by an attendance change inside change-request impact. Only the scenario factor is passed now.

### 3. Records
**Built:**
- clients and agreements with a liability matrix
- events with owner and team
- suppliers with duplicate detection on normalised name and city
- contracts with versions and amendments
- manual term entry for six clause types
- obligation generation in the supplier's timezone
- an audit log on every write
- optimistic locking

**Found and fixed:**
- Raw Zod errors leaked from services. Added `parseInput`, which produces field-level domain errors.
- Past cancellation step-ups showed as "overdue". They're now filtered at generation, and marked "takes effect automatically".

### 4. Exposure UI
**Built:**
- the overview (portfolio, bearer split, events by exposure, alerts, next 14 days)
- the event workspace with the commitment timeline and its table view
- the exposure tab with the working drawer and scenario panel

**Found and fixed:** panels stretched to the height of their neighbours, tables overflowed, timeline labels overlapped, and deadline rows wrapped. Each was fixed and re-screenshotted.

### 5. Extraction
**Built:**
- PDF upload (magic-byte check, 25 MB limit, SHA-256 duplicate block) and per-page text with unpdf
- the Claude pipeline:
  - `claude-opus-5` with adaptive thinking and structured output (Zod schema)
  - refusal and max-token handling, with the server-side fallback enabled
- server-side verification of source quotes
- a review screen with the document beside the proposed terms
- an accuracy counter (confirmed / edited / rejected)

**Found and fixed:** the review screen showed developer field names (`commitmentPct`). Added `fieldLabel()` for human labels.

**Not verified live:** no `ANTHROPIC_API_KEY` is configured on this machine. The pipeline is covered by integration tests with a fake extractor (success, refusal, failure, unverifiable quotes). A live run is the first thing to do once a key is added.

### 6. Pickup and monitoring
**Built:**
- pickup per night, and CSV import (parsed in the browser, with column mapping and preview)
- the daily and hourly jobs:
  - snapshots and reminders at configured offsets
  - cutoff and tier-step warnings, threshold alerts, overdue escalation
  - approval-link expiry and post-event prompts
- alerts and decisions
- the deadlines view and ICS feed

**Found and fixed:**
- A raw `Date` passed inside an SQL template crashed. Replaced with Drizzle comparison operators.
- Two pickup snapshots at the same minute picked the wrong row. Added a tie-break on creation time.
- The `ics` library rejects `localhost` URLs, so the link moved into the description.
- **Delivered events showed "49 days overdue" for cutoffs.** Passed cutoffs and review points are markers, not tasks. They now close automatically. Delivering or cancelling an event waives its remaining non-payment deadlines and resolves its forward-looking alerts, while payments stay open because the money is still owed.

### 7. Change control
**Built:**
- the editor with a live impact panel (cost, price, margin, exposure delta)
- pricing from markup rules
- internal approval (over the limit or under the margin floor, and never by the requester)
- single-use hashed client links, with email through Mailpit
- the public approval page with a rate limit
- applying an approved change to the event forecast
- the full audit trail

**Found and fixed:**
- The approval form refreshed away its own confirmation.
- The e2e test clicked the sidebar's "Change requests" link, not the event tab. The test is now scoped to the event's section navigation.

### 8. Post-event, reports, settings, search
**Built:**
- actual penalties vs projected
- four reports with CSV export
- settings: branding with a contrast check, terminology, rules, pricing, users, FX, integrations, config export
- global search and the command menu

### 9. Hardening
**Portfolio performance.** Loading 200 events and 2,000 contracts took **3.5–4.2s**, against a target of under 1s. There were three causes:
1. N+1 loading: about 8 queries per event. Replaced by `loadExposureContexts`, a fixed set of queries for any number of events.
2. O(n²) in-memory joins (2,000 contracts × 6,000 terms). Replaced with keyed maps.
3. Missing indexes on `obligations(contract_id, kind)` and `payments(obligation_id)`. Added migration `0002_perf_indexes`, and the latest-pickup lookup now uses `DISTINCT ON`.

**Result: 0.5–0.8s.** Reproduce with `npx tsx scripts/perf-portfolio.ts`.

**Error and loading states.** Added:
- list and record skeletons (static, no shimmer)
- an in-shell error boundary with the Next.js digest as a reference
- a global error page
- in-shell and global not-found pages

**Malformed ids.** Found through the new error boundary: `/changes/new` (or any non-UUID id) returned a 500, because Postgres rejects the value before any lookup. Added `isNotFound()`, which also treats `22P02` as not found. It's used by every record page and the file route, and has a regression test.

**Responsive, checked at 390px:**
- The overview scrolled sideways: a grid with no base column let a table widen the whole page. `grid-cols-1` was added to all 10 responsive grids.
- The events list pushed exposure off-screen. On phones it now shows Event and Exposure, with client, dates and status folded under the name.
- The exposure breakdown wrapped supplier names one word per line. The contract column now folds under the term on phones.
- The cost-line remove button was an unlabelled icon in the middle of the card. It now sits at the end, labelled "Remove line".

**Accessibility.** An axe WCAG 2.1 A/AA sweep of 14 signed-in screens plus the sign-in and approval pages found one real issue. The faint text colour `#8A918E` was 3.2:1, so it was darkened to `#646B68` (4.7:1 on the darkest surface). The sweep now runs as an e2e test.

**Other gaps closed:**
- The **exposure column** was added to the events list.
- **Structured logs.** pino was a dependency but unused. Server-action failures now log with a short reference, which the user sees in the error message.
- **Cron config.** `vercel.ts` declares the production crons.
- **Production build.** `next build` passes. Its one warning (whole-project file tracing from `process.cwd()` in the storage adapter) is fixed.
- **Real-deployment seeding.** `--org-only` used to create the demo admin with the public demo password. It now requires `SEED_ADMIN_EMAIL`, validates before writing anything, and prints a random one-time password.
- **Password change.** There was none, so a seeded admin couldn't replace a temporary password. Added `/account`, which signs out the user's other sessions, with an e2e test.

### 10. Visual redesign (after user review)
**Feedback:** "the interface is bland… not attractive to demo". The cause: the brief's list of patterns to avoid had been treated as the design direction. The result was grey on grey with one accent, flat type, and the key money story written as sentences. The user chose a bold, HubSpot-like direction, then pointed at Bitrix24 as the structural reference (not the look to copy).

**Built:**
- **Visual system:**
  - new tokens: cool neutrals, a vivid brand `#2952CC`, dark navigation chrome, tinted semantic pairs, chart colours, a display type scale, and panel shadows
  - filled status pills
  - avatars (the palette avoids red and amber, which mean risk)
  - KPI tiles
  - a 30-day **exposure trend** chart built from stored snapshots. Days before the first snapshot are shown as a gap, never as zero.
- **Bitrix-style structure:**
  - the top module bar with menus
  - an icon rail that expands over the page
  - a right quick rail
  - slide-over sheets
  - Board · List · Calendar layouts, with filter chips and search as URLs
- **Boards:**
  - The **event pipeline** has drag and drop via dnd-kit, keyboard support that moves one column per arrow press, legal-transition highlighting and confirmations.
  - The **change requests** board is read-only because approvals drive status.
  - The **deadlines** board puts pay, done and waive actions on each card.
- **Team threads:**
  - migration `0003`: threads, messages and read markers
  - @mentions notify only colleagues who can see the event
  - an unread badge on the rail
  - a Discussion tab on each event
- **Appearance:**
  - four original line-art backdrops drawn in code (stage lights, floor plan, skyline, seating), or plain
  - stored per user
  - the org default is in config
  - panels stay opaque (no glass)
- **Richer demo:**
  - 11 events and 15 contracts
  - 30 days of replayed pickup and daily snapshots, computed by the real engine with the clock set back
  - a change awaiting approval
  - 12 thread messages posted through the real service

**Found and fixed:**
- The overview grid let a wide table push the page sideways. A grid with no base column grows to fit its content, so `grid-cols-1` was added to all responsive grids.
- The Threads sheet never loaded. Radix only reports open-state changes it initiates, so opening from our own state didn't fire the loader. It now loads in an effect when `open` becomes true.
- **Crash:** `useEffect(() => el.scrollIntoView())` returned a Promise in current Chromium. React treated it as a cleanup function and the thread view unmounted. Fixed with a block body.
- A dnd-kit hydration mismatch (a generated describedby id) was fixed with a stable `DndContext id`.
- The ops director landed on an empty "My deadlines". Deadlines are owned by event managers, so a user who owns none now defaults to everyone's; `?who=` still overrides.
- On phones, the filter toolbar's search box forced horizontal page scroll. It now takes a full row.
- The axe sweep was widened to the new screens and found five real issues:
  - **Nested interactive controls:** dnd-kit made the whole card a button wrapping the event link. The mouse still drags the whole card, and keyboard dragging uses a labelled grip button ("Move {event}").
  - **Low-contrast stage count pills:** `white/20` on amber. Now `black/25`.
  - **Low-contrast own-message timestamps:** now `white/90`.
  - **Message log not keyboard-reachable:** it's now focusable, as `role="log"` with a label.
  - **Settings section menu:** it sat on the dark canvas in muted grey and now sits in a panel.
  - **Settings brand preview:** it used `bg-canvas`, which turns navy under a backdrop (1.02:1). Surfaces inside panels now use `bg-sunken`, and `bg-canvas` is reserved for the page root.
- **The sweep had been scanning the Overview twice.** It never scanned Settings: the ops director is redirected away from it, and the old run silently checked the Overview again. It now scans Settings as the admin and asserts the URL.

### 11. Restraint pass and production running (after second user review)
**Feedback:** it "still looks vibe coded"; "Rendering…" appears; loads are slow. The user wants it clean enough to be worth paying for.

**Diagnosis:**
- The milestone-10 structure was right, but the decoration read as generated:
  - backdrop art on a dark canvas
  - saturated chevron stage headers
  - coloured bars and icon squares on every tile
  - floating round buttons
  - coloured borders on every card and alert
  - pills everywhere, bold weights, uppercase headers and shadows
- "Rendering…" was the Next.js development-mode indicator. The user was watching `next dev`.
- Slowness came from dev-mode compiles plus OneDrive syncing the workspace, which also deleted Turbopack's cache.

**Changed:**
- **Moved the workspace to `C:\dev\30-tools`** (the OneDrive copy is kept as a backup). Production builds went from minutes to 12–47 seconds.
- **Added `npm run demo`**, which builds for production and serves on :3001. Pages load in 0.08–0.28s after the first request, with no indicators. The README says to record from it.
- **Calm light system:**
  - Inter font; `#F7F8FA` canvas, white surfaces, `#E4E7EC` borders
  - one accent (the brand colour)
  - colour only as meaning: dots, risk text, bearer segments
  - border-only panels, and shadows only on popovers and sheets
  - semibold, not bold
- **Removed:**
  - backdrops, the Appearance picker and the preference service (`users.preferences` stays reserved)
  - the floating quick rail: threads moved to a top-bar icon, and the account menu into the avatar dropdown
- **Shell:** a white sidebar with a tint for the active item, and a white top bar with underline module tabs.
- **Components:**
  - status chips with a neutral border and a colour dot
  - KPI tiles as label + figure + a small delta
  - board columns as grey tracks with dot headers; cards white with a thin border
  - underline section tabs; sentence-case table headers
  - thread bubbles in brand tint rather than solid blue
  - calendar chips with dots
  - a calmer commitment timeline: brand fill for today, grey dashed outlines for future steps, red only within 7 days
- **Sign-in:** one centred card.

**Found and fixed while testing on the production server:**
- **Better Auth's production rate limit** (about 3 sign-ins per 10 seconds per IP) locked out consecutive sign-ins, and the form blamed "your connection". A team behind one office IP would hit this. The limit is now 20 per minute per IP, and a 429 gets a plain message.
- **Own-message timestamps** on the tinted bubble failed contrast. They now use the muted colour.
- **Board cards truncated the deadline label** before the day count. The count now has its own slot.

**Result:** 119 Vitest tests (the removed preference test is gone), all 6 Playwright specs, and the axe sweep of 17 screens plus Settings all pass against the **production** server.

### 12. Built for events: photography, hospitality type, midnight and gold (after third user review)
**Feedback:** "still looks vibe coded". The user preferred the milestone-10 backgrounds because they made it look *built for event management*, and asked for research instead of another guess.

**Research** (sources in [docs/09](09-design-system.md)):
- Design critics who study AI-built interfaces list the same defaults:
  - Inter everywhere
  - Lucide or Heroicons
  - a generic blue or purple accent
  - evenly padded, symmetric card grids
  - no imagery
- Milestone 11 hit all five. Restraint alone doesn't fix that: a calm generic UI is still generic.
- The recommended fixes are:
  - a personality font pairing
  - a palette with a reason behind every colour
  - an intentional spacing rhythm
  - asymmetric layouts
  - writing the design system down (DESIGN.md) **before** building screens
- Event products that look like event products (Luma, Eventbrite after BUCK's rebrand, Bizzabo) all put a **cover photo on every event** and use curated type.

**Decisions (the user chose each one):**
- **real venue photography** rather than drawn backdrops
- **hospitality type:** Fraunces display with Manrope UI
- **a midnight and stage-gold palette**

**Changed:**
- **DESIGN.md first:** [docs/09-design-system.md](09-design-system.md) sets the tokens, the reason for each, the contrast of every pair, the rhythm, icon rules, photo rules and motion. Screens were rebuilt against it.
- **Photography:**
  - 22 catalogue entries (5 wallpapers, 17 covers) from 20 Unsplash photos, listed in `scripts/imagery-manifest.json` and fetched by `scripts/fetch-imagery.mjs`
  - **Every photo was reviewed by eye, and 9 of 30 candidates were rejected:**
    - faces as the subject
    - real brands on screens: a named conference, a named summit, a speaker's face, a hotel loyalty sign
    - black-and-white
    - purple stage wash
    - overexposure
  - A hotel-brand logo projected on a lobby floor was cropped out.
  - Credits are in [image-credits.md](image-credits.md). The catalogue (`src/config/imagery.ts`) is generated from the manifest.
- **Event covers:** `events.cover_image`
  - It is a catalogue key, validated and audited, and chosen in a gallery picker on the event form.
  - It appears on:
    - the event workspace banner (name in the display serif, the facts, a days-to-go countdown)
    - a 72px strip on every board card, showing the destination
    - list and overview thumbnails
    - an asymmetric **Next up** hero on the overview
- **Wallpaper:** the workspace sits on a venue photo under a midnight scrim.
  - Personal choice under avatar → Appearance, stored in `users.preferences` (restored, with tests).
  - The org default is in Settings → Branding (`brand.defaultWallpaper`).
  - Panels stay opaque; there is no glass or blur.
- **White-label:**
  - `brand.primaryColor` (buttons and links, at least 4.5:1 on white) is joined by `brand.accentColor` (highlights on midnight, at least 3:1).
  - Both are validated in Settings, with a live preview of the midnight rail.
- **Icons:** Lucide replaced by Phosphor through one module (`src/ui/icons.ts`). `lucide-react` was removed.
- **Chrome:** a midnight sidebar and top bar with a gold active marker; the product mark in gold with the display serif.
- **Sign-in:** a split screen, with a venue photo and one concrete line about what the product does, plus the form.

**The contrast engineering behind "text on photos":**
- **Page scrim.** It starts at 0.80 opacity. That is the lowest value where the faintest on-photo text still reaches 4.5:1 over a pure-white patch of photo (it blends to `#3E4551`, giving 5.06:1).
- **Text tokens.** Anything that sits directly on the page uses `--on-canvas*` tokens. They resolve dark on ivory and light on a photo, and `.panel` / `[data-surface]` reset them, so no component needed a "photo" variant.
- **Fallback background.** In photo mode the page behind the image is midnight, so light text still reads if a photo fails to load. This was found by the axe sweep. The wallpaper layer ignores pointer events, so axe measured against the ivory page behind it. The report was right that the fallback was unsafe.
- **Gold links.** They are always underlined: deep gold against body ink is 2.98:1, just under the 3:1 needed for colour-only links. This was also found by axe.
- **Two failing tokens were corrected:** faint `#697386` → `#5E6779` and client teal `#0E8C7A` → `#0B7A6A`.

**Found and fixed while testing:**
- The event status menu was invisible on the banner: the select inherited white text.
- The timeline legend still said "solid blue".
- The keyboard board test was flaky once cards carried photos: it dropped before dnd-kit had applied the move. The test now waits for dnd-kit's own screen-reader announcement, which is what a keyboard user does.

**Result:**
- 125 Vitest tests (6 new: catalogue files exist, wallpaper preference default, per-person storage, rejection and stale values, cover validation and audit)
- all 6 Playwright specs, and the axe sweep, against the production build
- server response times of 0.04–0.22s per page
- about 210KB transferred for the overview, because `next/image` serves resized WebP

### 13. Validate the problem, and make money simple (after fourth user review)
**Feedback:**
- "Validate if this solves a real problem in reality."
- "The overview looks like a trading platform and can confuse someone who isn't tech-savvy."
- "Simplify the way you present money", without changing the purpose.
- The user asked for anything that would make the build more worthwhile, and chose all three additions offered.

**Validation** ([docs/10](10-problem-validation.md)):
- **Verified:**
  - About a third of group room nights are booked outside contracted blocks (ASAE/CEIR/DTF/MPI/PCMA study, 170+ events).
  - Hotels are moving to per-night attrition.
  - Penalties apply even when rooms are resold.
  - Cancellation charges step up over time.
- **Not proven:** how often agencies actually pay, and how much. The doc sets out a 5-conversation interview script with continue, pivot and stop criteria.

**Diagnosis of the "trading platform" look:**
- `USD 100,306.50` with cents on every figure
- red and green % change chips with arrows
- a line chart, sparkbars and multi-colour bearer bars on the first screen
- headings in industry jargon: exposure, attrition, carried by, tier

**Changed:**
- **Three layers of money** ([docs/09 § Money](09-design-system.md)):
  - **Summary screens** use `formatMoneyShort` (`$98.6k`, with the exact amount on hover and for screen readers).
  - **Decisions** are sentences.
  - **Detail tabs** keep full precision for finance.
- **Plain words, with the industry term small underneath** (`src/ui/copy.ts`), as the user chose.
- **Overview rebuilt as a briefing:**
  - an answer sentence ("If nothing changes, your 9 open events will owe suppliers about $100k in penalties. $36.3k of that is yours; clients cover $64k. That's down $31k on last week, mostly Solvane Sales Kickoff 2027")
  - three calm figures
  - a **Your events** list with one health word each (Needs a decision / Keep an eye / On track, from `src/core/exposure/status.ts`)
  - **What to do this week**, ordered decide → save money → pay
  - the chart behind a disclosure
- **Event page:**
  - calm figures, and "363 of 560 room nights booked"
  - a **What to do for this event** panel
  - the cancellation timeline header as a sentence ("Cancelling today costs $98.6k. That rises to $144k on Oct 3, 2026 (in 8 days)"), with short labels on the staircase
- **Board:** short money, "Above your limit" and "Figures missing".
- **Alerts** are written as sentences ("If nothing changes, penalties reach $11.4k, above your $10k limit").

**Added:**
- **Savings finder** (`src/core/exposure/savings.ts`).
  - Contracts already recorded review dates ("reduce up to 10% by Oct 3"), but they only produced reminders.
  - The finder works out the **fewest** rooms to give back, within what the contract allows and never below projected bookings, and what that saves.
  - It is shown on the overview, the Next up card and the event page, and a new **Money you can save** alert (R11) fires 14 days before each review date.
  - **Hand-checked on the demo data:** Hotel Alvorada Lisboa's block has 120, 220 and 220 rooms at €189, an 80% commitment, and 71, 140 and 152 booked.
    - Today that is 85 rooms short, €16,065.
    - After giving back 12, 22 and 22 rooms it is 42 short, €7,938.
    - That saves **€8,127** from 56 room nights, exactly what the screen shows.
- **Monday money brief** (R12, `src/services/brief.ts`, `runWeekly`):
  - a plain-English weekly email sent to every active person at 07:00 on Mondays
  - built with each person's own permissions, so on the demo data the directors see $100k while the event managers see $86.6k and $65.2k
  - off switch at Your account → Email
  - deduplicated per person per ISO week
  - available as `npm run jobs:once -- weekly` and `/api/cron/weekly`
  - the overview and the email share one sentence builder, so they can't disagree

**Found and fixed while testing:**
- One existing monitor test asserted the old alert wording; my first search for affected tests missed it.
- The saving appeared twice on the event page (as a row and as an alert); the alert is hidden there.
- The saving amount wrapped under its explanation.
- On phones, event names in the list were truncated by the health word; the details now stack under the name.
- An early draft showed the Next up figures in the event's currency instead of the organisation's.

**Result:**
- 143 Vitest tests (18 new: short money, the savings finder with hand-worked values, health words, the savings alert, brief scoping, opt-out, weekly dedupe, ISO weeks)
- lint and typecheck clean

---

### 14. Contracts in, in hours: bulk import and a real extraction queue (after "is this worth $10k?")

**Why:** a buyer pays for *their* contracts in the system fast. Before this, one PDF went to one pre-created contract, extraction ran unbounded in `after()`, and it had never run live.

**Built:**
- **Claude call checked against current docs:**
  - streaming, structured output (`zodOutputFormat`), adaptive thinking
  - the server-side fallback beta, with a GA retry if the beta is refused
  - default model `claude-opus-5-5` (`EXTRACTION_MODEL` can pick a cheaper one for bulk)
- **Queue** (`drainExtractionQueue`):
  - QUEUED runs are claimed with `FOR UPDATE SKIP LOCKED`, two at a time
  - temporary failures (429, 5xx, network) retry with backoff up to 3 attempts; others fail at once with the reason
  - the hourly job is the safety net (only runs older than 5 minutes)
  - stuck detection uses `startedAt` for running work and 24 h for queued work
- **Bulk import** (`/events/[id]/contracts/import`):
  - drop N signed PDFs; each row guesses title, supplier (matches existing ones) and city
  - one upload per file (stays under the action size limit)
  - a batch page shows Reading / To review / Scans to enter by hand / Failed with Retry
  - a batch accuracy line (confirmed, edited, rejected)
- **Sample contracts:** `npm run contracts:samples` renders four fictional text PDFs plus one image-only "scan", dated to match the seeded Halden event.

**Not done:** a live run against the real API. It needs `ANTHROPIC_API_KEY` in `.env`; everything else runs against the fake model in tests.

### 15. Bookings update themselves: emailed hotel reports

**Why:** pickup typed in by hand goes stale, and stale pickup makes every figure wrong.

**Built:**
- Each room block can get its own address, `pickup+<token>@INBOUND_DOMAIN`. The token is lowercase base32 because mail systems may lowercase addresses.
- **Webhook** `/api/inbound/email` (bearer `INBOUND_SECRET`, provider-neutral JSON):
  - reads CSV or XLSX with the saved column mapping
  - **rejects rather than guesses** when columns change, and says which
  - checks the optional sender domain, ignores the same attachment twice, and stores the file
  - records pickup as the system ("Hotel report email"), re-evaluates, and notifies the event owner either way
- **Local loop:**
  - `npm run inbound:simulate` emails a report to Mailpit (`--xlsx`, `--bump=N`, `--new-format`, `--wrong-sender`)
  - `npm run inbound:mailpit` forwards it to the webhook
- **Exposure tab:** set up from a sample report, then copy the address, see the last result, rotate or turn off.

**Verified over real SMTP:**
- CSV recorded ("417 of 560 room nights booked")
- wrong columns and wrong sender rejected
- XLSX recorded

### 16. Money protected: recorded facts only

**Why:** the renewal question is "what did this save us?" The answer must be evidence, not the system's own estimates.

**Built:**
- `/value`, with quarter / year / all and a CSV export:
  - penalties removed by recorded decisions, and room nights given back
  - client changes billed with their margin
  - finished events, projected vs actually charged (labelled a comparison, not a saving)
- The decision form pre-fills the saving and room nights from a "Money you can save" alert; nothing counts until a person records it.
- The Monday brief gains one line.
- **Seed:** the London release is recorded the way a team would do it:
  - the amount is measured by the exposure engine on the reduced block (£3,430, 20 room nights)
  - the decision is recorded
  - the contract is amended to version 2

**Bugs found and fixed:**
- **Decisions stored the contract-currency amount labelled as the event currency** (EUR shown as USD). They now store the entered currency and convert with FX, on the ledger and on the post-event page.
- **Decided alerts were re-raised** when an event was re-evaluated, so a recorded decision could be followed by the same alert again. Obligation-anchored alerts now stay decided; the threshold alert returns only if exposure dropped below the limit after the decision and rose again. The dedupe key also gained a random suffix (two raises in the same millisecond collided).
- **Amending a contract dropped the room block's pickup history and its report address** (found through the seeded amendment). Activation now moves both to the matching block in the new version; covered by a test.

### 17. Client share link

**Why:** clients ask "where do we stand?" by email, and the agency answers by hand from spreadsheets.

**Built:**
- **Client page → Share with client:**
  - create a read-only link, shown once
  - list active links with when they were last opened, and turn them off
  - directors, finance and admins only
- **`/share/<token>`** (public, `noindex`):
  - agency branding, and each event's cover
  - the client's share if nothing changes, their cost to cancel today, the next date fees rise, rooms given back, and changes waiting for their approval
  - **never** the agency's share, margins, notes or other clients; the view model is built as the system and cut to one client
- **Security:**
  - only the sha256 of the token is stored, and links expire after 90 days
  - GETs are rate-limited per IP and per token; the in-memory limiter is shared with `/approve`
  - the first view each day is audited
- The seed prints a Solvane link.

**Result:**
- 167 Vitest tests
- Playwright: the share link is created in the UI, opened signed out, axe-checked, turned off, and shows "This link was turned off"
- `/value` and the import page are added to the axe sweep

---

## Testing checklist (brief §14)

| Area | How it was tested | Result |
|---|---|---|
| Happy paths | Integration (contract → obligations → exposure → alerts → decisions; the change lifecycle) and e2e (change control, password change) | Pass |
| Incorrect inputs | Field-level Zod errors across services; malformed rates, dates, ids | Pass |
| Missing information | Exposure is marked **incomplete** rather than counted as zero (no pickup, no agreement, draft contracts, missing FX) | Pass |
| Duplicate records | Supplier name + city, PDF hash, duplicate pickup nights, change-request number race | Pass |
| Permissions | Event managers are scoped to owned or member events (outsiders get a 404, not a 403); role-gated actions; the requester can't approve their own change; UI checked as Sam (event manager) and Lee (finance) | Pass |
| Edge cases | The spec §12 cases as named unit tests: tiers on boundaries, zero forecasts, split liability, deposits greater than the penalty | Pass |
| Failed integrations | Email disabled / send failure is recorded per notification; extraction refusal, failure and max-tokens are covered | Pass (the live Claude call is not verified) |
| Empty datasets | First-run overview; empty states on every list | Pass |
| Large datasets | 200 events / 2,000 contracts / 6,000 terms | 0.5–0.8s |
| Mobile / responsive | Overview, events, event, exposure, deadlines, contract, change form and reports at 390px | Pass after the fixes above |
| Navigation | Breadcrumbs, event tabs, command menu, not-found for unknown and malformed URLs | Pass |
| Forms | Validation messages, optimistic-lock conflicts, success states | Pass |
| Automation | Jobs with a fake clock: dedupe on re-run, reminders at the nearest offset, escalation, auto-close | Pass |
| Data persistence | Integration tests run against real Postgres | Pass |
| Authentication | Sign-in; sign-up disabled; password change (wrong current password, mismatch, success) | Pass |
| Authorization | Service-level `can()` on every call, and the UI uses the same function | Pass |

**Totals:**
- Vitest: 119 tests (66 core, 53 integration), including thread access scoping, @mention notification rules and unread counts.
- Playwright: change control, password change, the event pipeline board (keyboard move and a refused illegal move), team threads (a mention reaches the colleague), and accessibility (3 tests covering 19 signed-in screens, the public pages, and the client share link end to end).
- Coverage of `src/core` across all tests: 99% of statements and 87% of branches. Exposure maths is at 92% of branches, and extraction-proposal mapping at 65% (defaults for fields the model leaves empty). The spec aimed for 100% of branches in core. **That target is not met.** The extraction mapper is the next thing to test.

---

## Product polish pass (brief §15)

| Checked | Finding | Action |
|---|---|---|
| Developer language visible to users | Field names on the review screen; raw error text | Replaced with labels and plain-language errors with references |
| Confusing states | "Overdue" on automatic events (tier steps, passed cutoffs) | Markers close themselves or read "takes effect automatically" |
| Weak empty and error states | No boundaries, and a 500 on bad ids | Added skeletons, error, not-found and global error pages |
| Responsive | Page-level horizontal scroll on phones; key figures hidden | Fixed (see milestone 9) |
| Accessibility | Faint text below AA contrast | Fixed, and enforced by an e2e test |
| Currency noise | "USD" repeated on every figure in single-currency lists | The code is shown only when it differs from the context currency |
| Unclear primary actions | Checked on every screen: one primary button per view (Add contract, New event, Create draft, Decide) | No change needed |
| Motion | None besides dialog open/close; skeletons are static | Intentional |

---

## Final quality gate (brief §20)

| Question | Answer |
|---|---|
| **Business:** does it solve a meaningful problem? | Yes. It answers "what would it cost us today, and whose money is it?" across every supplier contract, a question agencies currently answer from PDFs and spreadsheets. **Open risk:** how often and how large penalties are remains unvalidated (docs/01 §13). The post-event projected-vs-actual record builds that evidence. |
| **GTM:** does it show GTM thinking? | Yes. It was chosen against the $30 Tool Test and against named competitors (Blocks, Passkey, qondor). The buyer, user and payer are separated. Commercialisation is in docs/07. |
| **Engineering:** is it functional? | Yes, locally. 114 unit/integration tests and 4 e2e tests pass against real Postgres and a real mail server, and the production build is clean. **Not done:** live extraction with an API key; hosted deployment (needs the storage adapter). |
| **UX:** does it feel like serious software? | Dense, table-first, one primary action per screen, a working drawer behind every figure, checked on phone and desktop, WCAG AA on the swept screens. |
| **Product:** does the workflow make sense? | Commit → monitor → change → decide → reconcile is one loop. Every screen links to the record before and after it. |
| **White-label:** could another company use it? | Yes. A config file per deployment covers brand, terminology, rules, pricing, roles, currencies and email, and liability rules are data. **Gap:** no logo upload yet. |
| **Commercial:** could a GTM Engineer sell it? | Yes, as implementation: contract backfill, liability setup, rule tuning and pickup integrations. See docs/07. |
| **Teaching:** can it be explained? | See docs/08. |
| **Differentiation:** would a cheap tool replace it? | Not for this scope. Hotel-block tools cover one clause type for one supplier type. The portfolio view across every supplier, and the liability split per client agreement, are agency-specific. |
