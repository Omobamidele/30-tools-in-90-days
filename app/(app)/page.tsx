import type { Metadata } from "next";
import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { Check } from "@/ui/icons";
import { requireActor } from "@/auth/session";
import { getDb } from "@/db/client";
import { clients, contracts, events } from "@/db/schema";
import { term } from "@/config/terms";
import { appCtx } from "@/services/app-ctx";
import { can } from "@/auth/policy";
import { Portfolio } from "./portfolio";
import { localDateOf } from "@/core/time";
import { formatDate } from "@/ui/format";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage() {
  const actor = await requireActor();
  const db = getDb();
  const orgId = actor.org.id;
  const { config } = actor.org;

  const [[c], [e], [k]] = await Promise.all([
    db.select({ n: count() }).from(clients).where(eq(clients.orgId, orgId)),
    db.select({ n: count() }).from(events).where(eq(events.orgId, orgId)),
    db.select({ n: count() }).from(contracts).where(eq(contracts.orgId, orgId)),
  ]);

  const activeContracts = await db.select({ n: count() }).from(contracts).where(and(eq(contracts.orgId, orgId), eq(contracts.status, "ACTIVE")));
  if (activeContracts[0].n > 0) {
    const ctx = await appCtx();
    return (
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="font-display text-title font-medium text-on-canvas">Overview</h1>
          <p className="text-table text-on-canvas-muted">
            {can(ctx.actor, "portfolio.view") ? "All open events" : "Your events"} · as of {formatDate(localDateOf(new Date(), ctx.actor.orgTimezone))}
          </p>
        </div>
        <Portfolio ctx={ctx} />
      </div>
    );
  }

  // First run: a real sequence, so numbered steps are justified (docs/04 §7).
  const steps = [
    {
      done: c.n > 0,
      title: `Add a ${term(config, "client", { lower: true })} and their liability rules`,
      detail: "Liability rules decide whether the agency or the client carries each penalty.",
      href: "/clients",
    },
    {
      done: e.n > 0,
      title: `Create an ${term(config, "event", { lower: true })}`,
      detail: "Dates, destination, forecast attendance and owner.",
      href: "/events",
    },
    {
      done: k.n > 0,
      title: "Upload a supplier contract",
      detail: "Confirm its terms to start tracking deadlines and exposure.",
      href: "/events",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-title font-medium text-on-canvas">Overview</h1>
      <section aria-labelledby="first-run" className="mt-5 panel">
        <div className="border-b border-rule px-5 py-3">
          <h2 id="first-run" className="text-section font-semibold">
            Set up your workspace
          </h2>
          <p className="text-table text-muted">Exposure figures appear here once a contract has confirmed terms.</p>
        </div>
        <ol className="divide-y divide-rule">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 px-5 py-3">
              <span
                className={
                  s.done
                    ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-settled text-white"
                    : "num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-rule-strong text-meta text-muted"
                }
                aria-hidden
              >
                {s.done ? <Check size={12} weight="bold" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={s.href} className="text-body font-medium text-brand hover:underline">
                  {s.title}
                </Link>
                <p className="text-table text-muted">{s.detail}</p>
              </div>
              {s.done ? <span className="text-meta text-settled">Done</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
