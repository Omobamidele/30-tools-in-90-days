# Teaching Playbook · Wedding Enquiry Tracker

## 1. Industry research
Couples find planners on Instagram, directories, venue supplier lists and through past couples. Enquiries come by DM, WhatsApp, form and email, often in the evening.

## 2. GTM model
Inbound and referral-led. There is rarely a shortage of leads; the money is lost between the enquiry and the booking.

## 3. Workflow
Enquiry → reply → call → quote → follow-up → booked → wedding → thank-you and referral ask.

## 4. Bottleneck
Speed and follow-up, not lead volume. And no one owns the referral ask.

## 5. System design
Four rules, each one a plain date comparison: first reply within two hours; day 3 and day 7 nudges; can we take this date (capacity, planner, venue); thank-you on day 14. One "Today" list ranks what's due. Everything else is a filter on the same data.

## 6. Engineering
One HTML page, one rules file, JSON sample data, no framework, no backend. `src/rules.js` is pure functions, so the same code runs in the browser and in `node --test`. This is the Field Lab starter-kit pattern.

## 7. Automation
The system decides what's due and drafts the message. A person sends it. That's deliberate: DMs and WhatsApp have no reliable API for a small business, and a planner wants to read a message before it goes to a couple.

## 8. Commercialization
Honest answer: small budgets and strong incumbents. Use it to learn and to start conversations, not as a product.

## 9. White-labeling
Change `config/rules.json`: brand, team, weddings per date, timings, channels and the message templates.

## 10. Lesson
Most small businesses don't have a lead problem, they have a speed and follow-up problem. Before you build, check what the incumbent tool already does (here, HoneyBook does a lot), then find the one rule it doesn't know about this business.

---

## Rebuild it (about 3–4 hours)
Prerequisites: Node 20+, a browser. Steps: copy `config/`, write the four rule functions with tests first, then the Today screen, then the list and form.

## Exercise
Add venue-referral tracking: record which venue sent each couple, and show which venues sent the most bookings this year. Hand in the rule function, its tests and one screenshot.

## Extend it
1. A website-form webhook that writes enquiries into the list.
2. Weekend cover: if an enquiry arrives on Friday after 18:00, assign it to the planner on call.
3. A weekly email digest of overdue replies.

## Explain it in an interview
60 seconds: "Planners lose bookings to slow replies, not lack of leads. I wrote four date rules (reply target, day 3 and 7 nudges, date capacity, day 14 referral ask) and one ranked list that says who to message now, with a draft ready."
Practise: "Design a follow-up system for a business whose leads arrive on WhatsApp." A good answer covers intake without an API, the rules, who sends the message, and how you'd measure success.
