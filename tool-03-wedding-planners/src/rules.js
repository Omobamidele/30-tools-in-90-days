// Wedding Enquiry Tracker: the business rules.
// Pure functions only (no DOM, no storage), so the browser app and the tests use the same code.
// Times are local wall-clock strings: "YYYY-MM-DDTHH:MM" for moments, "YYYY-MM-DD" for dates.

const DAY = 86400000;

export const toMs = (t) => new Date(t.length === 10 ? t + 'T00:00' : t).getTime();
export const minutesBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / 60000);
const dateUTC = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const dateOf = (t) => t.slice(0, 10);
export const daysBetween = (a, b) => Math.round((dateUTC(dateOf(b)) - dateUTC(dateOf(a))) / DAY);
export const addDays = (d, n) => new Date(dateUTC(dateOf(d)) + n * DAY).toISOString().slice(0, 10);
export const firstNames = (couple) => couple.split('&').map((p) => p.trim().split(/\s+/)[0]).join(' & ');

export const OPEN_STATUSES = ['New', 'Replied', 'Quote sent'];
export const STATUSES = ['New', 'Replied', 'Quote sent', 'Gone quiet', 'Booked', 'Lost'];

// ---------- Rule 1: first reply ----------
// "replied-on-time" | "replied-late" | "waiting" (inside target) | "overdue" (past target, no reply)
export function replyState(enq, now, rules) {
  const target = rules.firstReply.targetMinutes;
  if (enq.firstReplyAt) {
    const m = minutesBetween(enq.receivedAt, enq.firstReplyAt);
    return { state: m <= target ? 'replied-on-time' : 'replied-late', minutes: m };
  }
  const m = Math.max(0, minutesBetween(enq.receivedAt, now));
  if (!OPEN_STATUSES.includes(enq.status)) return { state: 'closed', minutes: m };
  return { state: m > target ? 'overdue' : 'waiting', minutes: m, leftMinutes: Math.max(0, target - m) };
}

// ---------- Rule 2: date check (capacity + venue + open quotes) ----------
// level: "free" | "tight" | "full" | "venue-clash"
export function dateCheck({ weddingDate, venue, selfId }, weddings, enquiries, rules) {
  if (!weddingDate) return { level: 'unknown', booked: [], holds: [], message: 'No wedding date yet' };
  const max = rules.capacity.maxWeddingsPerDate;
  const booked = weddings.filter((w) => w.date === weddingDate);
  const holds = rules.capacity.holdWarningForOpenQuotes
    ? enquiries.filter((e) => e.id !== selfId && e.weddingDate === weddingDate && e.status === 'Quote sent')
    : [];
  const sameVenue = venue && booked.find((w) => w.venue.toLowerCase() === venue.toLowerCase());
  const names = booked.map((w) => firstNames(w.couple)).join(' and ');
  let level, message;
  if (sameVenue && rules.capacity.sameVenueSameDate === 'block') {
    level = 'venue-clash';
    message = `${venue} is already ours that day (${firstNames(sameVenue.couple)})`;
  } else if (booked.length >= max) {
    level = 'full';
    message = `Fully booked: ${names} ${booked.length === 1 ? 'has' : 'have'} this date`;
  } else if (booked.length > 0) {
    level = 'tight';
    const busy = new Set(booked.map((w) => w.planner));
    const free = rules.team.map((t) => t.name).filter((n) => !busy.has(n));
    message = `${max - booked.length} of ${max} slots left (${names} booked). Free: ${free.join(', ') || 'nobody'}`;
  } else {
    level = 'free';
    message = 'Date is free';
  }
  if (holds.length) message += `. ${holds.length} other quote${holds.length > 1 ? 's' : ''} out for this date`;
  return { level, booked, holds, message };
}

// ---------- Rule 3: quote follow-up ----------
// Nudges fall due N days after the quote. Each nudge waits for the one before it.
export function followUpState(enq, now, rules) {
  if (!enq.quoteSentOn || enq.status !== 'Quote sent') return null;
  const today = dateOf(now);
  const sent = enq.nudgesSent || [];
  const steps = rules.followUp.nudgeDays.map((d, i) => {
    const due = addDays(enq.quoteSentOn, d);
    if (sent[i]) return { day: d, due, state: 'sent', sentOn: sent[i] };
    if (i > 0 && !sent[i - 1]) return { day: d, due, state: 'waiting' };
    const diff = daysBetween(today, due);
    return { day: d, due, state: diff < 0 ? 'late' : diff === 0 ? 'due-today' : 'upcoming', daysLate: Math.max(0, -diff) };
  });
  const next = steps.find((s) => s.state !== 'sent') || null;
  const last = steps[steps.length - 1];
  const quietOn = last.state === 'sent' ? addDays(last.sentOn, rules.followUp.goneQuietAfterDays) : null;
  const goneQuiet = !!quietOn && daysBetween(quietOn, today) >= 0;
  return { steps, next, goneQuiet, quietOn };
}

