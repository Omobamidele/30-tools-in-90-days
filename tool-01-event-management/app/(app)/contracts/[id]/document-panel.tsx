"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "@/ui/icons";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form-error";
import { Panel } from "@/ui/page";
import { Status } from "@/ui/status";
import { useAction } from "@/ui/use-action";
import { readTermsAction, uploadDocumentAction } from "../document-actions";

export type DocView = { id: string; filename: string; pageCount: number | null; hasTextLayer: boolean | null; uploadedText: string } | null;
export type RunView = {
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "NOT_APPLICABLE";
  reason: string | null;
  proposedCount: number;
  finishedText: string | null;
} | null;

export function DocumentPanel({
  contractId,
  doc,
  run,
  proposedOpen,
  canEdit,
  canRead,
  extractionAvailable,
  extractionUnavailableReason,
}: {
  contractId: string;
  doc: DocView;
  run: RunView;
  proposedOpen: number;
  canEdit: boolean;
  canRead: boolean;
  extractionAvailable: boolean;
  extractionUnavailableReason: string | null;
}) {
  const router = useRouter();
  const upload = useAction(uploadDocumentAction);
  const read = useAction(readTermsAction);
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const busy = run?.status === "QUEUED" || run?.status === "RUNNING";

  // While terms are being read, refresh every few seconds; the page updates when done.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function onUpload() {
    const f = input.current?.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.set("file", f);
    const res = await upload.run(contractId, form);
    if (res.ok) {
      setFileName(null);
      if (input.current) input.current.value = "";
      router.refresh();
    }
  }

  return (
    <Panel title="Signed contract" description="Keep the signed PDF with the terms it created.">
      <div className="flex flex-col gap-3 p-4">
        <FormError message={upload.error ?? read.error} />
        {doc ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-table text-brand hover:underline">
              <FileText size={16} aria-hidden />
              <span className="truncate">{doc.filename}</span>
            </a>
            <span className="text-meta text-muted">
              {doc.pageCount} page{doc.pageCount === 1 ? "" : "s"} · {doc.uploadedText}
              {doc.hasTextLayer === false ? " · scanned (no text layer)" : ""}
            </span>
          </div>
        ) : (
          <p className="text-table text-muted">No document attached.</p>
        )}

        {run ? (
          <div role="status" className="rounded-control border border-rule bg-sunken px-3 py-2 text-table">
            {busy ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden />
                Reading terms from {doc?.pageCount ?? "the"} page{doc?.pageCount === 1 ? "" : "s"}… You can leave this page; the terms will be waiting.
              </span>
            ) : run.status === "SUCCEEDED" ? (
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <Status tone={proposedOpen ? "watch" : "settled"}>
                    {run.proposedCount ? `${run.proposedCount} term${run.proposedCount === 1 ? "" : "s"} read` : "No terms found"}
                  </Status>
                  <span className="ml-2 text-muted">
                    {proposedOpen ? `${proposedOpen} waiting for review` : run.proposedCount ? "All reviewed" : "Enter terms manually."}
                    {run.finishedText ? ` · ${run.finishedText}` : ""}
                  </span>
                </span>
                {proposedOpen && canEdit ? (
                  <Link href={`/contracts/${contractId}/review`} className="inline-flex h-7 items-center rounded-control bg-brand px-2.5 text-table font-medium text-white hover:brightness-110">
                    Review terms
                  </Link>
                ) : null}
              </span>
            ) : (
              <span>
                <Status tone="watch">{run.status === "FAILED" ? "Couldn't read terms" : "Terms not read"}</Status>
                <span className="mt-0.5 block text-muted">{run.reason}</span>
              </span>
            )}
          </div>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center rounded-control border border-rule-strong bg-surface px-3 text-body font-medium hover:bg-sunken">
              {doc ? "Replace PDF" : "Choose PDF"}
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              />
            </label>
            {fileName ? (
              <>
                <span className="max-w-60 truncate text-table text-muted">{fileName}</span>
                <Button variant="primary" onClick={onUpload} disabled={upload.pending}>
                  {upload.pending ? "Uploading…" : "Upload"}
                </Button>
              </>
            ) : null}
            {doc && canRead && !busy ? (
              extractionAvailable && doc.hasTextLayer ? (
                <Button disabled={read.pending} onClick={async () => (await read.run(contractId)).ok && router.refresh()}>
                  Read terms from document
                </Button>
              ) : (
                <span className="text-meta text-muted">
                  {!doc.hasTextLayer ? "Scanned PDFs can't be read automatically. Enter terms manually." : extractionUnavailableReason}
                </span>
              )
            ) : null}
          </div>
        ) : null}
        <p className="text-meta text-muted">PDF only, up to 25 MB. Terms read from a document are proposals until someone confirms them.</p>
      </div>
    </Panel>
  );
}
