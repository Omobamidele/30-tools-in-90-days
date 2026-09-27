# 10 — Problem validation: is this a real problem?

**Written:** 2026-09-26 (milestone 13). **Question:** do event agencies really lose money on supplier contract penalties, often enough and in amounts large enough to pay for a system that tracks them?

**Short answer:**
- **The mechanism is real, common, and getting worse.** That part is verified.
- **Whether the pain is big enough to buy is not proven yet.** No public data says how often agencies actually pay penalties, or how much. That has to come from conversations, and this document includes the script for them.

---

## 1. What the evidence shows

### Verified: room blocks routinely under-fill, even when people attend
- A joint study by **ASAE, CEIR, the Destination & Travel Foundation, MPI and the PCMA Education Foundation**, conducted by Tourism Economics (an Oxford Economics company), looked at **170+ events and 880,000+ attendee records**.
- It found that **34.1% of group room nights are booked outside the contracted room block** on average ([TSNN summary](https://www.tsnn.com/event-planning/study-reveals-one-in-three-group-room-nights-are-booked-outside-room-block), [PCMA](https://www.pcma.org/room-block-study-why-convention-attendees-dont-book-room-block/)).
- A follow-up "Room Block of the Future" study put the figure at about half of attendees bypassing the block ([Northstar](https://www.northstarmeetingsgroup.com/Planning-Tips-and-Trends/Research-and-White-Papers/Study-Hotel-Room-Block-of-the-Future)).
- **Why it matters:** the attrition clause counts rooms booked *in the block*. An event can be full and still owe the hotel for "unused" rooms, because attendees booked elsewhere.
- **Limitation:** the data was collected in 2012–2015. Direction and scale are clear; the exact current figure is not.

### Verified: contracts are getting harsher, not softer
- **Per-night attrition.** Hotels increasingly charge attrition per night instead of across the whole stay, so one soft night costs money even if the event fills overall ([Northstar: negotiating in a seller's market](https://www.northstarmeetingsgroup.com/Planning-Tips-and-Trends/Event-Planning/Contracts-and-Legal-Issues/hotel-attrition-meetings-contracts-sellers-market-negotiation)).
- **Liquidated damages.** Penalties apply even if the hotel resells the rooms and loses nothing ([Travel Weekly, Mark Pestronk](https://www.travelweekly.com/Mark-Pestronk/With-group-bookings-penalties-apply-for-released-hotel-rooms)).
- **Cancellation charges step up** as the event gets closer, for example 50% → 70% → 90% of expected revenue ([Contract Nerds](https://contractnerds.com/3-key-clauses-to-negotiate-in-hotel-event-agreements/), [MPI](https://www.mpi.org/chapters/chicago-area/chapter-news/single-blog/c-c-articles/2018/06/26/what-to-know-about-cancellation-and-attrition)).
- The Exposure Register already models all three: per-night and cumulative bases, charges regardless of resale, and the cancellation staircase.

### Verified in principle: who pays depends on how the agency signed
- Under agency law, an agent who signs for a **disclosed** principal is generally not liable on the contract, but an agent who signs in its own name, or for an undisclosed client, can be.
- Whether the agency or the client carries a penalty therefore depends on the contract signature and the client agreement.
- That is exactly the "yours vs client's" split the product computes from each client agreement.
- **Limitation:** general legal principle, not event-specific case law. An agency's own lawyer confirms the position per contract.

### Weak evidence (not relied on)
- Figures such as "57% of agencies lose $1,000–$5,000 a month to unbilled scope changes" come from generic agency-finance blogs about marketing agencies, not event research.
- They are plausible for event agencies (change control exists in the product for this reason) but are **not** used as evidence here.

### Industry context (from the phase-1 research, docs/01)
- Agencies contract hotels, venues, caterers and AV on the client's behalf, and track obligations in spreadsheets and PDFs.
- There was no credible public data on agency margins or penalty frequency, the same gap as here.

---

## 2. What is still unproven

| Assumption | Why it matters | How to test it |
|---|---|---|
| Agencies pay penalties **several times a year**, at amounts that matter (e.g. over $10k per event) | If penalties are rare or tiny, the savings story is weak | Interviews §3, plus 12 months of post-event records |
| Penalties are **discovered late** (after cutoffs or review dates) | The product's value is acting earlier | Ask for the last penalty paid: when was it first noticed? |
| Nobody has a **portfolio number** today | The buyer's main reason to pay | Ask the MD or CFO to state it right now |
| Agencies **absorb** some penalties clients should carry | Makes the "yours vs client's" split worth money | Ask finance how disputes with clients are settled |
| Review dates and release rights go **unused** | The savings finder's value | Ask if they gave rooms back at the last review date |

**The in-product evidence loop.** After each event, the Post-event tab records projected vs actual penalties. After a quarter of real use, that record replaces these assumptions with the agency's own numbers.

---

## 3. Interview script (5 conversations, 30 minutes each)

**Who:**
- 2 × agency operations director or head of events
- 2 × agency finance lead or CFO
- 1 × hotel or DMC group-sales manager, as the other side of the table

**Rules:**
- Ask about the past, not the future ("tell me about the last time…", never "would you use…").
- Don't show the product until the last 5 minutes.
- Write down numbers and dates verbatim.

**Opening (all):**
1. How many events a year? How many supplier contracts per event?
2. Who signs supplier contracts: the agency, or the client with the agency as agent?

**Operations director:**

3. Tell me about the last time you paid an attrition, catering-minimum or cancellation charge. What was it, how much, and when did you first know it was coming?
4. Where do you track cutoffs, review dates and cancellation steps today? Show me if you can.
5. At the last review date, did you give any rooms back? Why or why not?
6. When the client changes the headcount or scope, what happens to the supplier contracts, and who prices it?

**Finance:**

7. If I asked you right now for the total penalties across all open events if nothing changes, how long would that take?
8. In the last year, how many penalties did the agency pay that it later argued the client should carry? How were they settled?
9. What was the largest single supplier penalty in the last two years?

**Hotel or DMC:**

10. How often do groups hit attrition? How often do they use their review or release dates?
11. What do the best-organised agencies do differently?

**Close (agency interviews):** show the overview for 5 minutes. Then ask: "What would you need to see to put your live contracts into this?"

---

## 4. Decision criteria

**Continue** if at least 3 of the 4 agency interviews report **all three** of these:
- a penalty over $5,000 in the last 12 months
- no single up-to-date view of penalties across events
- at least one review or release date missed or not used

**Pivot the pitch** (keep the product, change the lead message) if penalties are rare but scope changes are routinely absorbed. Change control then becomes the lead feature, with exposure second.

**Stop** if agencies consistently say penalties are negotiated away or are too small to matter, **and** the hotel side confirms that.

---

## 5. What this changed in the product (milestone 13)
- **Savings finder.** Review dates were already captured from contracts but only produced reminders. The system now works out how many rooms to give back and what that saves, and alerts 14 days ahead. This addresses the "review dates go unused" assumption directly.
- **Plain money.** The overview answers "what would it cost, and whose money is it?" in one sentence. That is the question the MD and CFO are asked to answer in interview question 7.
- **Monday money brief.** A weekly email gives the buyer the number without logging in, which also tests whether they care: do they open it?

## 6. The evidence loop (milestones 14–17)
The interview plan asks whether agencies actually pay penalties and how often. The product now collects that answer as a side effect of being used:
- **Money protected** counts only recorded decisions (room nights given back, amounts removed) and billed client changes, and compares finished events' projections with what suppliers actually charged.
- After one quarter with a pilot agency, that page *is* the validation data: how many alerts led to a decision, how much it removed, and how close projections came to real invoices.
- Decision criterion added: if a pilot records fewer than one money-removing decision per ten events in a quarter, the savings premise is weak for that segment, and the pitch should lead with portfolio visibility and client transparency instead.
