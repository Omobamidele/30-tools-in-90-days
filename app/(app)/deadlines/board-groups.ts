import type { StageColor } from "@/ui/kanban";

// Deadlines board columns. Shared by the page (totals) and the board (cards) so both group
// the same way. Closed items are not shown on the board.
export const deadlineStages: Array<{ key: string; title: string; color: StageColor }> = [
  { key: "overdue", title: "Overdue", color: "red" },
  { key: "week", title: "This week", color: "amber" },
  { key: "fortnight", title: "Next 2 weeks", color: "blue" },
  { key: "later", title: "Later", color: "grey" },
];

export function stageFor(item: { overdue: boolean; days: number }): string {
  if (item.overdue) return "overdue";
  if (item.days <= 7) return "week";
  if (item.days <= 21) return "fortnight";
  return "later";
}
