// Takes the 2x screenshots in docs/screenshots. Needs `npm run start` on port 3003.
import { chromium } from 'playwright-core';
const out = new URL('../docs/screenshots/', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--lang=en-GB'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Europe/London' });
await p.goto('http://localhost:3003/today'); await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
const shots = [['1-today', '/today'], ['2-enquiries', '/enquiries'], ['3-record-sheet', '/enquiries?open=e02'], ['4-follow-ups', '/follow-ups'], ['5-referrals', '/referrals'], ['6-house-rules', '/settings']];
for (const [name, url] of shots) {
  await p.goto('http://localhost:3003' + url); await p.waitForTimeout(1300);
  await p.mouse.move(0, 899);
  await p.screenshot({ path: out + name + '.png' });
}
await b.close();
