import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { getDb } from "@/db/client";
import { getApproval } from "@/services/changes";
import { formatMoney } from "@/core/money";
import { ApprovalForm } from "./approval-form";

export const metadata: Metadata = { title: "Review change request", robots: { index: false, follow: false } };

const signed = (m: number, ccy: string) => `${m > 0 ? "+" : m < 0 ? "−" : ""}${formatMoney(Math.abs(m), ccy)}`;

// Public, token-gated, no app chrome: one decision (docs/04 §5.9).
export default async function ApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getApproval(getDb(), token, new Date());

  if (result.state === "invalid") {
    return (
      <Shell>
        <h1 className="font-display text-title font-medium">This link isn&apos;t valid</h1>
        <p className="mt-2 text-body text-muted">Check that you opened the full link from the email, or ask the sender for a new one.</p>
      </Shell>
    );
  }

  const v = result.view;
  const deadline = new Date(v.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return (
    <Shell brand={v.brandColor} agency={v.agencyName}>
      <p className="text-table text-muted">
        Change request <span className="num">CR-{v.number}</span> · {v.eventName}
      </p>
      <h1 className="mt-0.5 font-display text-title font-medium">{v.title}</h1>
      {v.reason ? <p className="mt-2 text-body whitespace-pre-line">{v.reason}</p> : null}

      <section aria-labelledby="changes" className="mt-5">
        <h2 id="changes" className="text-section font-semibold">
          What changes
        </h2>
        <table className="mt-1 w-full text-table">
          <tbody>
            {v.attendanceDelta ? (
              <tr className="border-t border-rule">
                <td className="py-2">Attendance</td>
                <td className="num py-2 text-right">
                  {v.attendanceDelta > 0 ? "+" : "−"}
                  {Math.abs(v.attendanceDelta)}
                </td>
              </tr>
            ) : null}
            {v.lines.map((l, i) => (
              <tr key={i} className="border-t border-rule">
                <td className="py-2 pr-3">{l.description}</td>
                <td className="num py-2 text-right whitespace-nowrap">{signed(l.priceDeltaMinor, v.currency)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink font-semibold">
              <td className="py-2">Price change</td>
              <td className="num py-2 text-right">{signed(v.priceDeltaMinor, v.currency)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {v.clientExposureDeltaMinor !== 0 ? (
        <section aria-labelledby="commitments" className="mt-4 rounded-control border border-rule bg-sunken px-3 py-2.5 text-table">
          <h2 id="commitments" className="font-semibold">
            Effect on existing commitments
          </h2>
          <p className="mt-0.5">
            Projected supplier charges that are yours to carry under your agreement{" "}
            {v.clientExposureDeltaMinor > 0 ? "rise" : "fall"} by{" "}
            <span className="num font-medium">{formatMoney(Math.abs(v.clientExposureDeltaMinor), v.exposureCurrency)}</span>.
          </p>
        </section>
      ) : null}

      <div className="mt-6">
        {result.state === "open" ? (
          <ApprovalForm token={token} agencyName={v.agencyName} deadline={deadline} />
        ) : result.state === "used" ? (
          <p role="status" className="rounded-control border border-rule px-3 py-2.5 text-body">
            {v.outcome === "APPROVE" ? "Approved" : "Rejected"} by {v.approverName}
            {v.decidedAt ? ` on ${new Date(v.decidedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}. Nothing more to do.
          </p>
        ) : (
          <p role="status" className="rounded-control border border-watch/40 bg-watch-bg px-3 py-2.5 text-body">
            This approval link has expired or been replaced. {v.agencyName} has been told and can send you a new one.
          </p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, brand, agency }: { children: React.ReactNode; brand?: string; agency?: string }) {
  return (
    <main className="min-h-dvh px-4 py-8" style={brand ? ({ "--brand": brand } as CSSProperties) : undefined}>
      <div className="mx-auto w-full max-w-xl">
        {agency ? <p className="mb-3 border-t-4 border-brand pt-3 text-body font-semibold">{agency}</p> : null}
        <div className="panel p-5 sm:p-6">{children}</div>
      </div>
    </main>
  );
}
