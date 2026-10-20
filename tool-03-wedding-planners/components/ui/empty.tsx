import type { LucideIcon } from "@/components/icons";
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start px-5 py-10" data-testid="empty">
      <Icon className="size-6 text-faint" aria-hidden />
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-[14px] text-muted">{hint}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
