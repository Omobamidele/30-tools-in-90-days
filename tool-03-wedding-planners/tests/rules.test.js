import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules.js';
import { rules as loadRules, sample, NOW, enq } from './helpers.js';

const rules = loadRules();

describe('date helpers', () => {
  test('days across a month and a clock change', () => {
    assert.equal(R.addDays('2026-10-29', 3), '2026-11-01');
    assert.equal(R.daysBetween('2026-10-24T23:00', '2026-10-26T01:00'), 2);
    assert.equal(R.minutesBetween('2026-10-16T21:40', '2026-10-20T09:05'), 5005 + 0 * 60);
  });
  test('first names from either form of couple name', () => {
    assert.equal(R.firstNames('Maya Ellis & Sam Turner'), 'Maya & Sam');
    assert.equal(R.firstNames('  Maya &Sam '), 'Maya & Sam');
  });
  test('minutes read like a person would say them', () => {
    assert.equal(R.fmtMinutes(40), '40 min');
    assert.equal(R.fmtMinutes(120), '2 h');
    assert.equal(R.fmtMinutes(135), '2 h 15 min');
    assert.equal(R.fmtMinutes(3 * 1440 + 60), '3 d 1 h');
  });
});

describe('rule 1: first reply within the target', () => {
  test('on time, late, waiting and overdue', () => {
    assert.equal(R.replyState(enq({ firstReplyAt: '2026-10-20T09:59' }), NOW, rules).state, 'replied-on-time');
    assert.equal(R.replyState(enq({ firstReplyAt: '2026-10-20T10:01' }), NOW, rules).state, 'replied-late');
    assert.equal(R.replyState(enq({ receivedAt: '2026-10-20T08:00' }), NOW, rules).state, 'waiting');
    const r = R.replyState(enq({ receivedAt: '2026-10-20T07:15' }), NOW, rules);
    assert.equal(r.state, 'overdue'); assert.equal(r.minutes, 135);
  });
  test('exactly on the target counts as on time', () => {
    assert.equal(R.replyState(enq({ receivedAt: '2026-10-20T08:00', firstReplyAt: '2026-10-20T10:00' }), NOW, rules).state, 'replied-on-time');
    assert.equal(R.replyState(enq({ receivedAt: '2026-10-20T07:30' }), NOW, rules).state, 'waiting');
  });
  test('a closed enquiry with no reply is never put in the reply queue', () => {
    assert.equal(R.replyState(enq({ status: 'Lost', receivedAt: '2026-10-01T09:00' }), NOW, rules).state, 'closed');
  });
  test('the Friday-night DM answered on Tuesday is late', () => {
    const leah = sample().enquiries.find((e) => e.couple.startsWith('Leah'));
    const r = R.replyState(leah, NOW, rules);
    assert.equal(r.state, 'replied-late'); assert.ok(r.minutes > 3 * 1440);
  });
  test('target comes from config', () => {
    const strict = { ...rules, firstReply: { targetMinutes: 30 } };
    assert.equal(R.replyState(enq({ receivedAt: '2026-10-20T08:52' }), NOW, strict).state, 'overdue');
  });
});

