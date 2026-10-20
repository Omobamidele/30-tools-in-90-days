import type { LucideIcon } from "lucide-react";
export function EmptyState({ icon: Icon, title, hint, action }: { icon: LucideIcon; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center" data-testid="empty">
      <Icon className="size-8 text-gray-300" strokeWidth={1.5} aria-hidden />
      <p className="mt-3 text-[13px] font-medium text-gray-900">{title}</p>
      <p className="mt-0.5 text-[13px] text-gray-500">{hint}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
