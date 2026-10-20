import rulesJson from "@/config/rules.json";
const L = rulesJson.company.locale;
const d = (s: string) => new Date(s.slice(0, 10) + "T12:00");
/** "12 Oct 2026" (kit date format) */
export const fmtDate = (s: string) => d(s).toLocaleDateString(L, { day: "numeric", month: "short", year: "numeric" });
export const fmtDay = (s: string) => d(s).toLocaleDateString(L, { weekday: "short", day: "numeric", month: "short" });
export const fmtLongDate = (s: string) => d(s).toLocaleDateString(L, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const fmtWhen = (t: string) => `${d(t).toLocaleDateString(L, { day: "numeric", month: "short" })}, ${t.slice(11, 16)}`;
export const money = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat(L, { style: "currency", currency: rulesJson.company.currency, maximumFractionDigits: 0 }).format(n));
/** The rules module formats dates in drafts with a (date, withYear) callback. */
export const draftDate = (s: string, year = true) => d(s).toLocaleDateString(L, { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) });
export const enquiryRef = (id: string) => (/^e\d+$/.test(id) ? `ENQ-${1000 + Number(id.slice(1))}` : `ENQ-${id.slice(1, 6).toUpperCase()}`);
export const coupleRef = (id: string) => `CPL-${String(id).replace(/\D/g, "").padStart(3, "0")}`;
export const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2);
