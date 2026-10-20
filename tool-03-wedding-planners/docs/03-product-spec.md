# Phase 3 — Product Specification

## Product brief
A small, rules-first tracker that tells a planner, each morning, which couples need a reply, which quotes need a nudge, and which past couples should be thanked and asked for a referral.

## Personas
- **Owner / lead planner (Elena).** Answers most enquiries, often from her phone in the evening. Wants one list and the next message ready to send.
- **Lead planner (Marcus).** Needs to know when he's the free planner on a date.

## User stories
1. As a planner, I add an enquiry from any channel in under a minute, and I'm told at once if the date is full, tight or the venue is already ours.
2. I see who has waited longest for a first reply, against our two-hour target.
3. I get the day 3 and day 7 nudge on the right day, with a draft I can copy into WhatsApp.
4. When a quote has had both nudges and no answer, it's flagged so I can call or close it.
5. Fourteen days after a wedding, I'm reminded to send the thank-you with a review and referral ask, and one reminder a week later.
6. I'm warned if the same couple has already enquired on another channel.

## Functional requirements
Enquiry list with search, status tabs and channel filter · add-enquiry form with validation, live date check and duplicate warning · enquiry detail with date check, follow-up steps, draft message, actions and history · Today queue · quote follow-ups · referrals and reviews · house rules page · reset sample data.

## Non-functional requirements
Opens in any modern browser · no account, server database or secrets · works at phone width · keyboard reachable · every rule unit-tested.

## Workflows
New → Replied → Quote sent → (day 3 nudge → day 7 nudge) → Booked / Lost / Gone quiet. Booked adds the date to the calendar, so the next enquiry for that date sees it.

## Data model
- `Enquiry`: id, couple, channel, contact, receivedAt, weddingDate, venue, guests, budget, firstReplyAt, status, quoteSentOn, nudgesSent[], referredBy, note, history[].
- `BookedWedding`: id, couple, date, venue, planner.
- `PastCouple`: id, couple, weddingDate, venue, thankYouSentOn, reviewNudgeSentOn, review, referralsSent.

## Permissions
Single-team tool in this MVP; no roles. (Out of scope; see roadmap.)

## Integrations
None live. Messages are drafts to copy. Website-form webhooks and calendar sync are on the roadmap, not faked.

## Automation rules
See [the rules](../config/rules.json): first reply within 120 minutes; nudges on day 3 and day 7, each waiting for the previous; gone quiet 3 days after the last nudge; up to 2 weddings a date; same venue on the same date blocked; open quotes on the same date shown as a warning; thank-you on day 14 after the wedding and one review reminder 7 days later.

## Edge cases
Enquiry with no date · exactly-on-target reply · reply logged before the enquiry (rejected by data test) · names in the other order · same phone with different spacing · future arrival time · date already passed · fractional or negative guests · quoting or booking a full date (blocked) · empty data · 2,000 enquiries.

## Error states
Missing data files show a plain message telling you to run `npm run dev`. Invalid form fields show inline errors and focus the first one. Impossible actions are refused with a message.

## White-label architecture and admin configuration
Everything client-specific lives in `config/rules.json`: company name, initial, colour, currency, locale, sender name, team, capacity, timings, channels and message templates.

## MVP boundaries
In: the four rules, the five screens, browser storage. Out: sending messages, inbox sync, multi-user, payments and vendor boards.
