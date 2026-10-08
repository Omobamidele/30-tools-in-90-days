# 30 Tools in 90 Days

A public challenge: 30 internal GTM systems for 30 industries, built in 90 days.

Each tool is an independent project that goes from industry research to a working, white-labelable internal system, and each ships with a playbook that teaches other GTM Engineers how to identify, build, customize and sell the same capability.

- **Operating brief:** [CLAUDE.md](CLAUDE.md)
- **Port registry:** [PORTS.md](PORTS.md)
- **Running a tool:** each folder is a separate app with its own README. In a tool folder: `docker compose up -d`, `npm install`, copy `.env.example` to `.env`, then `npm run db:migrate && npm run db:seed && npm run demo`.
- **Demo data:** every company, person and number in the demos is fictional. Usage and activity are simulated and labelled as such.
- **Location:** `C:\dev\30-tools`. The workspace moved out of OneDrive on 2026-09-25, because sync locks slowed builds and page loads. The old OneDrive copy is a backup only.
- **Recording a tool:** run `npm run demo` in its folder. That serves the production build on its fixed port, with no dev-mode "Rendering / Compiling" indicators.

## Process per tool

1. Industry research → `docs/01-industry-research.md`
2. Opportunity discovery (system selected by me) → `docs/02-opportunity-discovery.md`
3. Product specification → `docs/03-product-spec.md`
4. UX / UI design → `docs/04-ux-design.md`
5. Technical architecture → `docs/05-architecture.md`
6. Build, test, polish → `docs/06-build-log.md`
7. Commercialization → `docs/07-commercialization.md`
8. Teaching playbook → `docs/08-teaching-playbook.md`

## Tracker

Status values: `Not started` · `Research` · `Opportunities` · `Spec` · `UX` · `Architecture` · `Build` · `Polish` · `Complete`

| # | Folder | Industry | System | Local URL | Status | Recording |
|---|---|---|---|---|---|---|
| 01 | [tool-01-event-management](tool-01-event-management/) | Event management companies | Exposure Register (contract exposure + change control) | http://localhost:3001 | Complete (local build, not yet deployed) | Ready to record |
| 02 | [tool-02-b2b-saas](tool-02-b2b-saas/) | B2B SaaS (mid-market) | Expansion Signal Desk (usage signals → CS triage → routed expansion pipeline) | http://localhost:3002 | Complete (local build, not yet deployed) | Ready to record |
| 03 | [tool-03](tool-03/) | — | — | http://localhost:3003 | Not started | — |
| 04 | [tool-04](tool-04/) | — | — | http://localhost:3004 | Not started | — |
| 05 | [tool-05](tool-05/) | — | — | http://localhost:3005 | Not started | — |
| 06 | [tool-06](tool-06/) | — | — | http://localhost:3006 | Not started | — |
| 07 | [tool-07](tool-07/) | — | — | http://localhost:3007 | Not started | — |
| 08 | [tool-08](tool-08/) | — | — | http://localhost:3008 | Not started | — |
| 09 | [tool-09](tool-09/) | — | — | http://localhost:3009 | Not started | — |
| 10 | [tool-10](tool-10/) | — | — | http://localhost:3010 | Not started | — |
| 11 | [tool-11](tool-11/) | — | — | http://localhost:3011 | Not started | — |
| 12 | [tool-12](tool-12/) | — | — | http://localhost:3012 | Not started | — |
| 13 | [tool-13](tool-13/) | — | — | http://localhost:3013 | Not started | — |
| 14 | [tool-14](tool-14/) | — | — | http://localhost:3014 | Not started | — |
| 15 | [tool-15](tool-15/) | — | — | http://localhost:3015 | Not started | — |
| 16 | [tool-16](tool-16/) | — | — | http://localhost:3016 | Not started | — |
| 17 | [tool-17](tool-17/) | — | — | http://localhost:3017 | Not started | — |
| 18 | [tool-18](tool-18/) | — | — | http://localhost:3018 | Not started | — |
| 19 | [tool-19](tool-19/) | — | — | http://localhost:3019 | Not started | — |
| 20 | [tool-20](tool-20/) | — | — | http://localhost:3020 | Not started | — |
| 21 | [tool-21](tool-21/) | — | — | http://localhost:3021 | Not started | — |
| 22 | [tool-22](tool-22/) | — | — | http://localhost:3022 | Not started | — |
| 23 | [tool-23](tool-23/) | — | — | http://localhost:3023 | Not started | — |
| 24 | [tool-24](tool-24/) | — | — | http://localhost:3024 | Not started | — |
| 25 | [tool-25](tool-25/) | — | — | http://localhost:3025 | Not started | — |
| 26 | [tool-26](tool-26/) | — | — | http://localhost:3026 | Not started | — |
| 27 | [tool-27](tool-27/) | — | — | http://localhost:3027 | Not started | — |
| 28 | [tool-28](tool-28/) | — | — | http://localhost:3028 | Not started | — |
| 29 | [tool-29](tool-29/) | — | — | http://localhost:3029 | Not started | — |
| 30 | [tool-30](tool-30/) | — | — | http://localhost:3030 | Not started | — |
