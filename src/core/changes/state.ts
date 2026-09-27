// Change request lifecycle (spec FR-9.7):
// Draft → Internal review → Sent to client → Approved | Rejected | Expired | Withdrawn → Applied

export type ChangeStatus =
  | "DRAFT"
  | "INTERNAL_REVIEW"
  | "SENT_TO_CLIENT"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "WITHDRAWN"
  | "APPLIED";

export type ChangeAction =
  | "SUBMIT" // draft → internal review (if required) or sent to client
  | "APPROVE_INTERNAL"
  | "SEND_BACK" // internal reviewer returns it to draft
  | "CLIENT_APPROVE"
  | "CLIENT_REJECT"
  | "EXPIRE"
  | "WITHDRAW"
  | "REISSUE" // expired link → new link
  | "APPLY";

type Ctx = { internalApprovalRequired: boolean };

export function nextStatus(current: ChangeStatus, action: ChangeAction, ctx: Ctx): ChangeStatus | null {
  switch (action) {
    case "SUBMIT":
      return current === "DRAFT" ? (ctx.internalApprovalRequired ? "INTERNAL_REVIEW" : "SENT_TO_CLIENT") : null;
    case "APPROVE_INTERNAL":
      return current === "INTERNAL_REVIEW" ? "SENT_TO_CLIENT" : null;
    case "SEND_BACK":
      return current === "INTERNAL_REVIEW" ? "DRAFT" : null;
    case "CLIENT_APPROVE":
      return current === "SENT_TO_CLIENT" ? "APPROVED" : null;
    case "CLIENT_REJECT":
      return current === "SENT_TO_CLIENT" ? "REJECTED" : null;
    case "EXPIRE":
      return current === "SENT_TO_CLIENT" ? "EXPIRED" : null;
    case "REISSUE":
      return current === "EXPIRED" ? "SENT_TO_CLIENT" : null;
    case "WITHDRAW":
      return current === "DRAFT" || current === "INTERNAL_REVIEW" || current === "SENT_TO_CLIENT" || current === "EXPIRED"
        ? "WITHDRAWN"
        : null;
    case "APPLY":
      return current === "APPROVED" ? "APPLIED" : null;
  }
}

export const changeStatusLabels: Record<ChangeStatus, string> = {
  DRAFT: "Draft",
  INTERNAL_REVIEW: "Internal review",
  SENT_TO_CLIENT: "Sent to client",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
  APPLIED: "Applied",
};

export function isEditable(status: ChangeStatus): boolean {
  return status === "DRAFT";
}
