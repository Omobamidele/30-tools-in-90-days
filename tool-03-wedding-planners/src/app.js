import * as R from './rules.js';

const STORE_KEY = 'wet:v1';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let rules, meta, data, view = { route: 'today', filter: 'open', channel: '', q: '', open: null };

// ---------- clock ----------
// The fixed clock keeps every demo identical. Add ?clock=live for the real time, or ?clock=2026-10-22T14:10 to replay a later moment.
const clockParam = new URLSearchParams(location.search).get('clock');
const live = clockParam === 'live';
const fixedClock = /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(clockParam || '') ? clockParam : null;
const pad = (n) => String(n).padStart(2, '0');
const now = () => {
  if (fixedClock) return fixedClock;
  if (!live) return meta.sampleClock;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDate = (d, year = true) => new Date(d.slice(0, 10) + 'T12:00').toLocaleDateString(rules.company.locale, { weekday: 'short', day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const fmtWhen = (t) => `${fmtDate(t, false)}, ${t.slice(11, 16)}`;
const money = (n) => n == null ? '—' : new Intl.NumberFormat(rules.company.locale, { style: 'currency', currency: rules.company.currency, maximumFractionDigits: 0 }).format(n);

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
const check = (e) => R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue, selfId: e.id, selfCouple: e.couple }, data.weddings, data.enquiries, rules);
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400); };

// ---------- small pieces ----------
const ICON = {
  today: '<path d="M2.5 4.5h11v9h-11z"/><path d="M2.5 7h11M5.5 2.5v3M10.5 2.5v3"/>',
  enquiries: '<path d="M2.5 3.5h11v7h-4l-2.5 2.5v-2.5h-4.5z"/>',
  followups: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  referrals: '<path d="M8 13.5s-5-2.9-5-6.6A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5 1.9c0 3.7-5 6.6-5 6.6z"/>',
  rules: '<path d="M3 4h10M3 8h10M3 12h6"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
};
const icon = (k) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;
const st = (tone, text) => `<span class="st ${tone}">${esc(text)}</span>`;
function replyPill(e) {
  const r = R.replyState(e, now(), rules);
  if (r.state === 'replied-on-time') return st('green', R.fmtMinutes(r.minutes));
  if (r.state === 'replied-late') return st('amber', R.fmtMinutes(r.minutes));
  if (r.state === 'overdue') return st('red', `Waiting ${R.fmtMinutes(r.minutes)}`);
  if (r.state === 'waiting') return st('amber', `Waiting ${R.fmtMinutes(r.minutes)}`);
  return `<span class="sub2">None logged</span>`;
}
const STATUS_TONE = { New: 'new', Replied: 'half', 'Quote sent': 'quote', 'Gone quiet': '', Booked: 'green', Lost: '' };
const initials = (n) => n.split(' ').map((x) => x[0]).join('');
const owner = (n) => n ? `<span class="own"><i>${esc(initials(n))}</i>${esc(n.split(' ')[0])}</span>` : '<span class="own none">Unassigned</span>';
const statusPill = (s) => st(`${STATUS_TONE[s] || ''} ink`, s);
function checkLine(e) {
  if (['Booked', 'Lost'].includes(e.status)) return '';
  const c = check(e);
  if (c.level === 'venue-clash' || c.level === 'full') return `<div class="flag">${esc(c.message)}</div>`;
  if (c.level === 'tight' || c.holds.length) return `<div class="flag tight">${esc(c.message)}</div>`;
  return '';
}
function nextStep(e) {
  const r = R.replyState(e, now(), rules);
  if (r.state === 'overdue' || r.state === 'waiting') return 'Send first reply';
  const f = R.followUpState(e, now(), rules);
  if (f?.goneQuiet) return 'No answer: call or close';
  if (f?.next) return f.next.state === 'late' ? `Day ${f.next.day} nudge, late` : f.next.state === 'due-today' ? `Day ${f.next.day} nudge today` : `Day ${f.next.day} nudge ${fmtDate(f.next.due, false)}`;
  if (e.status === 'Replied') return 'Send quote';
  return '';
}
function stepChips(f) {
  return f.steps.map((s) => s.state === 'sent' ? st('green', `Day ${s.day} sent ${fmtDate(s.sentOn, false)}`) : s.state === 'late' ? st('red', `Day ${s.day} · ${s.daysLate} d late`) : s.state === 'due-today' ? st('amber', `Day ${s.day} due today`) : st('', `Day ${s.day} · ${fmtDate(s.due, false)}`)).join('');
}
const shortDate = (d) => fmtDate(d, true);

