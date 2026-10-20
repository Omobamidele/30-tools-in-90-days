import { cn } from "./cn";
// One status treatment: neutral pill, text in body colour. Colour only carries urgency (a small dot), never decoration.
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";
const DOT: Record<Tone, string> = { success: "bg-ok-dot", warning: "bg-warn-dot", danger: "bg-danger-dot", info: "bg-faint", neutral: "bg-faint", brand: "bg-faint" };
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill bg-sunken px-2.5 text-[13px] text-fg", className)}>
      <span className={cn("size-1.5 shrink-0 rounded-pill", DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}
/** Urgency as text: red for late, amber-brown for due, plain otherwise. */
export function Urgent({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn(tone === "danger" ? "text-danger" : tone === "warning" ? "text-warn" : "text-muted", className)}>{children}</span>;
}
/** Inline notice (date check, duplicate warning): neutral box, coloured dot, headline in ink. */
export function Notice({ tone, children, className, ...rest }: { tone: Tone; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex gap-2.5 rounded-control border border-line bg-canvas px-3.5 py-3 text-[14px] text-ink", className)} {...rest}>
      <span className={cn("mt-[7px] size-2 shrink-0 rounded-pill", DOT[tone])} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
