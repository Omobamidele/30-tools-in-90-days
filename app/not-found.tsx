import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md panel px-6 py-8">
        <h1 className="text-section font-semibold">Page not found</h1>
        <p className="mt-1 text-table text-muted">Check the address, or start again from the overview.</p>
        <Link href="/" className="mt-5 inline-flex h-8 items-center rounded-control bg-brand px-3 text-body font-medium text-white hover:brightness-110">
          Go to overview
        </Link>
      </div>
    </main>
  );
}
