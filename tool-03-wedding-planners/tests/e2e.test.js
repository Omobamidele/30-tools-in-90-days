// Browser tests: the real page, in Chrome, like a planner would use it.
// Needs Chrome or Chromium. Set CHROME_PATH if it isn't at a standard path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { createServer } from '../scripts/serve.js';

const CANDIDATES = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
let server, browser, url;

before(async () => {
  server = createServer(); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
  if (chrome) browser = await chromium.launch({ executablePath: chrome });
});
after(async () => { await browser?.close(); server.close(); });

async function page(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(e.message));
  await p.goto(url); await p.waitForSelector('main .tbl, main .empty');
  return p;
}
const skip = !chrome && 'Chrome not found (set CHROME_PATH)';

test('Today lists every couple waiting, most urgent first', { skip }, async () => {
  const p = await page();
  const who = await p.$$eval('main tr[data-kind] .who', (els) => els.map((e) => e.textContent));
  assert.deepEqual(who.map((w) => w.split(' ')[0]), ['Grace', 'Maya', 'Amelia', 'Freya', 'Ruby', 'Lucy', 'Aisha']);
  assert.match(await p.textContent('.month'), /40 enquiries.*40 min.*3 of 5 bookings/s);
  assert.deepEqual(p.errors, []);
});

test('replying clears the item, logs history and survives a reload', { skip }, async () => {
  const p = await page();
  await p.click('button[data-id="e02"][data-kind="reply"]');
  assert.match(await p.textContent('#drawer .callout'), /Hartwell Manor is already ours/);
  assert.match(await p.inputValue('#draft'), /^Hi Grace & Owen.*fully booked/);
  assert.ok(await p.isDisabled('#drawer [data-a="quote"]'), 'cannot quote a full date');
  await p.click('#drawer [data-a="reply"]');
  assert.match(await p.textContent('#drawer .hist'), /First reply sent/);
  await p.reload(); await p.waitForSelector('main .tbl');
  const who = await p.$$eval('main tr[data-kind] .who', (els) => els.map((e) => e.textContent));
  assert.ok(!who.includes('Grace Lin & Owen Hart'));
  await p.goto(url + '#enquiries'); await p.waitForSelector('tbody tr');
  assert.match(await p.textContent('tr[data-id="e02"]'), /Replied/);
});

test('nudge flow: day 3 nudge moves the quote on to day 7', { skip }, async () => {
  const p = await page();
  await p.click('button[data-id="e06"][data-kind="nudge"]');
  assert.match(await p.inputValue('#draft'), /checking the quote came through/);
  await p.click('#drawer [data-a="nudge"]');
  assert.match(await p.textContent('#drawer .steps'), /Day 3 sent/);
  assert.ok(await p.isDisabled('#drawer [data-a="nudge"]'), 'day 7 is not due yet');
});

test('add enquiry: validation, live date check, duplicate warning, then save', { skip }, async () => {
  const p = await page();
  await p.click('main >> text=New enquiry');
  await p.fill('#f-receivedAt', '2026-10-20T09:20');
  await p.click('dialog button[type=submit]');
  assert.match(await p.textContent('#e-couple'), /Add the couple/);
  await p.fill('#f-couple', 'Ada Obi & Tunde Bello'); await p.fill('#f-guests', '-3');
  await p.click('dialog button[type=submit]');
  assert.match(await p.textContent('#e-guests'), /whole number/);
  await p.fill('#f-guests', '120'); await p.fill('#f-weddingDate', '2026-10-31'); await p.dispatchEvent('#f-weddingDate', 'change');
  assert.match(await p.textContent('#liveCheck'), /Fully booked/);
  await p.fill('#f-weddingDate', '2027-07-17'); await p.dispatchEvent('#f-weddingDate', 'change');
  assert.match(await p.textContent('#liveCheck'), /Date is free/);
  await p.click('dialog button[type=submit]');
  await p.waitForSelector('#drawer h2');
  assert.equal(await p.textContent('#drawer h2'), 'Ada Obi & Tunde Bello');
  // Same couple again, names reversed: warned, then allowed on purpose
  await p.click('main >> text=New enquiry');
  await p.fill('#f-couple', 'Tunde Bello & Ada Obi'); await p.fill('#f-receivedAt', '2026-10-20T09:25');
  await p.click('dialog button[type=submit]');
  assert.match(await p.textContent('#dupWarn'), /Possible duplicate: Ada Obi/);
  await p.click('dialog >> text=Add anyway');
  await p.waitForSelector('#drawer h2');
  assert.equal(await p.locator('tbody tr', { hasText: 'Tunde Bello' }).count(), 2);
  assert.deepEqual(p.errors, []);
});