describe('rule 2: date check', () => {
  const { weddings, enquiries } = sample();
  test('free date', () => assert.equal(R.dateCheck({ weddingDate: '2027-06-05' }, weddings, enquiries, rules).level, 'free'));
  test('one wedding booked, one planner free', () => {
    const c = R.dateCheck({ weddingDate: '2026-12-12' }, weddings, enquiries, rules);
    assert.equal(c.level, 'tight'); assert.match(c.message, /Free: Marcus Hale/);
  });
  test('same venue on a booked date is a clash even with a planner free', () => {
    const c = R.dateCheck({ weddingDate: '2026-12-12', venue: 'old mill barn' }, weddings, enquiries, rules);
    assert.equal(c.level, 'venue-clash');
  });
  test('two weddings on a date fills it', () => {
    assert.equal(R.dateCheck({ weddingDate: '2026-10-31', venue: 'Somewhere else' }, weddings, enquiries, rules).level, 'full');
  });
  test('capacity is configurable', () => {
    const solo = { ...rules, capacity: { ...rules.capacity, maxWeddingsPerDate: 1 } };
    assert.equal(R.dateCheck({ weddingDate: '2026-12-12' }, weddings, enquiries, solo).level, 'full');
    const allow = { ...rules, capacity: { ...rules.capacity, sameVenueSameDate: 'allow' } };
    assert.equal(R.dateCheck({ weddingDate: '2026-12-12', venue: 'Old Mill Barn' }, weddings, enquiries, allow).level, 'tight');
  });
  test('other open quotes for the same date are a warning, not a block, and exclude itself', () => {
    const list = [enq({ id: 'a', status: 'Quote sent', weddingDate: '2027-06-12' }), enq({ id: 'b', status: 'Quote sent', weddingDate: '2027-06-12' })];
    const c = R.dateCheck({ weddingDate: '2027-06-12', selfId: 'a' }, [], list, rules);
    assert.equal(c.level, 'free'); assert.equal(c.holds.length, 1); assert.match(c.message, /1 other quote out/);
  });
  test('no date yet', () => assert.equal(R.dateCheck({ weddingDate: null }, weddings, enquiries, rules).level, 'unknown'));
  test('empty calendar', () => assert.equal(R.dateCheck({ weddingDate: '2026-10-31' }, [], [], rules).level, 'free'));
});

describe('rule 3: day 3 and day 7 quote nudges', () => {
  const q = (o) => enq({ status: 'Quote sent', firstReplyAt: '2026-10-10T09:00', quoteSentOn: '2026-10-16', ...o });
  test('day 3 late, day 7 waits for it', () => {
    const f = R.followUpState(q(), NOW, rules);
    assert.equal(f.steps[0].state, 'late'); assert.equal(f.steps[0].daysLate, 1);
    assert.equal(f.steps[1].state, 'waiting'); assert.equal(f.next.day, 3);
  });
  test('due today and upcoming', () => {
    assert.equal(R.followUpState(q({ quoteSentOn: '2026-10-17' }), NOW, rules).next.state, 'due-today');
    assert.equal(R.followUpState(q({ quoteSentOn: '2026-10-19' }), NOW, rules).next.state, 'upcoming');
    assert.equal(R.followUpState(q({ quoteSentOn: '2026-10-13', nudgesSent: ['2026-10-16'] }), NOW, rules).next.state, 'due-today');
  });
  test('gone quiet only after the last nudge plus the wait', () => {
    assert.equal(R.followUpState(q({ quoteSentOn: '2026-10-09', nudgesSent: ['2026-10-12', '2026-10-16'] }), NOW, rules).goneQuiet, true);
    assert.equal(R.followUpState(q({ quoteSentOn: '2026-10-09', nudgesSent: ['2026-10-12', '2026-10-18'] }), NOW, rules).goneQuiet, false);
  });
  test('no follow-up without a quote, or once booked or lost', () => {
    assert.equal(R.followUpState(enq(), NOW, rules), null);
    assert.equal(R.followUpState(q({ status: 'Booked' }), NOW, rules), null);
  });
  test('nudge days come from config', () => {
    const r2 = { ...rules, followUp: { nudgeDays: [2, 5, 10], goneQuietAfterDays: 2 } };
    const f = R.followUpState(q({ quoteSentOn: '2026-10-18' }), NOW, r2);
    assert.equal(f.steps.length, 3); assert.equal(f.next.state, 'due-today');
  });
});

