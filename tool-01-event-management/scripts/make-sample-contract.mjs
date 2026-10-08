// Renders a fictional hotel group agreement to fixtures/sample-hotel-contract.pdf.
// Used by extraction tests and for demos. All names are invented.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:Georgia,serif;font-size:11pt;line-height:1.45;margin:0;color:#111}
h1{font-size:16pt;margin:0 0 4pt} h2{font-size:12pt;margin:18pt 0 6pt}
table{border-collapse:collapse;width:100%;margin:6pt 0} td,th{border:1px solid #999;padding:3pt 6pt;text-align:left}
.page{page-break-after:always} p{margin:0 0 7pt}
</style></head><body>
<div class="page">
<h1>Hotel Miradouro Porto: Group Sales Agreement</h1>
<p>Agreement reference MIR-GRP-3318. This agreement is made on 12 March 2027 between Hotel Miradouro Porto, Rua das Flores 88, Porto ("the Hotel") and Northbeam Events Ltd ("the Group"), acting on behalf of its client, for the event known as Halden Analytics Customer Summit ("the Event").</p>
<h2>1. Accommodation</h2>
<p>The Hotel agrees to hold the following guest rooms for the Group at the group rate of EUR 176.00 per room per night, exclusive of city tax:</p>
<table><tr><th>Night of</th><th>Rooms</th><th>Rate</th></tr>
<tr><td>14 October 2027</td><td>80</td><td>EUR 176.00</td></tr>
<tr><td>15 October 2027</td><td>150</td><td>EUR 176.00</td></tr>
<tr><td>16 October 2027</td><td>150</td><td>EUR 176.00</td></tr></table>
<p>1.2 Cut-off date. Reservations must be received by 5:00 pm local time on 13 September 2027. After the cut-off date, unreserved rooms will be released to general inventory.</p>
<p>1.3 Attrition. The Group agrees to utilize at least eighty-five percent (85%) of the contracted room block on each night. Should the actual pick-up fall below 85% on any night, the Group will pay attrition damages equal to 100% of the group rate for each room night below this commitment.</p>
<p>1.4 Review date. The Group may reduce the room block by up to 10% without penalty by giving written notice on or before 1 August 2027.</p>
</div>
<div class="page">
<h2>2. Food and Beverage</h2>
<p>2.1 The Group agrees to a minimum food and beverage expenditure of EUR 36,000.00, exclusive of service charge and tax. Any shortfall between the actual expenditure and this minimum will be charged to the Group, plus applicable service charge and taxes of 23%.</p>
<p>2.2 Final guarantee. The Group shall provide the final number of guaranteed covers for all functions no later than 12:00 noon local time on 11 October 2027. This number will be considered a guarantee and not subject to reduction.</p>
<h2>3. Payment</h2>
<p>3.1 A first deposit of 30% of the estimated total contract value of EUR 118,560.00 is due on 26 March 2027.</p>
<p>3.2 A second deposit of EUR 35,000.00 is due on 15 August 2027.</p>
<p>3.3 Deposits are non-refundable and will be credited against any cancellation charges.</p>
<h2>4. Cancellation</h2>
<p>4.1 Should the Group cancel this agreement, the following cancellation charges, calculated on the estimated total contract value, will apply:</p>
<table><tr><th>Notice received</th><th>Charge</th></tr>
<tr><td>From signing until 31 May 2027</td><td>20%</td></tr>
<tr><td>1 June 2027 until 31 August 2027</td><td>50%</td></tr>
<tr><td>From 1 September 2027</td><td>100%</td></tr></table>
<p>4.2 The rooming list must be submitted by 30 September 2027.</p>
<p>Signed for the Hotel: M. Azevedo, Director of Sales. Signed for the Group: J. Mendes, Operations Director.</p>
</div>
</body></html>`;

mkdirSync("fixtures", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.pdf({ path: "fixtures/sample-hotel-contract.pdf", format: "A4", margin: { top: "18mm", bottom: "18mm", left: "20mm", right: "20mm" } });
await browser.close();
console.log("fixtures/sample-hotel-contract.pdf");