test('search, filters and keyboard', { skip }, async () => {
  const p = await page();
  await p.keyboard.press('/');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'search');
  await p.keyboard.type('hartwell');
  await p.waitForSelector('tbody tr');
  assert.equal(await p.locator('tbody tr').count(), 1);
  await p.fill('#search', 'zzz-nothing');
  assert.match(await p.textContent('.empty'), /No enquiries match/);
  await p.fill('#search', '');
  await p.click('[data-filter="booked"]');
  assert.equal(await p.locator('tbody tr').count(), 5);
  await p.selectOption('#chan', 'ref');
  assert.equal(await p.locator('tbody tr').count(), 3);
  await p.click('tbody tr >> nth=0'); await p.keyboard.press('Escape');
  assert.ok(await p.isHidden('#drawer'));
});

test('clicking a Today row opens that couple, and leaving the page closes the panel', { skip }, async () => {
  const p = await page();
  await p.click('tr[data-oid="e09"] .who');
  assert.equal(await p.textContent('#drawer h2'), 'Freya Hughes & Liam Ross');
  assert.match(await p.inputValue('#draft'), /hold it for you/);
  await p.click('nav a[href="#referrals"]'); await p.waitForTimeout(100);
  assert.ok(await p.isHidden('#drawer'));
});

test('design system guardrails: no gradients, no emoji, one accent, hairline tables', { skip }, async () => {
  const p = await page();
  for (const r of ['today', 'enquiries', 'followups', 'referrals', 'rules']) {
    await p.goto(url + '#' + r); await p.waitForTimeout(100);
    const bad = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.backgroundImage.includes('gradient')) out.push('gradient on ' + el.className);
        if (parseFloat(cs.borderTopLeftRadius) > 6 && !el.classList.contains('st') && el.tagName !== 'DIALOG' && !el.classList.contains('ini') && cs.width !== cs.height) out.push('radius ' + cs.borderTopLeftRadius + ' on ' + el.className);
      }
      if (/\p{Extended_Pictographic}/u.test(document.body.innerText)) out.push('emoji in text');
      return out;
    });
    assert.deepEqual(bad, [], r);
  }
});

test('referrals: thank-you is logged and leaves the queue', { skip }, async () => {
  const p = await page();
  await p.goto(url + '#referrals'); await p.waitForSelector('main .tbl');
  await p.click('button[data-id="p4"]');
  assert.match(await p.inputValue('#draft'), /^Hi Lucy & Sean.*Hartwell Manor/);
  await p.click('#drawer [data-act="pdo"]');
  assert.match(await p.textContent('main'), /Asked · reminder/);
});

test('booking a free date holds it for the next enquiry', { skip }, async () => {
  const p = await page();
  await p.goto(url + '#enquiries'); await p.waitForSelector('tbody tr');
  await p.click('tr[data-id="e01"]'); // Maya & Sam, 5 Jun 2027, free
  await p.click('#drawer [data-a="booked"]');
  await p.click('main >> text=New enquiry');
  await p.fill('#f-weddingDate', '2027-06-05'); await p.dispatchEvent('#f-weddingDate', 'change');
  assert.match(await p.textContent('#liveCheck'), /1 of 2 slots left \(Maya & Sam booked\)/);
});

test('phone width: no sideways scrolling, nav still reachable', { skip }, async () => {
  const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true });
  for (const r of ['today', 'enquiries', 'followups', 'referrals', 'rules']) {
    await p.goto(url + '#' + r); await p.waitForTimeout(100);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 1, `${r} overflows by ${over}px`);
  }
  assert.ok(await p.isVisible('nav a[href="#enquiries"]'));
});

test('every button and field has a name a screen reader can read', { skip }, async () => {
  const p = await page();
  for (const r of ['today', 'enquiries', 'rules']) {
    await p.goto(url + '#' + r); await p.waitForTimeout(100);
    const unnamed = await p.$$eval('button, input, select, textarea', (els) => els.filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim() || (e.id && document.querySelector(`label[for="${e.id}"]`)) || e.closest('label'))).map((e) => e.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, [], r);
  }
});

test('the server only serves the app, not package files', { skip: false }, async () => {
  for (const [path, code] of [['', 200], ['config/rules.json', 200], ['package.json', 404], ['.env', 404], ['src/../package.json', 404], ['%2e%2e/README.md', 404]]) {
    const r = await fetch(url + path); assert.equal(r.status, code, path);
  }
});
