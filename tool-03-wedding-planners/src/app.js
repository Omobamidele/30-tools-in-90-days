import * as R from './rules.js';

const STORE_KEY = 'wet:v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let rules, meta, data, view = { route: 'today', filter: 'open', channel: '', q: '', open: null };

// ---------- clock ----------
// The sample clock keeps every demo identical. Add ?clock=live to use the real time.
const live = new URLSearchParams(location.search).get('clock') === 'live';
const pad = (n) => String(n).padStart(2, '0');
const now = () => {
  if (!live) return meta.sampleClock;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d, year = true) => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString(rules.company.locale, { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const fmtWhen = (t) => `${fmtDate(t, false)}, ${t.slice(11, 16)}`;
const money = (n) => n == null ? '—' : new Intl.NumberFormat(rules.company.locale, { style: 'currency', currency: rules.company.currency, maximumFractionDigits: 0 }).format(n);
const COLORS = ['#0f7a70', '#8a5a9e', '#b4632b', '#2c5d9e', '#3f7d3a', '#a3416a', '#5b6b2e'];
const avatar = (name) => { const i = R.firstNames(name).split(' & ').map((n) => n[0]).join(''); const c = COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length]; return `<span class="av" style="background:${c}" aria-hidden="true">${esc(i)}</span>`; };

// ---------- data ----------
async function load() {
  const get = (p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); });
  [rules, meta] = await Promise.all([get('config/rules.json'), get('sample-data/meta.json')]);
  const saved = localStorage.getItem(STORE_KEY);
  if (saved) { try { data = JSON.parse(saved); } catch { data = null; } }
  if (!data) data = await sampleData(get);
}
async function sampleData(get) {
  const [enquiries, weddings, past] = await Promise.all([get('sample-data/enquiries.json'), get('sample-data/booked-weddings.json'), get('sample-data/past-couples.json')]);
  return { enquiries, weddings, past };
}
const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(data));
const byId = (id) => data.enquiries.find((e) => e.id === id);
const check = (e) => R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue, selfId: e.id }, data.weddings, data.enquiries, rules);
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); };

// ---------- small pieces ----------
function replyPill(e) {
  const r = R.replyState(e, now(), rules);
  if (r.state === 'replied-on-time') return `<span class="p g">Replied in ${R.fmtMinutes(r.minutes)}</span>`;
  if (r.state === 'replied-late') return `<span class="p a">Replied after ${R.fmtMinutes(r.minutes)}</span>`;
  if (r.state === 'overdue') return `<span class="p r">Not replied · ${R.fmtMinutes(r.minutes)}</span>`;
  if (r.state === 'waiting') return `<span class="p a">Not replied · ${R.fmtMinutes(r.minutes)}</span>`;
  return `<span class="p n">No reply logged</span>`;
}
const STATUS_TONE = { New: 'b', Replied: 't', 'Quote sent': 't', 'Gone quiet': 'n', Booked: 'g', Lost: 'n' };
const statusPill = (s) => `<span class="p ${STATUS_TONE[s] || 'n'}">${esc(s)}</span>`;
function checkLine(e) {
  const c = check(e);
  if (c.level === 'venue-clash' || c.level === 'full') return `<small class="warn">${esc(c.message)}</small>`;
  if (c.level === 'tight' || c.holds.length) return `<small class="tight">${esc(c.message)}</small>`;
  return '';
}
function nextStep(e) {
  const r = R.replyState(e, now(), rules);
  if (r.state === 'overdue' || r.state === 'waiting') return 'Send first reply';
  const f = R.followUpState(e, now(), rules);
  if (f?.goneQuiet) return 'No answer: call or close';
  if (f?.next) return f.next.state === 'late' ? `Day ${f.next.day} nudge, late` : f.next.state === 'due-today' ? `Day ${f.next.day} nudge today` : `Day ${f.next.day} nudge ${fmtDate(f.next.due, false)}`;
  if (e.status === 'Replied') return 'Send quote';
  return '—';
}
function stepChips(f) {
  return f.steps.map((s) => {
    const t = s.state === 'sent' ? ['g', `Day ${s.day} sent ${fmtDate(s.sentOn, false)}`] : s.state === 'late' ? ['r', `Day ${s.day} · ${s.daysLate} d late`] : s.state === 'due-today' ? ['a', `Day ${s.day} · due today`] : ['n', `Day ${s.day} · ${fmtDate(s.due, false)}`];
    return `<span class="p ${t[0]}">${t[1]}</span>`;
  }).join('');
}

