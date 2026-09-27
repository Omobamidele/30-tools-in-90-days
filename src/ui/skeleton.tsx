import { cx } from "./cx";

/** Grey placeholder bar. Static (no shimmer) to keep motion out of the product. */
export function Bone({ className }: { className?: string }) {
  return <div aria-hidden className={cx("rounded-control bg-sunken", className)} />;
}

/** Page header + a table-shaped panel: the shape of every list screen. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-7xl" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Bone className="mb-2 h-3 w-24" />
      <Bone className="mb-5 h-6 w-56" />
      <div className="panel">
        <div className="flex gap-3 border-b border-rule px-4 py-3">
          <Bone className="h-7 w-48" />
          <Bone className="h-7 w-28" />
          <Bone className="h-7 w-28" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-rule px-4 py-3 last:border-b-0">
            <Bone className="h-4 w-1/4" />
            <Bone className="h-4 w-1/6" />
            <Bone className="h-4 w-1/6" />
            <Bone className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Figures + panel: used inside a record (e.g. the event tabs), where the header is already on screen. */
export function PanelSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel px-4 py-3">
            <Bone className="mb-2 h-3 w-20" />
            <Bone className="h-6 w-28" />
          </div>
        ))}
      </div>
      <div className="panel p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Bone key={i} className="mb-3 h-4 last:mb-0" />
        ))}
      </div>
    </div>
  );
}
