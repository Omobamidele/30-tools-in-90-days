import { extractText, getDocumentProxy } from "unpdf";

export type PdfText = { pageCount: number; pages: string[]; hasTextLayer: boolean };

/** Per-page text. A document with almost no text is treated as a scan (no text layer). */
export async function readPdfText(data: Buffer): Promise<PdfText> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t) => t.replace(/\s+\n/g, "\n").trim());
  const chars = pages.reduce((n, p) => n + p.replace(/\s/g, "").length, 0);
  return { pageCount: totalPages, pages, hasTextLayer: chars >= 40 * Math.max(1, Math.min(totalPages, 3)) };
}

export function isPdf(data: Buffer): boolean {
  return data.subarray(0, 5).toString("latin1") === "%PDF-";
}
