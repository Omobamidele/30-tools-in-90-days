import { cn } from "./cn";
export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";
const TONES: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 before:bg-emerald-500",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20 before:bg-amber-500",
  danger: "bg-red-50 text-red-700 ring-red-600/20 before:bg-red-500",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20 before:bg-sky-500",
  neutral: "bg-gray-50 text-gray-600 ring-gray-500/20 before:bg-gray-400",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20 before:bg-brand-600",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset before:size-1.5 before:rounded-full before:content-['']", TONES[tone], className)}>
      {children}
    </span>
  );
}
