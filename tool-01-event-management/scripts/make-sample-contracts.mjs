// Renders five fictional supplier contracts for the bulk-import demo into fixtures/contracts/.
// Dates are worked out from the seeded "Halden EMEA Customer Days" event, so the contracts
// always match the demo data (seed dates move with today's date). All names are invented.
//
// Usage: node scripts/make-sample-contracts.mjs            (reads the event from DATABASE_URL)
//        node scripts/make-sample-contracts.mjs 2027-01-20 (event start date, no database needed)
import "dotenv/config";
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import postgres from "postgres";

const OUT = "fixtures/contracts";

async function eventStart() {
  if (process.argv[2]) return process.argv[2];
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const [row] = await sql`select start_date::text as start from events where name = 'Halden EMEA Customer Days' limit 1`;
    if (!row) throw new Error("Seed the demo first (npm run db:seed), or pass the event start date: node scripts/make-sample-contracts.mjs 2027-01-20");
    return row.start;
  } finally {
    await sql.end();
  }
}

const start = await eventStart();
const day = (n) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};
const long = (n) => day(n).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const signed = long(-120);

const style = `<style>
body{font-family:Georgia,serif;font-size:10.5pt;line-height:1.45;margin:0;color:#111}
h1{font-size:15pt;margin:0 0 4pt} h2{font-size:11.5pt;margin:16pt 0 6pt}
table{border-collapse:collapse;width:100%;margin:6pt 0} td,th{border:1px solid #999;padding:3pt 6pt;text-align:left}
.page{page-break-after:always} p{margin:0 0 7pt} .small{font-size:9pt;color:#444}
</style>`;
const doc = (body) => `<!doctype html><html><head><meta charset="utf-8">${style}</head><body>${body}</body></html>`;
const party = `Northbeam Events Ltd ("the Agency"), acting as agent for its disclosed client Halden Robotics Inc., for the event known as Halden EMEA Customer Days ("the Event")`;