// ---------- Rule 4: thank-you, review and referral ask ----------
export function referralState(p, now, rules) {
  const today = dateOf(now);
  const opensOn = addDays(p.weddingDate, rules.referral.askAfterDays);
  if (daysBetween(today, opensOn) > 0) return { state: 'not-yet', opensOn };
  if (!p.thankYouSentOn) return { state: 'thank-you-due', opensOn, daysLate: daysBetween(opensOn, today) };
  if (p.review) return { state: 'done', opensOn };
  const nudgeOn = addDays(p.thankYouSentOn, rules.referral.reviewNudgeAfterDays);
  if (p.reviewNudgeSentOn) return { state: 'asked-twice', opensOn };
  if (daysBetween(today, nudgeOn) <= 0) return { state: 'review-nudge-due', opensOn, nudgeOn };
  return { state: 'waiting', opensOn, nudgeOn };
}

// ---------- The "do this now" list ----------
// Order: overdue first replies, replies still inside target, late nudges, nudges due today, thank-yous, review nudges.
export function actionQueue(data, now, rules) {
  const out = [];
  for (const e of data.enquiries) {
    const r = replyState(e, now, rules);
    if (r.state === 'overdue') out.push({ rank: 0, kind: 'reply', id: e.id, who: e.couple, why: `Waiting ${fmtMinutes(r.minutes)} for a first reply (target ${fmtMinutes(rules.firstReply.targetMinutes)})`, minutes: r.minutes });
    else if (r.state === 'waiting') out.push({ rank: 1, kind: 'reply', id: e.id, who: e.couple, why: `New enquiry, ${fmtMinutes(r.leftMinutes)} left to reply inside target`, minutes: r.minutes });
    const f = followUpState(e, now, rules);
    if (f?.goneQuiet) out.push({ rank: 4, kind: 'quiet', id: e.id, who: e.couple, why: `No answer after the day ${f.steps.at(-1).day} nudge. Mark as gone quiet or call`, minutes: 0 });
    else if (f?.next && (f.next.state === 'late' || f.next.state === 'due-today'))
      out.push({ rank: f.next.state === 'late' ? 2 : 3, kind: 'nudge', id: e.id, who: e.couple, step: f.next.day, why: f.next.state === 'late' ? `Day ${f.next.day} quote nudge is ${f.next.daysLate} day${f.next.daysLate > 1 ? 's' : ''} late` : `Day ${f.next.day} quote nudge is due today`, minutes: f.next.daysLate || 0 });
  }
  for (const p of data.past) {
    const s = referralState(p, now, rules);
    if (s.state === 'thank-you-due') out.push({ rank: 5, kind: 'thank-you', id: p.id, who: p.couple, why: s.daysLate ? `Thank-you and referral ask ${s.daysLate} days late` : 'Thank-you and referral ask due today', minutes: s.daysLate });
    if (s.state === 'review-nudge-due') out.push({ rank: 6, kind: 'review-nudge', id: p.id, who: p.couple, why: 'No review yet, gentle reminder due', minutes: 0 });
  }
  return out.sort((a, b) => a.rank - b.rank || b.minutes - a.minutes);
}

// ---------- This month, in plain numbers ----------
export function monthSummary(enquiries, now, rules) {
  const month = dateOf(now).slice(0, 7);
  const inMonth = enquiries.filter((e) => e.receivedAt.startsWith(month));
  const replies = inMonth.filter((e) => e.firstReplyAt).map((e) => minutesBetween(e.receivedAt, e.firstReplyAt)).sort((a, b) => a - b);
  const median = replies.length ? (replies.length % 2 ? replies[(replies.length - 1) / 2] : Math.round((replies[replies.length / 2 - 1] + replies[replies.length / 2]) / 2)) : null;
  const slow = inMonth.filter((e) => ['replied-late', 'overdue'].includes(replyState(e, now, rules).state) || (!e.firstReplyAt && !OPEN_STATUSES.includes(e.status))).length;
  const booked = inMonth.filter((e) => e.status === 'Booked');
  return { total: inMonth.length, medianReplyMinutes: median, slowOrNone: slow, booked: booked.length, bookedFromReferrals: booked.filter((e) => e.channel === 'ref').length };
}