describe('rule 4: thank-you, review and referral ask', () => {
  const p = (o) => ({ id: 'p', couple: 'A B & C D', weddingDate: '2026-10-06', venue: 'V', thankYouSentOn: null, reviewNudgeSentOn: null, review: null, ...o });
  test('not before day 14', () => assert.equal(R.referralState(p({ weddingDate: '2026-10-07' }), NOW, rules).state, 'not-yet'));
  test('due on day 14, late after', () => {
    assert.equal(R.referralState(p(), NOW, rules).state, 'thank-you-due');
    assert.equal(R.referralState(p({ weddingDate: '2026-10-03' }), NOW, rules).daysLate, 3);
  });
  test('review reminder 7 days after the thank-you, once', () => {
    assert.equal(R.referralState(p({ thankYouSentOn: '2026-10-14' }), NOW, rules).state, 'waiting');
    assert.equal(R.referralState(p({ thankYouSentOn: '2026-10-13' }), NOW, rules).state, 'review-nudge-due');
    assert.equal(R.referralState(p({ thankYouSentOn: '2026-10-05', reviewNudgeSentOn: '2026-10-12' }), NOW, rules).state, 'asked-twice');
  });
  test('done once a review is in', () => assert.equal(R.referralState(p({ thankYouSentOn: '2026-10-05', review: '5 stars' }), NOW, rules).state, 'done'));
});

describe('the Today queue', () => {
  test('sample day: most urgent first, every rule represented', () => {
    const q = R.actionQueue(sample(), NOW, rules);
    assert.deepEqual(q.map((a) => [a.kind, a.who.split(' ')[0]]), [
      ['reply', 'Grace'], ['reply', 'Maya'], ['nudge', 'Amelia'], ['nudge', 'Freya'], ['quiet', 'Ruby'], ['thank-you', 'Lucy'], ['review-nudge', 'Aisha'],
    ]);
  });
  test('empty data gives an empty queue', () => assert.deepEqual(R.actionQueue({ enquiries: [], weddings: [], past: [] }, NOW, rules), []));
  test('a large book (2,000 enquiries) stays fast', () => {
    const many = Array.from({ length: 2000 }, (_, i) => enq({ id: 'm' + i, receivedAt: '2026-10-19T10:00', status: i % 2 ? 'Quote sent' : 'New', quoteSentOn: i % 2 ? '2026-10-15' : null, firstReplyAt: i % 2 ? '2026-10-19T10:05' : null }));
    const t = performance.now();
    const q = R.actionQueue({ enquiries: many, weddings: [], past: [] }, NOW, rules);
    assert.equal(q.length, 2000); assert.ok(performance.now() - t < 500);
  });
});

describe('month summary (what the post quotes)', () => {
  test('matches the numbers in post.md', () => {
    assert.deepEqual(R.monthSummary(sample().enquiries, NOW, rules), { total: 40, medianReplyMinutes: 40, slowOrNone: 12, booked: 5, bookedFromReferrals: 3 });
  });
  test('no enquiries', () => assert.equal(R.monthSummary([], NOW, rules).medianReplyMinutes, null));
});

describe('input checks and duplicates', () => {
  const ok = { couple: 'Ada & Tunde', channel: 'ig', receivedAt: '2026-10-20T09:00', weddingDate: '2027-01-01', guests: '80', budget: '20000' };
  test('a good enquiry passes', () => assert.deepEqual(R.validateEnquiry(ok, NOW, rules), {}));
  test('missing and wrong inputs', () => {
    const e = R.validateEnquiry({ couple: ' ', channel: 'fax', receivedAt: '2026-10-21T09:00', weddingDate: '2026-10-01', guests: '0', budget: '-5' }, NOW, rules);
    assert.deepEqual(Object.keys(e).sort(), ['budget', 'channel', 'couple', 'guests', 'receivedAt', 'weddingDate']);
    assert.ok(R.validateEnquiry({ ...ok, guests: '12.5' }, NOW, rules).guests);
    assert.ok(R.validateEnquiry({ ...ok, weddingDate: '2027-02-31x' }, NOW, rules).weddingDate);
    assert.ok(R.validateEnquiry({ ...ok, receivedAt: '' }, NOW, rules).receivedAt);
  });
  test('optional fields can be empty', () => assert.deepEqual(R.validateEnquiry({ ...ok, weddingDate: '', guests: '', budget: '' }, NOW, rules), {}));
  test('same couple in the other order is a duplicate', () => {
    const list = sample().enquiries;
    assert.equal(R.findDuplicate({ couple: 'sam turner & MAYA ELLIS' }, list)?.id, 'e01');
  });
  test('same handle on another channel is a duplicate', () => {
    assert.equal(R.findDuplicate({ couple: 'Someone New', contact: '+44 7700 900 123' }, sample().enquiries)?.id, 'e03');
  });
  test('short or empty contacts never match', () => assert.equal(R.findDuplicate({ couple: 'Nobody & Else', contact: '' }, sample().enquiries), null));
  test('newEnquiry trims and starts the history', () => {
    const e = R.newEnquiry({ ...ok, couple: '  Ada & Tunde ', venue: ' ' }, 'n1');
    assert.equal(e.couple, 'Ada & Tunde'); assert.equal(e.venue, null); assert.equal(e.guests, 80); assert.equal(e.status, 'New'); assert.equal(e.history.length, 1);
  });
});