// ---------- views ----------
function navHtml() {
  const q = R.actionQueue(data, now(), rules);
  const quotes = data.enquiries.filter((e) => e.status === 'Quote sent').length;
  const refs = q.filter((a) => a.kind === 'thank-you' || a.kind === 'review-nudge').length;
  const link = (r, label, n, hot) => `<a href="#${r}" ${view.route === r ? 'aria-current="page"' : ''}>${label}${n != null ? `<span class="n ${hot ? 'hot' : ''}">${n}</span>` : ''}</a>`;
  return `${link('today', 'Today', q.length, q.length > 0)}
  <div class="h">Pipeline</div>${link('enquiries', 'Enquiries', data.enquiries.filter((e) => R.OPEN_STATUSES.includes(e.status)).length)}${link('followups', 'Quote follow-ups', quotes)}${link('referrals', 'Referrals and reviews', refs, refs > 0)}
  <div class="h">Setup</div>${link('rules', 'House rules')}
  <div class="rules">First reply within ${R.fmtMinutes(rules.firstReply.targetMinutes)}<br>Nudges on day ${rules.followUp.nudgeDays.join(' and ')}<br>Up to ${rules.capacity.maxWeddingsPerDate} weddings a date<br>Thank-you ${rules.referral.askAfterDays} days after</div>`;
}

const ACTION_LABEL = { reply: 'Write reply', nudge: 'Write nudge', quiet: 'Open', 'thank-you': 'Write thank-you', 'review-nudge': 'Write reminder' };
function today() {
  const q = R.actionQueue(data, now(), rules);
  const s = R.monthSummary(data.enquiries, now(), rules);
  const groups = [['Reply first', q.filter((a) => a.kind === 'reply')], ['Follow up on quotes', q.filter((a) => a.kind === 'nudge' || a.kind === 'quiet')], ['Thank past couples', q.filter((a) => a.kind === 'thank-you' || a.kind === 'review-nudge')]];
  return `<div class="head"><div><h1>Good morning, ${esc(rules.company.senderName)}</h1><div class="sub">${q.length ? `${q.length} couple${q.length > 1 ? 's' : ''} need${q.length > 1 ? '' : 's'} something from you, most urgent first.` : 'Nothing is waiting on you.'}</div></div><button class="btn" data-act="add">Add enquiry</button></div>
  <p class="month">This month: <b>${s.total} enquiries</b>, median first reply <b>${R.fmtMinutes(s.medianReplyMinutes)}</b>, ${s.slowOrNone} waited over ${R.fmtMinutes(rules.firstReply.targetMinutes)} or got no reply, <b>${s.bookedFromReferrals} of ${s.booked} bookings</b> came from referrals.</p>
  ${groups.map(([title, items]) => `<section class="card" aria-label="${title}"><div class="hd">${title}<span>${items.length || 'none'}</span></div>
   ${items.length ? items.map((a) => {
     const rec = a.kind === 'thank-you' || a.kind === 'review-nudge' ? data.past.find((p) => p.id === a.id) : byId(a.id);
     const sub = rec.channel ? `${rules.channels[rec.channel]} · ${rec.weddingDate ? fmtDate(rec.weddingDate) : 'no date yet'}${rec.guests ? ` · ${rec.guests} guests` : ''}` : `Married ${fmtDate(rec.weddingDate)} · ${esc(rec.venue)}`;
     const urgent = a.rank === 0 || a.rank === 2 || a.kind === 'thank-you' && a.minutes > 0;
     return `<div class="item">${avatar(a.who)}<div class="tx"><b>${esc(a.who)}</b><small>${esc(sub)}</small>${rec.channel ? checkLine(rec) : ''}</div><span class="p ${urgent ? 'r' : 'a'}">${esc(a.why)}</span><div class="acts"><button class="btn sm ${urgent ? '' : 'o'}" data-act="open" data-kind="${a.kind}" data-id="${a.id}">${ACTION_LABEL[a.kind]}</button></div></div>`;
   }).join('') : `<div class="empty">All clear here.</div>`}</section>`).join('')}`;
}

