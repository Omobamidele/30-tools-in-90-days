import { cn } from "./cn";
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-lg border border-gray-200 bg-white", className)}>{children}</section>;
}
export function CardHeader({ title, meta, actions, children }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 flex-wrap items-center gap-3 border-b border-gray-200 px-5 py-3">
      <h2 className="text-[14px] font-semibold leading-5 text-gray-900">{title}</h2>
      {meta ? <span className="text-[12px] text-gray-500 tabular-nums">{meta}</span> : null}
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("animate-pulse rounded bg-gray-100", className)} />;
