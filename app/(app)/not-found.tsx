import { ButtonLink } from "@/ui/page";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="panel px-6 py-8">
        <h1 className="text-section font-semibold">Not found</h1>
        <p className="mt-1 text-table text-muted">It may not exist, or it belongs to an account outside your book. Ask a CS or sales leader if you need access.</p>
        <div className="mt-5 flex gap-2">
          <ButtonLink href="/signals" variant="primary">
            Go to signals
          </ButtonLink>
          <ButtonLink href="/">Go to overview</ButtonLink>
        </div>
      </div>
    </div>
  );
}