function filtered() {
  const q = view.q.trim().toLowerCase();
  return data.enquiries.filter((e) => {
    if (view.channel && e.channel !== view.channel) return false;
    if (view.filter === 'open' && !R.OPEN_STATUSES.includes(e.status)) return false;
    if (view.filter === 'reply' && !['overdue', 'waiting'].includes(R.replyState(e, now(), rules).state)) return false;
    if (view.filter === 'booked' && e.status !== 'Booked') return false;
    if (view.filter === 'closed' && !['Lost', 'Gone quiet'].includes(e.status)) return false;
    if (q && ![e.couple, e.venue, e.contact, e.note, e.referredBy].some((x) => (x || '').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => R.toMs(b.receivedAt) - R.toMs(a.receivedAt));
}
function enquiries() {
  const list = filtered();
  const tab = (k, l) => `<button data-filter="${k}" aria-pressed="${view.filter === k}">${l}</button>`;
  return `<div class="head"><div><h1>Enquiries</h1><div class="sub">Every channel in one list. Newest first.</div></div><button class="btn" data-act="add">Add enquiry</button></div>
  <div class="tabs" role="group" aria-label="Filter">${tab('open', 'Open')}${tab('reply', 'Needs a reply')}${tab('booked', 'Booked')}${tab('closed', 'Lost or quiet')}${tab('all', 'All')}
   <label class="sr" for="chan">Channel</label><select id="chan"><option value="">All channels</option>${Object.entries(rules.channels).map(([k, v]) => `<option value="${k}" ${view.channel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="card">${list.length ? `<table><thead><tr><th>Couple</th><th>Wedding</th><th>First reply</th><th>Status</th><th>Next step</th></tr></thead><tbody>
  ${list.map((e) => `<tr data-id="${e.id}" class="${view.open === e.id ? 'sel' : ''}"><td><button class="lnk" data-act="open" data-id="${e.id}">${esc(e.couple)}</button><small>${rules.channels[e.channel]} · ${fmtWhen(e.receivedAt)}</small></td>
   <td>${e.weddingDate ? fmtDate(e.weddingDate) : '<span class="p n">No date yet</span>'}<small>${[e.venue, e.guests && `${e.guests} guests`, e.budget && money(e.budget)].filter(Boolean).map(esc).join(' · ')}</small>${checkLine(e)}</td>
   <td>${replyPill(e)}</td><td>${statusPill(e.status)}</td><td>${esc(nextStep(e))}</td></tr>`).join('')}</tbody></table>`
  : `<div class="empty"><b>No enquiries match</b>${view.q ? `Nothing for “${esc(view.q)}”. ` : ''}Try another filter, or add the enquiry.</div>`}</div>`;
}

function followups() {
  const list = data.enquiries.filter((e) => e.status === 'Quote sent').map((e) => [e, R.followUpState(e, now(), rules)]).sort((a, b) => (a[1].next?.due || '9').localeCompare(b[1].next?.due || '9'));
  return `<div class="head"><div><h1>Quote follow-ups</h1><div class="sub">Every quote gets a nudge on day ${rules.followUp.nudgeDays.join(' and day ')}. ${rules.followUp.goneQuietAfterDays} days after the last one with no answer, it's flagged as gone quiet.</div></div></div>
  <div class="card"><div class="hd">Quotes out<span>${list.length}</span></div>${list.length ? list.map(([e, f]) => `<div class="item">${avatar(e.couple)}<div class="tx"><b>${esc(e.couple)}</b><small>Quote sent ${fmtDate(e.quoteSentOn, false)} · wedding ${fmtDate(e.weddingDate)}</small></div>
   <div class="steps">${stepChips(f)}${f.goneQuiet ? '<span class="p r">Gone quiet?</span>' : ''}</div><div class="acts"><button class="btn sm ${f.next && ['late', 'due-today'].includes(f.next.state) ? '' : 'o'}" data-act="open" data-kind="nudge" data-id="${e.id}">Open</button></div></div>`).join('') : '<div class="empty"><b>No quotes out</b>Quotes you send appear here with their nudge dates.</div>'}</div>`;
}

const REF_PILL = { 'not-yet': (s) => ['n', `Ask opens ${fmtDate(s.opensOn, false)}`], 'thank-you-due': (s) => ['r', s.daysLate ? `Thank-you ${s.daysLate} d late` : 'Thank-you due today'], waiting: (s) => ['t', `Asked · reminder ${fmtDate(s.nudgeOn, false)}`], 'review-nudge-due': () => ['a', 'Review reminder due'], 'asked-twice': () => ['n', 'Asked twice, leave it'], done: () => ['g', 'Review received'] };
function referrals() {
  const rows = [...data.past].sort((a, b) => a.weddingDate.localeCompare(b.weddingDate));
  const fromRefs = data.enquiries.filter((e) => e.referredBy);
  return `<div class="head"><div><h1>Referrals and reviews</h1><div class="sub">${rules.referral.askAfterDays} days after the wedding, the couple gets a thank-you with a review and referral ask. One gentle reminder ${rules.referral.reviewNudgeAfterDays} days later, then we leave it.</div></div></div>
  <div class="card"><div class="hd">Past couples<span>${rows.length}</span></div>${rows.map((p) => { const s = R.referralState(p, now(), rules); const [t, l] = REF_PILL[s.state](s); const sent = fromRefs.filter((e) => e.referredBy === p.couple);
   return `<div class="item">${avatar(p.couple)}<div class="tx"><b>${esc(p.couple)}</b><small>Married ${fmtDate(p.weddingDate)} · ${esc(p.venue)}${p.review ? ` · ${esc(p.review)}` : ''}${sent.length ? ` · referred ${sent.map((e) => esc(R.firstNames(e.couple))).join(', ')}` : ''}</small></div><span class="p ${t}">${l}</span>
   <div class="acts">${s.state === 'thank-you-due' || s.state === 'review-nudge-due' ? `<button class="btn sm" data-act="open" data-kind="${s.state === 'thank-you-due' ? 'thank-you' : 'review-nudge'}" data-id="${p.id}">Write message</button>` : ''}</div></div>`; }).join('')}</div>
  <div class="card"><div class="hd">Enquiries that came from a referral<span>${fromRefs.length}</span></div>${fromRefs.map((e) => `<div class="item"><div class="tx"><b>${esc(e.couple)}</b><small>Referred by ${esc(e.referredBy)} · ${fmtDate(e.receivedAt)}</small></div>${statusPill(e.status)}</div>`).join('') || '<div class="empty">None yet.</div>'}</div>`;
}

function rulesView() {
  const r = rules, rows = [
    ['Company', `${r.company.name} (messages signed “${r.company.senderName}”)`],
    ['Team', r.team.map((t) => `${t.name}, ${t.role}`).join(' · ')],
    ['Weddings per date', `Up to ${r.capacity.maxWeddingsPerDate}. Same venue on the same date: ${r.capacity.sameVenueSameDate === 'block' ? 'blocked' : 'allowed'}. Open quotes on the same date: ${r.capacity.holdWarningForOpenQuotes ? 'shown as a warning' : 'ignored'}`],
    ['First reply', `Within ${R.fmtMinutes(r.firstReply.targetMinutes)} of the enquiry arriving, evenings and weekends included`],
    ['Quote nudges', `Day ${r.followUp.nudgeDays.join(' and day ')} after the quote; flagged as gone quiet ${r.followUp.goneQuietAfterDays} days after the last nudge`],
    ['Thank-you and referral ask', `${r.referral.askAfterDays} days after the wedding; one review reminder ${r.referral.reviewNudgeAfterDays} days later`],
    ['Channels', Object.values(r.channels).join(' · ')],
  ];
  return `<div class="head"><div><h1>House rules</h1><div class="sub">Set in <code>config/rules.json</code>. Change them there to fit another planning company.</div></div><button class="btn q" data-act="reset">Reset sample data</button></div>
  <div class="card"><div class="cfg">${rows.map(([k, v]) => `<div class="k">${k}</div><div>${esc(v)}</div>`).join('')}</div></div>
  <div class="card"><div class="hd">Message templates<span>drafts only: you copy them into WhatsApp, Instagram or email</span></div>${Object.entries(r.templates).filter(([k]) => !k.startsWith('date')).map(([k, v]) => `<div class="item"><div class="tx"><b>${k}</b><small>${esc(v)}</small></div></div>`).join('')}</div>`;
}

// ---------- drawer ----------
function drawer() {
  const el = $('#drawer');
  if (!view.open) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const { id, kind } = view.open;
  if (kind === 'thank-you' || kind === 'review-nudge') return pastDrawer(el, data.past.find((p) => p.id === id), kind);
  const e = byId(id); if (!e) { view.open = null; return drawer(); }
  const c = check(e), r = R.replyState(e, now(), rules), f = R.followUpState(e, now(), rules);
  const tone = { 'venue-clash': 'r', full: 'r', tight: 'a', free: 'g', unknown: 'n' }[c.level];
  let draftKind = null, primary = '';
  if (r.state === 'overdue' || r.state === 'waiting') { draftKind = 'reply'; primary = `<button class="btn" data-act="do" data-a="reply" data-id="${e.id}">Mark reply as sent</button>`; }
  else if (f?.next && f.next.state !== 'waiting' && !f.goneQuiet) { draftKind = 'nudge'; primary = `<button class="btn" data-act="do" data-a="nudge" data-id="${e.id}" ${f.next.state === 'upcoming' ? 'disabled title="Not due yet"' : ''}>Mark day ${f.next.day} nudge as sent</button>`; }
  const actions = [];
  if (['New', 'Replied'].includes(e.status)) actions.push(`<button class="btn o" data-act="do" data-a="quote" data-id="${e.id}" ${['full', 'venue-clash'].includes(c.level) ? 'disabled title="Date is not available"' : ''}>Quote sent</button>`);
  if (R.OPEN_STATUSES.includes(e.status) || e.status === 'Gone quiet') actions.push(`<button class="btn o" data-act="do" data-a="booked" data-id="${e.id}" ${['full', 'venue-clash'].includes(c.level) || !e.weddingDate ? 'disabled' : ''}>Booked</button>`);
  if (f?.goneQuiet) actions.push(`<button class="btn q" data-act="do" data-a="quiet" data-id="${e.id}">Mark gone quiet</button>`);
  if (R.OPEN_STATUSES.includes(e.status)) actions.push(`<button class="btn q" data-act="do" data-a="lost" data-id="${e.id}">Lost</button>`);
  el.innerHTML = `<button class="x" data-act="close" aria-label="Close">×</button><h2>${esc(e.couple)}</h2><div class="sub">${rules.channels[e.channel]}${e.contact ? ` · ${esc(e.contact)}` : ''}</div>
  <div class="row">${statusPill(e.status)}${replyPill(e)}</div>
  <dl class="facts"><dt>Wedding date</dt><dd>${e.weddingDate ? fmtDate(e.weddingDate) : 'Not given yet'}</dd><dt>Venue</dt><dd>${esc(e.venue || 'Not chosen')}</dd><dt>Guests</dt><dd>${e.guests ?? '—'}</dd><dt>Budget</dt><dd>${money(e.budget)}</dd><dt>Arrived</dt><dd>${fmtWhen(e.receivedAt)}</dd>${e.referredBy ? `<dt>Referred by</dt><dd>${esc(e.referredBy)}</dd>` : ''}${e.note ? `<dt>Note</dt><dd>${esc(e.note)}</dd>` : ''}</dl>
  <div class="callout ${tone}"><b>Date check:</b> ${esc(c.message)}${c.booked.length ? `<br><small>${c.booked.map((w) => `${esc(w.couple)} at ${esc(w.venue)} (${esc(w.planner)})`).join('<br>')}</small>` : ''}</div>
  ${f ? `<div class="sec">Follow-up</div><div class="steps">${stepChips(f)}</div>` : ''}
  ${draftKind ? `<div class="sec">Draft message</div><label class="sr" for="draft">Draft message</label><textarea id="draft">${esc(R.draftFor(draftKind, e, c, rules, fmtDate))}</textarea><div class="row"><button class="btn q" data-act="copy">Copy</button>${primary}</div>` : ''}
  ${actions.length ? `<div class="sec">Update</div><div class="row">${actions.join('')}</div>` : ''}
  <div class="sec">History</div><ul class="hist">${[...e.history].reverse().map((h) => `<li>${esc(h.what)}<small>${fmtWhen(h.at)}</small></li>`).join('')}</ul>`;
}
function pastDrawer(el, p, kind) {
  const s = R.referralState(p, now(), rules);
  const can = (kind === 'thank-you' && s.state === 'thank-you-due') || (kind === 'review-nudge' && s.state === 'review-nudge-due');
  el.innerHTML = `<button class="x" data-act="close" aria-label="Close">×</button><h2>${esc(p.couple)}</h2><div class="sub">Married ${fmtDate(p.weddingDate)} · ${esc(p.venue)}</div>
  <div class="sec">Draft message</div><label class="sr" for="draft">Draft message</label><textarea id="draft">${esc(R.draftFor(kind, p, null, rules, fmtDate))}</textarea>
  <div class="row"><button class="btn q" data-act="copy">Copy</button><button class="btn" data-act="pdo" data-a="${kind}" data-id="${p.id}" ${can ? '' : 'disabled'}>Mark as sent</button></div>`;
}

// ---------- add enquiry ----------
function addForm(values = {}, errors = {}, dup = null) {
  const v = { channel: 'ig', receivedAt: now(), ...values };
  const f = (name, label, input, cls = '') => `<div class="f ${cls}"><label for="f-${name}">${label}</label>${input}${errors[name] ? `<span class="err" id="e-${name}">${errors[name]}</span>` : ''}</div>`;
  const inp = (name, type = 'text', extra = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(v[name] ?? '')}" ${errors[name] ? `aria-invalid="true" aria-describedby="e-${name}"` : ''} ${extra}>`;
  const c = v.weddingDate && !errors.weddingDate ? R.dateCheck({ weddingDate: v.weddingDate, venue: v.venue }, data.weddings, data.enquiries, rules) : null;
  $('#addDialog').innerHTML = `<form method="dialog" id="addFormEl" novalidate><h2 id="addTitle">Add enquiry</h2><div class="sub">Paste it in from Instagram, WhatsApp, email or the website form.</div>
  <div class="grid">${f('couple', 'Couple’s names', inp('couple', 'text', 'placeholder="e.g. Maya Ellis & Sam Turner" required'), 'full')}
  ${f('channel', 'Came in by', `<select id="f-channel" name="channel">${Object.entries(rules.channels).map(([k, l]) => `<option value="${k}" ${v.channel === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
  ${f('receivedAt', 'Arrived', inp('receivedAt', 'datetime-local'))}
  ${f('contact', 'Handle, phone or email', inp('contact'))}${f('referredBy', 'Referred by (if any)', inp('referredBy'))}
  ${f('weddingDate', 'Wedding date', inp('weddingDate', 'date'))}${f('venue', 'Venue', inp('venue', 'text', 'list="venues"'))}
  ${f('guests', 'Guests', inp('guests', 'number', 'min="1" inputmode="numeric"'))}${f('budget', `Budget (${rules.company.currency})`, inp('budget', 'number', 'min="0" step="500"'))}
  ${f('note', 'Note', `<textarea id="f-note" name="note">${esc(v.note || '')}</textarea>`, 'full')}</div>
  <datalist id="venues">${[...new Set(data.weddings.map((w) => w.venue))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
  ${c ? `<div class="callout ${{ 'venue-clash': 'r', full: 'r', tight: 'a', free: 'g' }[c.level]}" id="liveCheck"><b>Date check:</b> ${esc(c.message)}</div>` : ''}
  ${dup ? `<div class="callout a" id="dupWarn"><b>Possible duplicate:</b> ${esc(dup.couple)} came in by ${rules.channels[dup.channel]} on ${fmtWhen(dup.receivedAt)}. <button type="button" class="btn sm o" data-act="open-dup" data-id="${dup.id}">Open it</button></div>` : ''}
  <div class="foot"><button type="button" class="btn q" data-act="cancel-add">Cancel</button><button type="submit" class="btn" value="save">${dup ? 'Add anyway' : 'Add enquiry'}</button></div></form>`;
}
const formValues = () => Object.fromEntries(new FormData($('#addFormEl')).entries());

// ---------- render + events ----------
function render() {
  $('#nav').innerHTML = navHtml();
  const views = { today, enquiries, followups, referrals, rules: rulesView };
  $('#app').innerHTML = (views[view.route] || today)();
  drawer();
}
function route() { view.route = (location.hash.slice(1) || 'today'); render(); }

function act(e, a, at) {
  try {
    const i = data.enquiries.findIndex((x) => x.id === e.id);
    const next = R.applyAction(e, a, at);
    data.enquiries[i] = next;
    if (a === 'booked' && !data.weddings.some((w) => w.enquiryId === e.id || w.couple === e.couple)) data.weddings.push({ id: 'w-' + e.id, enquiryId: e.id, couple: e.couple, date: e.weddingDate, venue: e.venue || 'Venue to confirm', planner: R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue }, data.weddings, [], rules).level === 'tight' ? rules.team.map((t) => t.name).find((n) => !data.weddings.some((w) => w.date === e.weddingDate && w.planner === n)) : rules.team[0].name });
    save(); render();
    toast({ reply: 'Reply logged', quote: 'Quote logged. Day 3 nudge scheduled', nudge: 'Nudge logged', booked: 'Booked. The date is now held', lost: 'Marked lost', quiet: 'Marked gone quiet' }[a]);
  } catch (err) { toast(err.message); }
}

function bind() {
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-act],[data-filter],tbody tr[data-id]');
    if (!t) return;
    if (t.dataset.filter) { view.filter = t.dataset.filter; return render(); }
    const a = t.dataset.act;
    if (!a && t.matches('tr')) { view.open = { id: t.dataset.id }; return render(); }
    if (a === 'open') { view.open = { id: t.dataset.id, kind: t.dataset.kind }; render(); $('#drawer h2')?.setAttribute('tabindex', '-1'); $('#drawer h2')?.focus(); }
    if (a === 'close') { view.open = null; render(); }
    if (a === 'do') act(byId(t.dataset.id), t.dataset.a, now());
    if (a === 'pdo') { const i = data.past.findIndex((p) => p.id === t.dataset.id); data.past[i] = R.applyPastAction(data.past[i], t.dataset.a, now()); view.open = null; save(); render(); toast('Logged as sent'); }
    if (a === 'copy') { const txt = $('#draft').value; try { await navigator.clipboard.writeText(txt); toast('Copied. Paste it into the chat'); } catch { $('#draft').select(); toast('Select and copy the text'); } }
    if (a === 'add') { addForm(); $('#addDialog').showModal(); $('#f-couple').focus(); }
    if (a === 'cancel-add') $('#addDialog').close();
    if (a === 'open-dup') { $('#addDialog').close(); view.open = { id: t.dataset.id }; render(); }
    if (a === 'reset') { if (confirm('Reset to the sample data? Your changes in this browser will be lost.')) { localStorage.removeItem(STORE_KEY); data = await sampleData((p) => fetch(p).then((r) => r.json())); view.open = null; render(); toast('Sample data restored'); } }
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.id === 'chan') { view.channel = ev.target.value; render(); }
    if (ev.target.closest('#addFormEl') && ['weddingDate', 'venue'].includes(ev.target.name)) { const v = formValues(); const focus = ev.target.name; addForm(v, R.validateEnquiry(v, now(), rules).weddingDate ? { weddingDate: R.validateEnquiry(v, now(), rules).weddingDate } : {}); $('#f-' + focus).focus(); }
  });
  document.addEventListener('submit', (ev) => {
    if (ev.target.id !== 'addFormEl') return;
    ev.preventDefault();
    const v = formValues(), errors = R.validateEnquiry(v, now(), rules);
    if (Object.keys(errors).length) { addForm(v, errors); $(`[aria-invalid=true]`)?.focus(); return; }
    const dup = R.findDuplicate(v, data.enquiries);
    if (dup && !ev.target.dataset.confirmed && !$('#dupWarn')) { addForm(v, {}, dup); $('#addFormEl').dataset.confirmed = ''; return; }
    const id = 'e' + Date.now().toString(36);
    data.enquiries.push(R.newEnquiry(v, id));
    save(); $('#addDialog').close(); view.route = 'enquiries'; view.filter = 'open'; view.open = { id }; location.hash = 'enquiries'; render(); toast('Enquiry added');
  });
  $('#search').addEventListener('input', (ev) => { view.q = ev.target.value; if (view.route !== 'enquiries') { view.filter = 'all'; location.hash = 'enquiries'; } else render(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && view.open && !$('#addDialog').open) { view.open = null; render(); }
    if (ev.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { ev.preventDefault(); $('#search').focus(); }
  });
  addEventListener('hashchange', route);
}

load().then(() => {
  document.title = `Enquiries · ${rules.company.name}`;
  $('#company').textContent = rules.company.name; $('#logo').textContent = rules.company.initial;
  document.documentElement.style.setProperty('--brand', rules.company.brandColor);
  const n = now(); $('#clock').innerHTML = `${live ? 'Live clock' : 'Sample clock'} · <b>${fmtDate(n)}, ${n.slice(11, 16)}</b>`;
  bind(); route();
}).catch((err) => { $('#app').innerHTML = `<div class="card"><div class="empty"><b>Couldn’t load the tracker</b>${esc(err.message)} is missing or unreadable. Run <code>npm run dev</code> from the tool folder, rather than opening the file directly.</div></div>`; });