// ---------- Input checks ----------
export function validateEnquiry(input, now, rules) {
  const errors = {};
  const couple = (input.couple || '').trim();
  if (!couple) errors.couple = 'Add the couple’s names';
  else if (couple.length > 120) errors.couple = 'Keep names under 120 characters';
  if (!rules.channels[input.channel]) errors.channel = 'Choose where the enquiry came from';
  if (!input.receivedAt || isNaN(toMs(input.receivedAt))) errors.receivedAt = 'Add when it arrived';
  else if (toMs(input.receivedAt) > toMs(now) + 60000) errors.receivedAt = 'That time is in the future';
  if (input.weddingDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weddingDate) || isNaN(toMs(input.weddingDate))) errors.weddingDate = 'Use a real date';
    else if (daysBetween(now, input.weddingDate) < 0) errors.weddingDate = 'That date has already passed';
  }
  if (input.guests !== '' && input.guests != null && !(Number.isInteger(+input.guests) && +input.guests > 0 && +input.guests <= 2000)) errors.guests = 'Guests must be a whole number from 1 to 2,000';
  if (input.budget !== '' && input.budget != null && !(+input.budget >= 0)) errors.budget = 'Budget can’t be negative';
  return errors;
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9@+]/g, '');
const coupleKey = (c) => c.split('&').map((p) => norm(p)).sort().join('&');
// Same couple (in either order) or same contact handle = probably the same enquiry sent on two channels.
export function findDuplicate(input, enquiries) {
  const k = coupleKey(input.couple || '');
  const c = norm(input.contact);
  return enquiries.find((e) => (k && coupleKey(e.couple) === k) || (c.length > 4 && norm(e.contact) === c)) || null;
}

export function newEnquiry(input, id) {
  return {
    id, couple: input.couple.trim(), channel: input.channel, contact: (input.contact || '').trim(),
    receivedAt: input.receivedAt, weddingDate: input.weddingDate || null, venue: (input.venue || '').trim() || null,
    guests: input.guests ? +input.guests : null, budget: input.budget ? +input.budget : null,
    firstReplyAt: null, status: 'New', quoteSentOn: null, nudgesSent: [], referredBy: (input.referredBy || '').trim() || null,
    note: (input.note || '').trim(), history: [{ at: input.receivedAt, what: 'Enquiry received' }],
  };
}

// ---------- Actions (return a new record, never mutate) ----------
export function applyAction(enq, action, at) {
  const e = { ...enq, nudgesSent: [...(enq.nudgesSent || [])], history: [...(enq.history || [])] };
  const log = (what) => e.history.push({ at, what });
  switch (action) {
    case 'reply':
      if (e.firstReplyAt) throw new Error('Already replied');
      e.firstReplyAt = at; if (e.status === 'New') e.status = 'Replied'; log('First reply sent'); break;
    case 'quote':
      if (!['New', 'Replied'].includes(e.status)) throw new Error('A quote can only go to an open enquiry');
      if (!e.firstReplyAt) e.firstReplyAt = at;
      e.status = 'Quote sent'; e.quoteSentOn = dateOf(at); e.nudgesSent = []; log('Quote sent'); break;
    case 'nudge':
      if (e.status !== 'Quote sent') throw new Error('Nudges are for quotes that are out');
      e.nudgesSent.push(dateOf(at)); log(`Day ${[3, 7][e.nudgesSent.length - 1] ?? e.nudgesSent.length} nudge sent`); break;
    case 'booked': e.status = 'Booked'; log('Booked'); break;
    case 'lost': e.status = 'Lost'; log('Marked lost'); break;
    case 'quiet': e.status = 'Gone quiet'; log('Marked gone quiet'); break;
    default: throw new Error('Unknown action ' + action);
  }
  return e;
}

export function applyPastAction(p, action, at) {
  const q = { ...p };
  if (action === 'thank-you') q.thankYouSentOn = dateOf(at);
  else if (action === 'review-nudge') q.reviewNudgeSentOn = dateOf(at);
  else throw new Error('Unknown action ' + action);
  return q;
}

// ---------- Message drafts (the planner copies and sends them; nothing is sent automatically) ----------
export function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')).replace(/\s+/g, ' ').trim();
}
export function draftFor(kind, rec, check, rules, fmtDate) {
  const t = rules.templates;
  const vars = { firstNames: firstNames(rec.couple), weddingDate: rec.weddingDate ? fmtDate(rec.weddingDate) : 'your big day', venue: rec.venue || 'the venue', sender: rules.company.senderName, company: rules.company.name };
  if (kind === 'reply') {
    const line = !check || check.level === 'unknown' ? '' : check.level === 'free' ? t.dateFree : check.level === 'tight' ? t.dateTight : t.dateFull;
    return fillTemplate(t.firstReply, { ...vars, dateLine: line });
  }
  if (kind === 'nudge') return fillTemplate((rec.nudgesSent || []).length ? t.nudge7 : t.nudge3, vars);
  if (kind === 'thank-you') return fillTemplate(t.thankYou, vars);
  if (kind === 'review-nudge') return fillTemplate(t.reviewNudge, vars);
  return '';
}

export function fmtMinutes(m) {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; }
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