// ---------- views ----------
function comingUp() {
  const t = now().slice(0, 10), end = new Date(R.toMs(t + 'T12:00') + 14 * 864e5).toISOString().slice(0, 10);
  const ws = data.weddings.filter((w) => w.date >= t && w.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (!ws.length) return '';
  return `<tr class="grp"><td colspan="5">Weddings in the next 14 days<span class="cnt">${ws.length}</span></td></tr>${ws.map((w) => `<tr class="ro"><td><span class="who">${esc(w.couple)}</span></td><td class="sub2">${esc(w.venue)}</td><td class="opt">${owner(w.planner)}</td><td class="sub2 opt">${fmtDate(w.date, false)}</td><td></td></tr>`).join('')}`;
}
function navHtml() {
  const q = R.actionQueue(data, now(), rules);
  const quotes = data.enquiries.filter((e) => e.status === 'Quote sent').length;
  const refs = q.filter((a) => a.kind === 'thank-you' || a.kind === 'review-nudge').length;
  const link = (r, label, n, hot) => `<a href="#${r}" ${view.route === r ? 'aria-current="page"' : ''}>${icon(r)}${label}${n != null ? `<span class="n ${hot ? 'hot' : ''}">${n}</span>` : ''}</a>`;
  return `${link('today', 'Today', q.length, q.length > 0)}
  <div class="h">Pipeline</div>${link('enquiries', 'Enquiries', data.enquiries.filter((e) => R.OPEN_STATUSES.includes(e.status)).length)}${link('followups', 'Quote follow-ups', quotes)}${link('referrals', 'Referrals and reviews', refs, refs > 0)}
  <div class="h">Workspace</div>${link('rules', 'House rules')}`;
}
const header = (title, crumb, right = '') => `<div class="bar">${crumb ? `<span class="crumb">${crumb}</span><span class="crumb">/</span>` : ''}<h1>${title}</h1><span class="sp"></span>${right}</div>`;
const addBtn = `<button class="btn pri" data-act="add">${icon('plus')}New enquiry</button>`;

const ACTION_LABEL = { reply: 'Reply', nudge: 'Nudge', quiet: 'Review', 'thank-you': 'Thank', 'review-nudge': 'Remind' };
const GROUPS = [['Reply first', ['reply']], ['Follow up on quotes', ['nudge', 'quiet']], ['Thank past couples', ['thank-you', 'review-nudge']]];
function today() {
  const q = R.actionQueue(data, now(), rules);
  const s = R.monthSummary(data.enquiries, now(), rules);
  const rows = GROUPS.map(([title, kinds]) => {
    const items = q.filter((a) => kinds.includes(a.kind));
    return `<tr class="grp"><td colspan="5">${title}<span class="cnt">${items.length}</span></td></tr>` + (items.length ? items.map((a) => {
      const past = a.kind === 'thank-you' || a.kind === 'review-nudge';
      const rec = past ? data.past.find((p) => p.id === a.id) : byId(a.id);
      const urgent = a.rank === 0 || a.rank === 2 || (a.kind === 'thank-you' && a.minutes > 0);
      return `<tr data-kind="${a.kind}" data-oid="${a.id}" class="${view.open?.id === a.id ? 'sel' : ''}">
        <td><span class="who">${esc(a.who)}</span>${!past ? checkLine(rec) || (rec.note ? `<span class="sub">${esc(rec.note)}</span>` : '') : rec.venue ? `<span class="sub">${esc(rec.venue)}</span>` : ''}</td>
        <td class="wrap">${st(urgent ? "red" : "amber", a.why)}</td>
        <td class="sub2 opt">${past ? 'Past couple' : rules.channels[rec.channel]}</td>
        <td class="sub2 opt">${past ? `Married ${new Date(rec.weddingDate + 'T12:00').toLocaleDateString(rules.company.locale, { day: 'numeric', month: 'short' })}` : rec.weddingDate ? shortDate(rec.weddingDate) : 'No date yet'}</td>
        <td class="num"><button class="btn sm" data-act="open" data-kind="${a.kind}" data-id="${a.id}">${ACTION_LABEL[a.kind]}</button></td></tr>`;
    }).join('') : `<tr class="grp"><td colspan="5" class="sub2" style="font-weight:400;background:#fff">All clear</td></tr>`);
  }).join('');
  return `${header('Today', '', addBtn)}
  <div class="tools"><span class="sub2">${q.length ? `${q.length} waiting on you, most urgent first` : 'Nothing is waiting on you'}</span><span class="meta">${new Date(now().slice(0,10)+'T12:00').toLocaleDateString(rules.company.locale,{weekday:'long',day:'numeric',month:'long'})}</span></div>
  <div class="page"><table class="tbl today"><thead><tr><th>Couple</th><th>Why now</th><th class="opt">Channel</th><th class="opt">Wedding</th><th class="num"></th></tr></thead><tbody>${rows}${comingUp()}</tbody></table>
  <p class="month">So far this month we've had ${s.total} enquiries. Median first reply was ${R.fmtMinutes(s.medianReplyMinutes)}, and ${s.slowOrNone} waited over ${R.fmtMinutes(rules.firstReply.targetMinutes)} or got no reply. ${s.bookedFromReferrals} of ${s.booked} bookings came from referrals.</p></div>`;
}

function filtered() {
  const q = view.q.trim().toLowerCase();
  return data.enquiries.filter((e) => {
    if (view.channel && e.channel !== view.channel) return false;
    if (!inView(e, view.filter)) return false;
    if (q && ![e.couple, e.venue, e.contact, e.note, e.referredBy].some((x) => (x || '').toLowerCase().includes(q))) return false;
    return true;
  }).sort((a, b) => R.toMs(b.receivedAt) - R.toMs(a.receivedAt));
}
function inView(e, f) {
  if (f === 'open') return R.OPEN_STATUSES.includes(e.status);
  if (f === 'reply') return ['overdue', 'waiting'].includes(R.replyState(e, now(), rules).state);
  if (f === 'booked') return e.status === 'Booked';
  if (f === 'closed') return ['Lost', 'Gone quiet'].includes(e.status);
  return true;
}
function enquiries() {
  const list = filtered();
  const tab = (k, l) => `<button data-filter="${k}" aria-pressed="${view.filter === k}">${l}<span class="c">${data.enquiries.filter((e) => inView(e, k)).length}</span></button>`;
  return `${header('Enquiries', '', addBtn)}
  <div class="views" role="group" aria-label="Views">${tab('open', 'Open')}${tab('reply', 'Needs a reply')}${tab('booked', 'Booked')}${tab('closed', 'Lost or quiet')}${tab('all', 'All')}</div>
  <div class="tools"><label class="sr" for="chan">Channel</label><select id="chan"><option value="">All channels</option>${Object.entries(rules.channels).map(([k, v]) => `<option value="${k}" ${view.channel === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
   ${view.q ? `<span class="sub2">Matching “${esc(view.q)}”</span>` : ''}<span class="meta">${list.length} of ${data.enquiries.length}</span></div>
  <div class="page">${list.length ? `<table class="tbl"><thead><tr><th>Couple</th><th>Channel</th><th class="opt">Received<span class="srt" aria-label="sorted newest first">↓</span></th><th>Wedding</th><th class="opt">Venue</th><th class="num opt">Guests</th><th class="num opt">Budget</th><th>First reply</th><th>Status</th><th>Planner</th><th>Next step</th></tr></thead><tbody>
  ${list.map((e) => `<tr data-id="${e.id}" class="${view.open?.id === e.id ? 'sel' : ''}"><td><button class="lnk who" data-act="open" data-id="${e.id}">${esc(e.couple)}</button>${checkLine(e)}</td>
   <td class="sub2">${rules.channels[e.channel]}</td><td class="sub2 opt">${fmtWhen(e.receivedAt)}</td>
   <td>${e.weddingDate ? shortDate(e.weddingDate) : '<span class="sub2">No date yet</span>'}</td><td class="sub2 opt">${esc(e.venue || '')}</td>
   <td class="num opt">${e.guests ?? ''}</td><td class="num opt">${e.budget ? money(e.budget) : ''}</td>
   <td>${replyPill(e)}</td><td>${statusPill(e.status)}</td><td>${owner(e.owner)}</td><td class="sub2">${esc(nextStep(e))}</td></tr>`).join('')}</tbody></table>`
  : `<div class="empty"><b>No enquiries match</b>${view.q ? `Nothing for “${esc(view.q)}”. ` : ''}Check the spelling or switch to All.</div>`}</div>`;
}

function followups() {
  const list = data.enquiries.filter((e) => e.status === 'Quote sent').map((e) => [e, R.followUpState(e, now(), rules)]).sort((a, b) => (a[1].next?.due || '9').localeCompare(b[1].next?.due || '9'));
  return `${header('Quote follow-ups', 'Pipeline')}
  <div class="tools"><span class="sub2">Nudges on day ${rules.followUp.nudgeDays.join(' and day ')} after the quote. Flagged ${rules.followUp.goneQuietAfterDays} days after the last one with no answer.</span><span class="meta">${list.length} quotes out</span></div>
  <div class="page">${list.length ? `<table class="tbl"><thead><tr><th>Couple</th><th>Quote sent</th><th>Wedding</th>${rules.followUp.nudgeDays.map((d) => `<th>Day ${d}</th>`).join('')}<th class="num"></th></tr></thead><tbody>
  ${list.map(([e, f]) => `<tr data-id="${e.id}" class="${view.open?.id === e.id ? 'sel' : ''}"><td><span class="who">${esc(e.couple)}</span></td><td class="sub2">${fmtDate(e.quoteSentOn, false)}</td><td class="sub2">${shortDate(e.weddingDate)}</td>
   ${f.steps.map((s) => `<td>${s.state === 'sent' ? st('green', `Sent ${fmtDate(s.sentOn, false)}`) : s.state === 'late' ? st('red', `${s.daysLate} d late`) : s.state === 'due-today' ? st('amber', 'Due today') : st('', fmtDate(s.due, false))}</td>`).join('')}
   <td class="num">${f.goneQuiet ? st('red', 'No answer') : f.next && ['late', 'due-today'].includes(f.next.state) ? `<button class="btn sm" data-act="open" data-kind="nudge" data-id="${e.id}">Nudge</button>` : ''}</td></tr>`).join('')}</tbody></table>`
  : '<div class="empty"><b>No quotes out</b>Quotes you send appear here with their nudge dates.</div>'}</div>`;
}

const REF_PILL = { 'not-yet': (s) => ['', `Ask opens ${fmtDate(s.opensOn, false)}`], 'thank-you-due': (s) => ['red', s.daysLate ? `Thank-you ${s.daysLate} d late` : 'Thank-you due today'], waiting: (s) => ['half', `Asked · reminder ${fmtDate(s.nudgeOn, false)}`], 'review-nudge-due': () => ['amber', 'Review reminder due'], 'asked-twice': () => ['', 'Asked twice, leave it'], done: () => ['green', 'Review received'] };
function referrals() {
  const rows = [...data.past].sort((a, b) => a.weddingDate.localeCompare(b.weddingDate));
  const fromRefs = data.enquiries.filter((e) => e.referredBy);
  return `${header('Referrals and reviews', 'Pipeline')}
  <div class="tools"><span class="sub2">Thank-you with a review and referral ask ${rules.referral.askAfterDays} days after the wedding, then one reminder ${rules.referral.reviewNudgeAfterDays} days later.</span></div>
  <div class="page"><table class="tbl"><thead><tr><th>Couple</th><th>Married</th><th class="opt2">Venue</th><th>Review</th><th>Referred</th><th>Status</th><th class="num"></th></tr></thead><tbody>
  ${rows.map((p) => { const s = R.referralState(p, now(), rules); const [t, l] = REF_PILL[s.state](s); const sent = fromRefs.filter((e) => e.referredBy === p.couple);
   return `<tr data-pid="${p.id}"><td><span class="who">${esc(p.couple)}</span></td><td class="sub2">${shortDate(p.weddingDate)}</td><td class="sub2 opt2">${esc(p.venue)}</td><td class="sub2">${esc(p.review || '')}</td>
   <td class="sub2">${sent.map((e) => esc(R.firstNames(e.couple))).join(', ')}</td><td>${st(t, l)}</td>
   <td class="num">${s.state === 'thank-you-due' || s.state === 'review-nudge-due' ? `<button class="btn sm" data-act="open" data-kind="${s.state === 'thank-you-due' ? 'thank-you' : 'review-nudge'}" data-id="${p.id}">Write message</button>` : ''}</td></tr>`; }).join('')}</tbody></table>
  <div class="tools" style="margin-top:18px;border-top:1px solid var(--line)"><b style="font-weight:500">Enquiries from referrals</b><span class="meta">${fromRefs.length}</span></div>
  <table class="tbl"><tbody>${fromRefs.map((e) => `<tr data-id="${e.id}"><td><span class="who">${esc(e.couple)}</span></td><td class="sub2">Referred by ${esc(e.referredBy)}</td><td class="sub2">${fmtDate(e.receivedAt)}</td><td>${statusPill(e.status)}</td></tr>`).join('') || '<tr><td class="empty">None yet.</td></tr>'}</tbody></table></div>`;
}

function rulesView() {
  const r = rules, rows = [
    ['Company', `${r.company.name} (messages signed “${r.company.senderName}”)`],
    ['Team', r.team.map((t) => `${t.name}, ${t.role}`).join('; ')],
    ['Weddings per date', `Up to ${r.capacity.maxWeddingsPerDate}. Same venue on the same date: ${r.capacity.sameVenueSameDate === 'block' ? 'blocked' : 'allowed'}. Open quotes on the same date: ${r.capacity.holdWarningForOpenQuotes ? 'shown as a warning' : 'ignored'}`],
    ['First reply', `Within ${R.fmtMinutes(r.firstReply.targetMinutes)} of the enquiry arriving, evenings and weekends included`],
    ['Quote nudges', `Day ${r.followUp.nudgeDays.join(' and day ')} after the quote; flagged as gone quiet ${r.followUp.goneQuietAfterDays} days after the last nudge`],
    ['Thank-you and referral ask', `${r.referral.askAfterDays} days after the wedding; one review reminder ${r.referral.reviewNudgeAfterDays} days later`],
    ['Channels', Object.values(r.channels).join(', ')],
  ];
  return `${header('House rules', 'Workspace', '<button class="btn" data-act="reset">Restore starting data</button>')}
  <div class="tools"><span class="sub2">Set in <code>config/rules.json</code>. Change them there to fit another planning company.</span></div>
  <div class="page"><div class="cfg">${rows.map(([k, v]) => `<div class="k">${k}</div><div>${esc(v)}</div>`).join('')}</div>
  <div class="tools" style="margin-top:18px;border-top:1px solid var(--line)"><b style="font-weight:500">Message templates</b><span class="meta">Drafts only. You copy them into WhatsApp, Instagram or email</span></div>
  ${Object.entries(r.templates).filter(([k]) => !k.startsWith('date')).map(([k, v]) => `<div class="tpl"><b>${k}</b><p>${esc(v)}</p></div>`).join('')}</div>`;
}

// ---------- drawer ----------
const panelHead = (crumb) => `<div class="ph"><span class="sub2">${crumb}</span><span class="sp"></span><button class="x" data-act="close" aria-label="Close">×</button></div>`;
function drawer() {
  const el = $('#drawer');
  document.querySelector('.app').classList.toggle('drawer-open', !!view.open);
  if (!view.open) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const { id, kind } = view.open;
  if (kind === 'thank-you' || kind === 'review-nudge') return pastDrawer(el, data.past.find((p) => p.id === id), kind);
  const e = byId(id); if (!e) { view.open = null; return drawer(); }
  const c = check(e), r = R.replyState(e, now(), rules), f = R.followUpState(e, now(), rules);
  const tone = { 'venue-clash': 'r', full: 'r', tight: 'a', free: 'g', unknown: 'n' }[c.level];
  let draftKind = null, primary = '';
  if (r.state === 'overdue' || r.state === 'waiting') { draftKind = 'reply'; primary = `<button class="btn pri" data-act="do" data-a="reply" data-id="${e.id}">Mark reply as sent</button>`; }
  else if (f?.next && f.next.state !== 'waiting' && !f.goneQuiet) { draftKind = 'nudge'; primary = `<button class="btn pri" data-act="do" data-a="nudge" data-id="${e.id}" ${f.next.state === 'upcoming' ? 'disabled title="Not due yet"' : ''}>Mark day ${f.next.day} nudge as sent</button>`; }
  const actions = [];
  const blocked = ['full', 'venue-clash'].includes(c.level);
  if (['New', 'Replied'].includes(e.status)) actions.push(`<button class="btn" data-act="do" data-a="quote" data-id="${e.id}" ${blocked ? 'disabled title="Date is not available"' : ''}>Quote sent</button>`);
  if (R.OPEN_STATUSES.includes(e.status) || e.status === 'Gone quiet') actions.push(`<button class="btn" data-act="do" data-a="booked" data-id="${e.id}" ${blocked || !e.weddingDate ? 'disabled' : ''}>Booked</button>`);
  if (f?.goneQuiet) actions.push(`<button class="btn" data-act="do" data-a="quiet" data-id="${e.id}">Mark gone quiet</button>`);
  if (R.OPEN_STATUSES.includes(e.status)) actions.push(`<button class="btn ghost" data-act="do" data-a="lost" data-id="${e.id}">Lost</button>`);
  el.innerHTML = `${panelHead('Enquiry')}
  <div class="hd"><h2>${esc(e.couple)}</h2><div class="meta">${rules.channels[e.channel]}${e.contact ? `, ${esc(e.contact)}` : ''}</div><div class="chips">${statusPill(e.status)}${replyPill(e)}</div></div>
  <div class="sect"><dl class="facts"><dt>Wedding date</dt><dd>${e.weddingDate ? fmtDate(e.weddingDate) : 'Not given yet'}</dd><dt>Venue</dt><dd>${esc(e.venue || 'Not chosen')}</dd><dt>Guests</dt><dd>${e.guests ?? '—'}</dd><dt>Budget</dt><dd>${money(e.budget)}</dd><dt>Planner</dt><dd>${owner(e.owner)}</dd><dt>Received</dt><dd>${fmtWhen(e.receivedAt)}</dd>${e.referredBy ? `<dt>Referred by</dt><dd>${esc(e.referredBy)}</dd>` : ''}${e.note ? `<dt>Note</dt><dd>${esc(e.note)}</dd>` : ''}</dl></div>
  <div class="sect"><h3>Date check</h3><div class="callout ${tone}"><div>${esc(c.message)}${c.booked.length ? `<small>${c.booked.map((w) => `${esc(w.couple)} at ${esc(w.venue)} (${esc(w.planner)})`).join('<br>')}</small>` : ''}</div></div></div>
  ${f ? `<div class="sect"><h3>Follow-up</h3><div class="steps">${stepChips(f)}</div></div>` : ''}
  ${draftKind ? `<div class="sect"><h3>Draft message</h3><label class="sr" for="draft">Draft message</label><textarea id="draft">${esc(R.draftFor(draftKind, e, c, rules, fmtDate))}</textarea><div class="row"><button class="btn" data-act="copy">Copy</button>${primary}</div></div>` : ''}
  ${actions.length ? `<div class="sect"><h3>Update</h3><div class="row" style="margin-top:0">${actions.join('')}</div></div>` : ''}
  <div class="sect"><h3>History</h3><ul class="hist">${[...e.history].reverse().map((h) => `<li>${esc(h.what)}<small>${fmtWhen(h.at)}</small></li>`).join('')}</ul></div>`;
}
function pastDrawer(el, p, kind) {
  const s = R.referralState(p, now(), rules);
  const can = (kind === 'thank-you' && s.state === 'thank-you-due') || (kind === 'review-nudge' && s.state === 'review-nudge-due');
  el.innerHTML = `${panelHead('Past couple')}<div class="hd"><h2>${esc(p.couple)}</h2><div class="meta">Married ${fmtDate(p.weddingDate)} at ${esc(p.venue)}</div></div>
  <div class="sect"><h3>Draft message</h3><label class="sr" for="draft">Draft message</label><textarea id="draft">${esc(R.draftFor(kind, p, null, rules, fmtDate))}</textarea>
  <div class="row"><button class="btn" data-act="copy">Copy</button><button class="btn pri" data-act="pdo" data-a="${kind}" data-id="${p.id}" ${can ? '' : 'disabled'}>Mark as sent</button></div></div>`;
}

// ---------- add enquiry ----------
function addForm(values = {}, errors = {}, dup = null) {
  const v = { channel: 'ig', receivedAt: now(), ...values };
  const f = (name, label, input, cls = '') => `<div class="f ${cls}"><label for="f-${name}">${label}</label>${input}${errors[name] ? `<span class="err" id="e-${name}">${errors[name]}</span>` : ''}</div>`;
  const inp = (name, type = 'text', extra = '') => `<input id="f-${name}" name="${name}" type="${type}" value="${esc(v[name] ?? '')}" ${errors[name] ? `aria-invalid="true" aria-describedby="e-${name}"` : ''} ${extra}>`;
  const c = v.weddingDate && !errors.weddingDate ? R.dateCheck({ weddingDate: v.weddingDate, venue: v.venue }, data.weddings, data.enquiries, rules) : null;
  $('#addDialog').innerHTML = `<form method="dialog" id="addFormEl" novalidate><div class="dh"><h2 id="addTitle">New enquiry</h2><p>From a DM, WhatsApp, email or the website form. The date is checked as you type.</p></div>
  <div class="grid">${f('couple', 'Couple’s names', inp('couple', 'text', 'required'), 'full')}
  ${f('channel', 'Came in by', `<select id="f-channel" name="channel">${Object.entries(rules.channels).map(([k, l]) => `<option value="${k}" ${v.channel === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
  ${f('receivedAt', 'Received', inp('receivedAt', 'datetime-local'))}
  ${f('contact', 'Handle, phone or email', inp('contact'))}${f('referredBy', 'Referred by', inp('referredBy'))}
  ${f('weddingDate', 'Wedding date', inp('weddingDate', 'date'))}${f('venue', 'Venue', inp('venue', 'text', 'list="venues"'))}
  ${f('guests', 'Guests', inp('guests', 'number', 'min="1" inputmode="numeric"'))}${f('budget', `Budget (${rules.company.currency})`, inp('budget', 'number', 'min="0" step="500"'))}
  ${f('note', 'Note', `<textarea id="f-note" name="note">${esc(v.note || '')}</textarea>`, 'full')}</div>
  <datalist id="venues">${[...new Set(data.weddings.map((w) => w.venue))].map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
  ${c ? `<div class="callout ${{ 'venue-clash': 'r', full: 'r', tight: 'a', free: 'g' }[c.level]}" id="liveCheck"><div>Date check: ${esc(c.message)}</div></div>` : ''}
  ${dup ? `<div class="callout a" id="dupWarn"><div>Possible duplicate: ${esc(dup.couple)} came in by ${rules.channels[dup.channel]} on ${fmtWhen(dup.receivedAt)}. <button type="button" class="btn sm" data-act="open-dup" data-id="${dup.id}">Open it</button></div></div>` : ''}
  <div class="foot"><button type="button" class="btn" data-act="cancel-add">Cancel</button><button type="submit" class="btn pri" value="save">${dup ? 'Add anyway' : 'Add enquiry'}</button></div></form>`;
}
const formValues = () => Object.fromEntries(new FormData($('#addFormEl')).entries());

// ---------- render + events ----------
function render() {
  $('#nav').innerHTML = navHtml();
  const views = { today, enquiries, followups, referrals, rules: rulesView };
  $('#app').innerHTML = (views[view.route] || today)();
  drawer();
}
function route() { const r = location.hash.slice(1) || 'today'; if (r !== view.route) view.open = null; view.route = r; render(); }

function act(e, a, at) {
  try {
    const i = data.enquiries.findIndex((x) => x.id === e.id);
    const next = R.applyAction(e, a, at);
    if (a === 'reply' && !next.owner) next.owner = rules.team[0].name; // whoever sends the first reply owns the enquiry
    data.enquiries[i] = next;
    if (a === 'booked' && !data.weddings.some((w) => w.enquiryId === e.id || w.couple === e.couple)) data.weddings.push({ id: 'w-' + e.id, enquiryId: e.id, couple: e.couple, date: e.weddingDate, venue: e.venue || 'Venue to confirm', planner: R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue }, data.weddings, [], rules).level === 'tight' ? rules.team.map((t) => t.name).find((n) => !data.weddings.some((w) => w.date === e.weddingDate && w.planner === n)) : rules.team[0].name });
    save(); render();
    toast({ reply: 'Reply logged', quote: 'Quote logged. Day 3 nudge scheduled', nudge: 'Nudge logged', booked: 'Booked. The date is now held', lost: 'Marked lost', quiet: 'Marked gone quiet' }[a]);
  } catch (err) { toast(err.message); }
}

function bind() {
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-act],[data-filter],tbody tr[data-id],tbody tr[data-oid]');
    if (!t) return;
    if (t.dataset.filter) { view.filter = t.dataset.filter; return render(); }
    const a = t.dataset.act;
    if (!a && t.matches('tr')) { view.open = t.dataset.oid ? { id: t.dataset.oid, kind: t.dataset.kind } : { id: t.dataset.id }; return render(); }
    if (a === 'open') { view.open = { id: t.dataset.id, kind: t.dataset.kind }; render(); $('#drawer h2')?.setAttribute('tabindex', '-1'); $('#drawer h2')?.focus(); }
    if (a === 'close') { view.open = null; render(); }
    if (a === 'do') act(byId(t.dataset.id), t.dataset.a, now());
    if (a === 'pdo') { const i = data.past.findIndex((p) => p.id === t.dataset.id); data.past[i] = R.applyPastAction(data.past[i], t.dataset.a, now()); view.open = null; save(); render(); toast('Logged as sent'); }
    if (a === 'copy') { const txt = $('#draft').value; try { await navigator.clipboard.writeText(txt); toast('Copied. Paste it into the chat'); } catch { $('#draft').select(); toast('Select and copy the text'); } }
    if (a === 'add') { addForm(); $('#addDialog').showModal(); $('#f-couple').focus(); }
    if (a === 'cancel-add') $('#addDialog').close();
    if (a === 'open-dup') { $('#addDialog').close(); view.open = { id: t.dataset.id }; render(); }
    if (a === 'reset') { if (confirm('Restore the starting data? Changes made in this browser will be lost.')) { localStorage.removeItem(STORE_KEY); data = await sampleData((p) => fetch(p).then((r) => r.json())); view.open = null; render(); toast('Starting data restored'); } }
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
  $('#company').textContent = rules.company.shortName || rules.company.name; $('#logo').textContent = rules.company.initial;
  document.documentElement.style.setProperty('--accent', rules.company.brandColor);
  const me = rules.team[0].name; $('#meName').textContent = me; $('#meIni').textContent = initials(me);
  bind(); route();
}).catch((err) => { $('#app').innerHTML = `<div class="card"><div class="empty"><b>Couldn’t load the tracker</b>${esc(err.message)} is missing or unreadable. Run <code>npm run dev</code> from the tool folder, rather than opening the file directly.</div></div>`; });
