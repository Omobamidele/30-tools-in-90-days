import { cn } from "./cn";
/** A panel is used for one thing per screen: the main list. Everything else sits on the canvas, separated by spacing and rules. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-panel border border-line bg-surface", className)}>{children}</section>;
}
export const Card = Panel;
export function SectionHead({ title, meta, actions, children }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <h2 className="text-[16px] font-semibold leading-6 text-ink">{title}</h2>
      {meta != null ? <span className="text-[14px] text-muted">{meta}</span> : null}
      {children}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
export const CardHeader = SectionHead;
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("rounded-control bg-sunken", className)} aria-hidden />;
