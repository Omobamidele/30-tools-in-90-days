import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { getClientShareView } from "@/services/client-share";
import { clientIp, isRateLimited } from "@/services/rate-limit";
import { findCover } from "@/config/imagery";
import { formatMoneyShort } from "@/core/money";
import { Photo } from "@/ui/photo";
import { MoneyShort } from "@/ui/money";
import { formatDate, formatDateRange, formatDateTime } from "@/ui/format";
import { localDateOf } from "@/core/time";

export const metadata: Metadata = { title: "Your events", robots: { index: false, follow: false } };

// The client's view (milestone 14): their own figures in plain words. Public, rate-limited,
// no app shell. Nothing agency-side (their share, margins, notes) is ever in this view model.
export default async function ClientSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const h = await headers();
  if (isRateLimited(`share:${clientIp(h)}`, 60, 10 * 60_000) || isRateLimited(`share-token:${token}`, 120, 10 * 60_000)) {
    return <Closed title="Too many requests" body="Wait a few minutes, then reload this page." />;
  }
  const view = await getClientShareView(getDb(), token);
  if (view.state !== "open") {
    const closed = {
      invalid: ["This link doesn't work", "Check that you copied the whole link, or ask your event agency for a new one."],
      revoked: ["This link was turned off", "Ask your event agency for a new link."],
      expired: ["This link has expired", "Ask your event agency for a new link."],
    }[view.state];
    return <Closed title={closed[0]} body={closed[1]} />;
  }

  // A total in one sentence only when every event is in the same currency.
  const currencies = [...new Set(view.events.map((e) => e.currency))];
  const total = currencies.length === 1 ? view.events.reduce((s, e) => s + e.yourShareMinor, 0) : null;

  return (
    <main
      className="min-h-dvh bg-canvas"
      style={{ "--brand": view.brandColor, "--accent": view.accentColor } as CSSProperties}
    >
      <header className="on-midnight bg-midnight px-4 py-10 text-white md:px-10">
        <div className="mx-auto max-w-5xl">
          <p className="flex items-center gap-2 text-meta font-semibold tracking-[0.08em] text-[#d5dae3] uppercase">
            <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-accent" />
            {view.agencyName} for {view.clientName}
          </p>
          <h1 className="mt-3 font-display text-hero font-medium">Your events with us</h1>
          <p className="mt-3 max-w-3xl text-section text-[#d5dae3]">
            {view.events.length === 0
              ? "You have no upcoming events with open supplier contracts right now."
              : total !== null
                ? `If nothing changes, your share of supplier penalties across ${view.events.length} event${view.events.length === 1 ? "" : "s"} is about ${formatMoneyShort(total, currencies[0])}.`
                : `Here is where your ${view.events.length} upcoming events stand with suppliers.`}
            {view.approvals.length ? ` ${view.approvals.length} change${view.approvals.length === 1 ? " is" : "s are"} waiting for your approval.` : ""}
          </p>
        </div>
      </header>

      <div className="px-4 py-8 md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {view.approvals.length ? (
          <section aria-labelledby="approvals" className="panel">
            <h2 id="approvals" className="border-b border-rule px-5 py-3.5 text-section font-semibold">
              Waiting for your approval
            </h2>
            <ul className="divide-y divide-rule">
              {view.approvals.map((a) => (
                <li key={a.number} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-table">
                  <span>
                    <span className="font-medium">
                      CR-{a.number}: {a.title}
                    </span>
                    <span className="block text-meta text-muted">{a.eventName} · approve or decline from the link in your email</span>
                  </span>
                  <MoneyShort minor={a.priceMinor} currency={a.currency} className="font-display text-section font-medium" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {view.events.map((e) => (
          <article key={e.id} className="panel overflow-hidden">
            <div className="relative h-32 bg-midnight">
              <Photo photo={findCover(e.coverImage)} sizes="(min-width: 1024px) 960px, 100vw" />
              <div aria-hidden className="absolute inset-0" style={{ background: "var(--scrim-card)" }} />
              <div className="absolute right-5 bottom-3 left-5 text-white">
                <h2 className="font-display text-title font-medium [text-shadow:0_1px_2px_rgb(14_23_38/0.5)]">{e.name}</h2>
                <p className="text-table text-[#e4e7ec]">
                  {formatDateRange(e.startDate, e.endDate)}
                  {e.destination ? ` · ${e.destination}` : ""}
                </p>
              </div>
            </div>
            <dl className="grid gap-x-8 gap-y-4 px-5 py-4 sm:grid-cols-3">
              <div>
                <dt className="text-table font-medium">Your share if nothing changes</dt>
                <dd className="mt-1 font-display text-figure font-medium">
                  <MoneyShort minor={e.yourShareMinor} currency={e.currency} />
                </dd>
                <dd className="text-meta text-faint">unused rooms and catering minimums, under your agreement with us</dd>
              </div>
              <div>
                <dt className="text-table font-medium">Your cost to cancel today</dt>
                <dd className="mt-1 font-display text-figure font-medium">
                  <MoneyShort minor={e.yourCancellationMinor} currency={e.currency} />
                </dd>
                <dd className="text-meta text-faint">
                  {e.nextRise ? `Supplier cancellation fees go up on ${formatDate(localDateOf(e.nextRise.date, e.nextRise.tz))}.` : "No fee increases before the event."}
                </dd>
              </div>
              <div>
                <dt className="text-table font-medium">What we&apos;ve done</dt>
                <dd className="mt-1 text-table text-muted">
                  {e.roomsGivenBack.length
                    ? e.roomsGivenBack.map((r, i) => (
                        <span key={i} className="block">
                          Gave back {r.roomNights} unused room night{r.roomNights === 1 ? "" : "s"} ({formatDate(r.at.toISOString().slice(0, 10))})
                        </span>
                      ))
                    : "We watch every supplier deadline and will tell you before any cost to you goes up."}
                </dd>
              </div>
            </dl>
            {!e.complete ? <p className="border-t border-rule px-5 py-2.5 text-meta text-watch">Some figures for this event are still being confirmed with suppliers.</p> : null}
          </article>
        ))}

        <p className="text-meta text-faint">
          Figures as of {formatDateTime(view.asOf, view.timezone)} are estimates worked out from your contracts and the latest bookings. {view.agencyName} will
          confirm any charge with you before invoicing.
        </p>
      </div>
      </div>
    </main>
  );
}

function Closed({ title, body }: { title: string; body: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="panel max-w-md p-6 text-center">
        <h1 className="font-display text-title font-medium">{title}</h1>
        <p className="mt-2 text-table text-muted">{body}</p>
      </div>
    </main>
  );
}