const contracts = [
  {
    file: "hotel-torre-azul-group-agreement.pdf",
    html: doc(`<div class="page">
<h1>Hotel Torre Azul Porto: Group Accommodation Agreement</h1>
<p>Agreement reference TAP-GRP-2207, made on ${signed} between Hotel Torre Azul Porto, Avenida da Boavista 1450, Porto ("the Hotel") and ${party}.</p>
<h2>1. Room block</h2>
<p>The Hotel will hold the following rooms at the group rate of EUR 164.00 per room per night, breakfast included, exclusive of city tax:</p>
<table><tr><th>Night of</th><th>Rooms</th><th>Rate</th></tr>
<tr><td>${long(-1)}</td><td>60</td><td>EUR 164.00</td></tr>
<tr><td>${long(0)}</td><td>180</td><td>EUR 164.00</td></tr>
<tr><td>${long(1)}</td><td>180</td><td>EUR 164.00</td></tr></table>
<p>1.2 Cut-off date. Reservations must be received by 6:00 pm local time on ${long(-28)}. Unreserved rooms will then return to general inventory.</p>
<p>1.3 Attrition. The Agency agrees to use at least eighty percent (80%) of the contracted rooms on each night. For each room night below this commitment the Agency will pay damages equal to 100% of the group rate.</p>
<p>1.4 Block review. On or before ${long(-45)} the Agency may reduce the room block by up to fifteen percent (15%) on any night without charge, by written notice.</p>
</div><div class="page">
<h2>2. Payment</h2>
<p>2.1 A deposit of EUR 18,000.00 is due on ${long(-90)}.</p>
<p>2.2 The balance of the estimated accommodation value is due on ${long(-14)}.</p>
<h2>3. Cancellation</h2>
<p>3.1 If the Agency cancels, the following charges apply, calculated on the total contracted room revenue:</p>
<table><tr><th>Written notice received</th><th>Charge</th></tr>
<tr><td>From signing until ${long(-61)}</td><td>25%</td></tr>
<tr><td>${long(-60)} until ${long(-31)}</td><td>60%</td></tr>
<tr><td>From ${long(-30)}</td><td>100%</td></tr></table>
<p>3.2 Deposits received will be credited against any cancellation charge.</p>
<p>3.3 The final rooming list must be received by ${long(-10)}.</p>
<p class="small">Signed for the Hotel: R. Tavares, Director of Group Sales. Signed for the Agency: J. Mendes, Operations Director.</p>
</div>`),
  },
  {
    file: "armazem-17-venue-hire.pdf",
    html: doc(`<div class="page">
<h1>Armazém 17: Venue Hire Agreement</h1>
<p>Booking A17-0931, made on ${signed} between Armazém 17 Eventos Lda, Rua do Cais 17, Porto ("the Venue") and ${party}.</p>
<h2>1. Hire</h2>
<p>The Venue grants exclusive use of the Main Hall and the River Room from 8:00 am on ${long(0)} until 11:00 pm on ${long(1)}, including set-up on ${long(-1)} from 2:00 pm.</p>
<p>1.2 The total hire fee is EUR 46,500.00, exclusive of VAT.</p>
<h2>2. Payment</h2>
<p>2.1 A booking deposit of 40% of the hire fee is due on ${long(-100)}.</p>
<p>2.2 The remaining 60% is due on ${long(-21)}.</p>
<h2>3. Cancellation</h2>
<p>3.1 Cancellation charges, as a percentage of the hire fee:</p>
<table><tr><th>Notice received</th><th>Charge</th></tr>
<tr><td>From signing until ${long(-91)}</td><td>40%</td></tr>
<tr><td>${long(-90)} until ${long(-31)}</td><td>75%</td></tr>
<tr><td>From ${long(-30)}</td><td>100%</td></tr></table>
<p>3.2 Payments already made are credited against cancellation charges.</p>
<p>3.3 Final floor plans and the running order must be provided by ${long(-7)}.</p>
<p class="small">Signed for the Venue: C. Lima, Commercial Manager. Signed for the Agency: J. Mendes.</p>
</div>`),
  },
  {
    file: "mesa-nortenha-catering.pdf",
    html: doc(`<div class="page">
<h1>Mesa Nortenha Catering: Event Catering Agreement</h1>
<p>Order MN-24-118, made on ${signed} between Mesa Nortenha Catering Lda ("the Caterer") and ${party}.</p>
<h2>1. Food and beverage</h2>
<p>1.1 The Caterer will provide lunches, coffee breaks and the welcome dinner as set out in Schedule A for an estimated 240 guests.</p>
<p>1.2 Minimum spend. The Agency agrees to a minimum food and beverage expenditure of EUR 52,000.00, exclusive of VAT. Any shortfall between actual expenditure and the minimum will be charged, plus a service charge of 10%.</p>
<p>1.3 Final numbers. The guaranteed number of guests for each function must be confirmed by 12:00 noon on ${long(-3)}. Charges will be based on the guaranteed number or the actual number served, whichever is greater.</p>
<h2>2. Payment</h2>
<p>2.1 A deposit of EUR 15,600.00 is due on ${long(-60)}.</p>
<p>2.2 The balance is due within 14 days of the Event, on ${long(15)}.</p>
<h2>3. Cancellation</h2>
<p>3.1 If the Agency cancels, the Caterer will charge the following percentage of the minimum spend:</p>
<table><tr><th>Notice received</th><th>Charge</th></tr>
<tr><td>From signing until ${long(-46)}</td><td>30%</td></tr>
<tr><td>From ${long(-45)}</td><td>80%</td></tr></table>
<p class="small">Signed for the Caterer: A. Rocha. Signed for the Agency: P. Nair, Senior Event Manager.</p>
</div>`),
  },
  {
    file: "lumen-stage-av-production.pdf",
    html: doc(`<div class="page">
<h1>Lumen Stage Productions: Audio-Visual Production Agreement</h1>
<p>Quote LSP-7740 accepted on ${signed}. Parties: Lumen Stage Productions, Porto ("the Supplier") and ${party}.</p>
<h2>1. Services</h2>
<p>1.1 Stage, lighting, sound, two LED screens, simultaneous translation for two languages, and crew for set-up on ${long(-1)} and both event days.</p>
<p>1.2 The production fee is EUR 38,900.00 plus VAT.</p>
<h2>2. Payment</h2>
<p>2.1 50% of the production fee on signature, due by ${long(-110)}.</p>
<p>2.2 50% of the production fee due on ${long(-10)}.</p>
<h2>3. Cancellation</h2>
<p>3.1 Charges on cancellation, as a percentage of the production fee:</p>
<table><tr><th>Notice received</th><th>Charge</th></tr>
<tr><td>From signing until ${long(-61)}</td><td>50%</td></tr>
<tr><td>From ${long(-60)}</td><td>100%</td></tr></table>
<p>3.2 The final technical rider and presentation files are due by ${long(-5)}.</p>
<p class="small">Signed for the Supplier: T. Faria. Signed for the Agency: J. Mendes.</p>
</div>`),
  },
];

// The "scanned" contract has no text layer: an image of the page inside a PDF, the way a signed
// paper contract comes back from a scanner. The importer must send it to manual entry.
const scanned = {
  file: "rota-norte-coaches-scanned.pdf",
  html: doc(`<div style="padding:40px;width:720px;background:#fbfaf6">
<h1>Rota Norte Coaches: Transfer Agreement</h1>
<p>Signed ${signed}. Rota Norte Transportes Lda and ${party}.</p>
<p>1. Four 50-seat coaches for airport transfers on ${long(-1)} and ${long(2)}, and an evening transfer on ${long(0)}.</p>
<p>2. Total price EUR 7,480.00. 30% deposit due ${long(-30)}; balance due ${long(7)}.</p>
<p>3. Cancellation: 30% from signing; 100% from ${long(-7)}.</p>
<p class="small">Signed: M. Sousa / J. Mendes</p></div>`),
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const c of contracts) {
  await page.setContent(c.html, { waitUntil: "load" });
  await page.pdf({ path: `${OUT}/${c.file}`, format: "A4", margin: { top: "18mm", bottom: "18mm", left: "20mm", right: "20mm" } });
  console.log(`${OUT}/${c.file}`);
}
await page.setViewportSize({ width: 800, height: 600 });
await page.setContent(scanned.html, { waitUntil: "load" });
const png = await page.locator("div").first().screenshot();
await page.setContent(
  `<!doctype html><html><body style="margin:0"><img style="width:100%;filter:grayscale(1) contrast(1.1)" src="data:image/png;base64,${png.toString("base64")}"></body></html>`,
  { waitUntil: "load" },
);
await page.pdf({ path: `${OUT}/${scanned.file}`, format: "A4", margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" } });
console.log(`${OUT}/${scanned.file} (image only, no text layer)`);
await browser.close();
console.log(`Dated for an event starting ${start}.`);
