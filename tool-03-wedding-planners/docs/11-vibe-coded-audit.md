# Vibe-coded audit, rev 3 (20 Oct 2026)

A harsh pass over the app and the demo video against `anti-vibe-coded-ui.md` (Field Lab guide), plus extra tells from
vibeyourwebsite.com ("9 signs"), MockHunter's uniformity heuristics, BrowserMoon ("why vibe-coded websites look cheap"),
InterfaceKit ("make UI not look AI-generated") and jcarterjohnson/vibecoded-design-tells. Then a side-by-side with real
HoneyBook (Projects pipeline, help centre), Attio (table view settings, help centre) and Linear (changelog) screenshots.

| # | Tell found | Where | Fix |
|---|---|---|---|
| 1 | Accent was a green that isn't the brand | tokens, config | `#5423e7`, used only as a line (tab, selected-row bar, focus, link hover) |
| 2 | Accent used as a fill (primary buttons, workspace mark, selected-row tint) | buttons, sidebar, rows | Primary = near-black `#0f1222`; mark = outlined; selected row = neutral grey + 2px purple bar; test fails on any purple fill |
| 3 | Inter/Plex at default tracking (BrowserMoon tell 1) | body, titles | Inter, -0.006em body, -0.012/-0.016em titles, 400/500/600 weights |
| 4 | Too-even numbers: budgets in round thousands, guests in round tens | sample data | Uneven values (£38,650, 112 guests, £28,750 …); some round ones left, as people do say "30k" |
| 5 | Timestamps on the hour (MockHunter "clustered timestamps") | 27 enquiries | Shifted by 1–9 min with reply gaps kept, so measured medians are unchanged |
| 6 | Every action in a replayed flow stamped with the same minute | video flow | `?clock=` replays a later moment: quote 22 Oct 14:12, booked 29 Oct 11:47 |
| 7 | Generic, interchangeable names; surnames recycled across couples, team and company (Lane, Price, Hale) | all data | Specific names (Okonjo-Reid, Lindqvist, McAteer, O'Rourke, Seán, Zoë); no surname reused; company Hollis & Wren |
| 8 | Two different couples called "Olivia Reed" | booked weddings | Renamed one (Ife Adeyemi & Kwame Mensah) |
| 9 | Generic venues ("The Glasshouse", "Old Mill Barn") | data | The Orangery at Coombe Hill, Wickham Old Mill |
| 10 | Unrealistic sidebar clock next to the user chip | sidebar | Removed; user chip = initials + name + menu chevron; the date sits once on Today |
| 11 | Workspace name truncated with ellipsis | sidebar | Short name in config ("Hollis & Wren") + switcher chevron |
| 12 | Every row looked identical (same two lines, same black button) | Today, follow-ups, referrals | Rows carry their own note or venue; row buttons secondary; follow-ups only show "Nudge" when due, "No answer" when quiet, else nothing |
| 13 | Status marks all the same dot shape | statuses | Linear-style shapes: hollow (New), half (Replied/Asked), solid (Quote sent), green (Booked) |
| 14 | No owner anywhere, unlike every real CRM (Attio/HoneyBook show an owner) | tables, panel | Planner column with small initials; first reply assigns the sender |
| 15 | Empty lower half on Today | Today | "Weddings in the next 14 days" from the real bookings, same table |
| 16 | Placeholder copy: "e.g. Maya Ellis & Sam Turner", "Nothing waiting", "Try another view…" | form, empty states | Removed the placeholder; plain specific copy ("All clear", "Check the spelling or switch to All") |
| 17 | "Reset sample data" / "Sample data restored" on screen | house rules | "Restore starting data"; test fails on sample/test/lorem in the main pane |
| 18 | US date inputs (mm/dd/yyyy) in a UK product | captures | Captures run Chrome in en-GB |
| 19 | Booked couples still showing date warnings | Enquiries > Booked | No date-check line on Booked/Lost rows |
| 20 | Clipped Status column on Referrals at laptop width | referrals | Venue column hides under 1240px |
| 21 | Sort order only stated in text | Enquiries | Sort arrow on "Received" header (Attio "Sorted by") |
| 22 | Video footer said a URL, not her title | video, image | "Mo Bamidele / GTM Engineer" only |
| 23 | CTA only at the very end, low in the frame | video | Persistent "Link in the comments" line from the Notion beat; end card centred and large |
| 24 | Big zoom jumps instead of slow push-ins (Charlie standard 1.00→1.12) | video | Each beat frames once, then a slow push of ~+0.08 over the hold |

Gaps vs real products kept on purpose (not built, so not faked): bulk-select checkboxes, column settings, saved views with "+",
filter chips. They would be UI with no function behind it, which is its own tell.

Known trade-off: emails use `example.com` so no real person's address is ever shown. The video avoids showing them.
