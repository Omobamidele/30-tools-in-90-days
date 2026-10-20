// Presentation helpers shared by the pages: what each rule result looks like on screen.
import * as Rules_ from "./rules.js";
// The rules module is plain JS shared with the unit tests; typed loosely here on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const R: any = Rules_;
import type { Tone } from "@/components/ui/badge";
import type { Data, Enquiry, Rules } from "./types";
import { draftDate } from "./format";

export const STATUS_TONE: Record<string, Tone> = { New: "info", Replied: "neutral", "Quote sent": "warning", "Gone quiet": "danger", Booked: "success", Lost: "neutral" };
export const check = (e: Enquiry, data: Data, rules: Rules) => R.dateCheck({ weddingDate: e.weddingDate, venue: e.venue, selfId: e.id, selfCouple: e.couple }, data.weddings, data.enquiries, rules);
export const CHECK_TONE: Record<string, Tone> = { "venue-clash": "danger", full: "danger", tight: "warning", free: "success", unknown: "neutral" };

export function replyInfo(e: Enquiry, now: string, rules: Rules): { tone: Tone; label: string; minutes: number | null } {
  const r = R.replyState(e, now, rules);
  if (r.state === "replied-on-time") return { tone: "success", label: R.fmtMinutes(r.minutes), minutes: r.minutes };
  if (r.state === "replied-late") return { tone: "warning", label: R.fmtMinutes(r.minutes), minutes: r.minutes };
  if (r.state === "overdue") return { tone: "danger", label: `Waiting ${R.fmtMinutes(r.minutes)}`, minutes: r.minutes };
  if (r.state === "waiting") return { tone: "warning", label: `Waiting ${R.fmtMinutes(r.minutes)}`, minutes: r.minutes };
  return { tone: "neutral", label: "No reply logged", minutes: null };
}
export function nextStep(e: Enquiry, now: string, rules: Rules) {
  const r = R.replyState(e, now, rules);
  if (r.state === "overdue" || r.state === "waiting") return "Send first reply";
  const f = R.followUpState(e, now, rules);
  if (f?.goneQuiet) return "No answer: call or close";
  if (f?.next) return f.next.state === "late" ? `Day ${f.next.day} nudge, late` : f.next.state === "due-today" ? `Day ${f.next.day} nudge today` : `Day ${f.next.day} nudge ${draftDate(f.next.due, false)}`;
  if (e.status === "Replied") return "Send quote";
  return "—";
}
export const dateFlag = (e: Enquiry, data: Data, rules: Rules) => {
  if (["Booked", "Lost"].includes(e.status)) return null;
  const c = check(e, data, rules);
  if (c.level === "venue-clash" || c.level === "full") return { tone: "danger" as Tone, text: c.message as string };
  if (c.level === "tight" || c.holds.length) return { tone: "warning" as Tone, text: c.message as string };
  return null;
};
