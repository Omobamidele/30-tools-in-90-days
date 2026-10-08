import { ButtonLink } from "@/ui/page";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="panel px-6 py-8">
        <h1 className="text-section font-semibold">Record not found</h1>
        <p className="mt-1 text-table text-muted">
          It may have been removed, or it belongs to an event you aren&apos;t a member of. Ask the event owner to add you if you need access.
        </p>
        <div className="mt-5 flex gap-2">
          <ButtonLink href="/events" variant="primary">
            Go to events
          </ButtonLink>
          <ButtonLink href="/">Go to overview</ButtonLink>
        </div>
      </div>
    </div>
  );
}
