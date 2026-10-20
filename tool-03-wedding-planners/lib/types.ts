export type Status = "New" | "Replied" | "Quote sent" | "Gone quiet" | "Booked" | "Lost";
export type Enquiry = {
  id: string; couple: string; channel: string; contact: string; receivedAt: string; weddingDate: string | null; venue: string | null;
  guests: number | null; budget: number | null; firstReplyAt: string | null; status: Status; quoteSentOn: string | null; nudgesSent: string[];
  referredBy: string | null; note: string; owner?: string | null; history: { at: string; what: string }[];
};
export type Wedding = { id: string; couple: string; date: string; venue: string; planner: string; enquiryId?: string };
export type PastCouple = { id: string; couple: string; weddingDate: string; venue: string; thankYouSentOn: string | null; reviewNudgeSentOn: string | null; review: string | null; referralsSent: number };
export type Data = { enquiries: Enquiry[]; weddings: Wedding[]; past: PastCouple[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Rules = any;
