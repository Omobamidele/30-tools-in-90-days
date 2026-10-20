# Phase 5 — Technical Architecture

Port: app `3003` (pinned in `scripts/serve.js`; it exits rather than drift). No API or DB port is used.

## Why this architecture
The Field Lab rule is the simplest architecture that works. Every decision here is a date comparison, so there is no AI, no backend and no database. Tools 01 and 02 use Next.js and Postgres because they need auth, documents and jobs; this one doesn't.

```text
Data in                   Rules                  Logic                       Out
Manual entry (DM,   ┐
WhatsApp, email)    ├──▶ config/rules.json ──▶ src/rules.js (pure        ──▶ Today queue, lists,
Website form*       │    (capacity, timings,    functions, unit-tested)      draft messages to copy
sample-data/*.json  ┘     templates, brand)
* webhook on the roadmap, not built
```

## Frontend
`index.html` + `src/app.js` (ES modules, no framework, no build step) + `src/styles.css`.

## Backend
None. `scripts/serve.js` is a 40-line static server that only serves `index.html`, `src/`, `config/` and `sample-data/`.

## Database and persistence
JSON sample data loads on first visit; changes are saved in the browser's `localStorage` under `wet:v1`. "Reset sample data" on House rules clears it. For a real client this becomes a small hosted store (see roadmap).

## Authentication and authorization
None in the MVP: it runs on one planner's machine. Not suitable for multi-user use as is.

## Integrations, background jobs, automation
No live integrations and no background jobs. The "automation" is the rules deciding what is due when the page is opened. Nothing is sent automatically.

## Clock
A fixed sample clock (Tue 20 Oct 2026, 09:30) keeps the demo and tests repeatable. Add `?clock=live` to use the real time.

## Error handling and logging
Rule functions throw on impossible actions; the UI shows the message as a toast. Load failures show a plain error. No server logs.

## Environment configuration
`.env.example` documents `PORT=3003` and an optional `CHROME_PATH` for browser tests. No secrets exist.

## Deployment
Any static host (the four folders). Not deployed yet.