describe('actions', () => {
  test('reply → quote → day 3 → day 7 → booked, without mutating the original', () => {
    const start = enq();
    let e = R.applyAction(start, 'reply', '2026-10-20T09:00');
    assert.equal(e.status, 'Replied'); assert.equal(start.status, 'New'); assert.equal(start.history.length, 0);
    e = R.applyAction(e, 'quote', '2026-10-20T15:00');
    assert.equal(e.quoteSentOn, '2026-10-20');
    e = R.applyAction(e, 'nudge', '2026-10-23T10:00'); e = R.applyAction(e, 'nudge', '2026-10-27T10:00');
    assert.deepEqual(e.nudgesSent, ['2026-10-23', '2026-10-27']);
    assert.deepEqual(e.history.map((h) => h.what), ['First reply sent', 'Quote sent', 'Day 3 nudge sent', 'Day 7 nudge sent']);
    e = R.applyAction(e, 'booked', '2026-10-28T10:00');
    assert.equal(e.status, 'Booked'); assert.equal(R.followUpState(e, '2026-11-30T09:00', rules), null);
  });
  test('impossible actions are refused', () => {
    assert.throws(() => R.applyAction(enq({ firstReplyAt: '2026-10-20T09:00' }), 'reply', NOW), /Already replied/);
    assert.throws(() => R.applyAction(enq(), 'nudge', NOW), /quotes that are out/);
    assert.throws(() => R.applyAction(enq({ status: 'Lost' }), 'quote', NOW));
    assert.throws(() => R.applyAction(enq(), 'delete', NOW), /Unknown/);
  });
  test('sending a quote counts as the first reply if none was logged', () => {
    assert.equal(R.applyAction(enq(), 'quote', '2026-10-20T09:10').firstReplyAt, '2026-10-20T09:10');
  });
  test('past-couple actions', () => {
    const p = R.applyPastAction({ thankYouSentOn: null }, 'thank-you', NOW);
    assert.equal(p.thankYouSentOn, '2026-10-20');
    assert.throws(() => R.applyPastAction({}, 'x', NOW));
  });
});

describe('message drafts', () => {
  const fmt = (d) => d;
  test('first reply mentions the date status', () => {
    const t = R.draftFor('reply', enq({ couple: 'Grace Lin & Owen Hart', weddingDate: '2026-10-31' }), { level: 'full' }, rules, fmt);
    assert.match(t, /^Hi Grace & Owen/); assert.match(t, /fully booked/); assert.match(t, /Elena, Juniper & Lane Weddings$/);
  });
  test('second nudge uses the day 7 text', () => {
    assert.match(R.draftFor('nudge', enq({ nudgesSent: ['2026-10-18'] }), null, rules, fmt), /hold it for you/);
  });
  test('missing values never leave {placeholders}', () => {
    const t = R.draftFor('reply', enq({ weddingDate: null }), null, rules, fmt);
    assert.doesNotMatch(t, /[{}]/); assert.match(t, /your big day/);
  });
});
