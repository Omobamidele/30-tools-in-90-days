// Plain-language money vocabulary (docs/09 § Money). Summary screens lead with the everyday
// words and show the industry term small underneath, so planners still recognise it and
// newcomers and buyers don't need to know it. Detail screens keep the industry terms.
export const money = {
  current: { plain: "Penalties if nothing changes", term: "exposure" },
  cancel: { plain: "Cost to cancel today", term: "cancellation charge" },
  payments: { plain: "Supplier payments due", term: "next 30 days" },
  savings: { plain: "You can still save", term: "block release at review dates" },
  attrition: { plain: "Unused rooms", term: "attrition" },
  fb: { plain: "Catering minimum", term: "F&B shortfall" },
  tier: { plain: "Cancellation fee goes up", term: "tier step-up" },
  overLimit: "Above your limit",
  yours: "Yours",
  clients: "Client's",
  unassigned: "Not agreed yet",
} as const;

/** Deadline kinds in everyday words, for summary lines like "Room cutoff in 4 days". */
export const deadlineWords = {
  PAYMENT: "Payment due",
  CUTOFF: "Room cutoff",
  REVIEW: "Room review",
  GUARANTEE: "Final numbers due",
  TIER_CHANGE: "Cancellation fee goes up",
  OTHER: "Deadline",
} as const;
