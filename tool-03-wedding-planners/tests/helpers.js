import { readFileSync } from 'node:fs';
const read = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url)));
export const rules = () => read('config/rules.json');
export const sample = () => ({ enquiries: read('sample-data/enquiries.json'), weddings: read('sample-data/booked-weddings.json'), past: read('sample-data/past-couples.json') });
export const NOW = read('sample-data/meta.json').sampleClock;
export const enq = (o = {}) => ({ id: 'x', couple: 'Ada Obi & Tunde Bello', channel: 'wa', contact: '', receivedAt: '2026-10-20T08:00', weddingDate: '2027-06-12', venue: null, guests: 100, budget: 30000, firstReplyAt: null, status: 'New', quoteSentOn: null, nudgesSent: [], history: [], ...o });
