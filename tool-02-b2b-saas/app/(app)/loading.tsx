// Skeleton shaped like the real content (docs/04 §4): a header line and card outlines with
// trace placeholders. No spinner.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-6 h-7 w-56 rounded-control bg-sunken" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="panel p-4">
            <div className="h-4 w-40 rounded bg-sunken" />
            <div className="mt-2 h-3 w-24 rounded bg-sunken" />
            <div className="mt-4 h-8 w-32 rounded bg-sunken" />
          </div>
        ))}
      </div>
    </div>
  );
}
