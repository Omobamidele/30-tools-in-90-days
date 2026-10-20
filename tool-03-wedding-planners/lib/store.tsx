"use client";
import * as React from "react";
import { R } from "./view";
import rulesJson from "@/config/rules.json";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rules: any = rulesJson;
import meta from "@/sample-data/meta.json";
import enquiriesJson from "@/sample-data/enquiries.json";
import weddingsJson from "@/sample-data/booked-weddings.json";
import pastJson from "@/sample-data/past-couples.json";
import type { Data, Enquiry, PastCouple } from "./types";

const KEY = "wet:v2";
const starting = (): Data => structuredClone({ enquiries: enquiriesJson as Enquiry[], weddings: weddingsJson, past: pastJson as PastCouple[] });

type Store = {
  ready: boolean; error: string | null; data: Data; now: string; rules: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  act: (id: string, action: string) => string; pastAct: (id: string, action: string) => void;
  add: (input: Record<string, string>) => string; restore: () => void;
};
const Ctx = React.createContext<Store | null>(null);
export const useStore = () => { const s = React.useContext(Ctx); if (!s) throw new Error("useStore outside provider"); return s; };

// The fixed clock keeps every demo identical. ?clock=live uses real time; ?clock=2026-10-22T14:10 replays a later moment.
function clockFromUrl(): string {
  if (typeof window === "undefined") return meta.sampleClock;
  const q = new URLSearchParams(window.location.search).get("clock");
  if (q === "live") { const n = new Date(); const p = (x: number) => String(x).padStart(2, "0"); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`; }
  if (q && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(q)) { sessionStorage.setItem("wet:clock", q); return q; }
  return sessionStorage.getItem("wet:clock") || meta.sampleClock;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<Data>(starting);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(meta.sampleClock);

  React.useEffect(() => {
    setNow(clockFromUrl());
    const raw = localStorage.getItem(KEY);
    if (raw) { try { setData(JSON.parse(raw)); } catch { setError("Saved changes in this browser could not be read."); } }
    // Short first-load delay so the loading state is real and visible (design kit §8).
    const t = setTimeout(() => setReady(true), 450);
    return () => clearTimeout(t);
  }, []);
  const commit = React.useCallback((next: Data) => { setData(next); localStorage.setItem(KEY, JSON.stringify(next)); }, []);

  const act = React.useCallback((id: string, action: string) => {
    const i = data.enquiries.findIndex((e) => e.id === id); const e = data.enquiries[i];
    const next: Enquiry = R.applyAction(e, action, now);
    if (action === "reply" && !next.owner) next.owner = rules.team[0].name; // whoever sends the first reply owns it
    const enquiries = data.enquiries.map((x, j) => (j === i ? next : x));
    let weddings = data.weddings;
    if (action === "booked" && !weddings.some((w) => w.enquiryId === e.id || w.couple === e.couple)) {
      const tight = R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue }, weddings, [], rules).level === "tight";
      const planner = tight ? rules.team.map((t: { name: string }) => t.name).find((n: string) => !weddings.some((w) => w.date === e.weddingDate && w.planner === n)) : (next.owner || rules.team[0].name);
      weddings = [...weddings, { id: "w-" + e.id, enquiryId: e.id, couple: e.couple, date: e.weddingDate!, venue: e.venue || "Venue to confirm", planner: planner || rules.team[0].name }];
    }
    commit({ ...data, enquiries, weddings });
    return ({ reply: "First reply logged", quote: "Quote logged. Day 3 nudge scheduled", nudge: "Nudge logged", booked: "Booked. The date is now held", lost: "Marked as lost", quiet: "Marked as gone quiet" } as Record<string, string>)[action];
  }, [data, now, commit]);

  const pastAct = React.useCallback((id: string, action: string) => {
    commit({ ...data, past: data.past.map((p) => (p.id === id ? R.applyPastAction(p, action, now) : p)) });
  }, [data, now, commit]);

  const add = React.useCallback((input: Record<string, string>) => {
    const id = "e" + Date.now().toString(36);
    commit({ ...data, enquiries: [...data.enquiries, R.newEnquiry(input, id)] });
    return id;
  }, [data, commit]);

  const restore = React.useCallback(() => { localStorage.removeItem(KEY); setError(null); setData(starting()); }, []);

  const value = React.useMemo(() => ({ ready, error, data, now, rules, act, pastAct, add, restore }), [ready, error, data, now, act, pastAct, add, restore]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
