// Sample data and config: catches broken data before it reaches the screen.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { rules as loadRules, sample } from './helpers.js';
import { STATUSES } from '../lib/rules.js';

const rules = loadRules(), { enquiries, weddings, past } = sample();

test('every enquiry is well formed', () => {
  const ids = new Set();
  for (const e of enquiries) {
    assert.ok(!ids.has(e.id), 'duplicate id ' + e.id); ids.add(e.id);
    assert.ok(rules.channels[e.channel], e.id + ' channel');
    assert.ok(STATUSES.includes(e.status), e.id + ' status');
    if (e.firstReplyAt) assert.ok(e.firstReplyAt >= e.receivedAt, e.id + ' reply before enquiry');
    if (e.status === 'Quote sent') assert.ok(e.quoteSentOn, e.id + ' quote date');
    assert.ok((e.nudgesSent || []).length <= rules.followUp.nudgeDays.length);
  }
});
test('booked enquiries hold their date in the calendar', () => {
  for (const e of enquiries.filter((x) => x.status === 'Booked' && x.couple && x.receivedAt >= '2026-10-08'))
    assert.ok(weddings.some((w) => w.couple === e.couple && w.date === e.weddingDate), e.couple);
});
test('no date is over capacity and no venue is double-booked', () => {
  const by = {};
  for (const w of weddings) (by[w.date] ||= []).push(w);
  for (const [d, ws] of Object.entries(by)) {
    assert.ok(ws.length <= rules.capacity.maxWeddingsPerDate, d);
    assert.equal(new Set(ws.map((w) => w.venue)).size, ws.length, d + ' venue');
    assert.equal(new Set(ws.map((w) => w.planner)).size, ws.length, d + ' planner');
  }
});
test('referrals point at real past couples', () => {
  const names = new Set(past.map((p) => p.couple));
  for (const e of enquiries.filter((x) => x.referredBy)) assert.ok(names.has(e.referredBy), e.referredBy);
});
test('templates only use known placeholders', () => {
  const known = new Set(['firstNames', 'weddingDate', 'venue', 'sender', 'company', 'dateLine']);
  for (const [k, t] of Object.entries(rules.templates)) for (const [, v] of t.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(v), `${k}: {${v}}`);
});
test('sample data has no real-looking contact details', () => {
  for (const e of enquiries) if (e.contact) assert.match(e.contact, /^@|@example\.com$|^\+44 7700 900/, e.contact);
});
