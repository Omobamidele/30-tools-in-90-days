import Papa from "papaparse";
import ExcelJS from "exceljs";

// Reads a pickup report attachment (CSV or Excel .xlsx) into header + rows of strings, the
// shape mapPickupCsv (src/core/pickup-csv.ts) already takes from the browser import.

export type ReportRows = { headers: string[]; rows: Array<Record<string, string>> };

export class UnsupportedReport extends Error {}

const isXlsx = (filename: string, contentType: string) =>
  /\.xlsx$/i.test(filename) || contentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const isCsv = (filename: string, contentType: string) => /\.csv$/i.test(filename) || contentType === "text/csv";

export function isReportFile(filename: string, contentType: string) {
  return isXlsx(filename, contentType) || isCsv(filename, contentType) || /\.xls$/i.test(filename);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Excel cells can be dates, numbers, formulas or rich text: all become plain text. */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  if (typeof value === "object") {
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    return "";
  }
  return String(value).trim();
}

export async function readReportRows(file: { filename: string; contentType: string; data: Buffer }, sheet?: string | null): Promise<ReportRows> {
  if (/\.xls$/i.test(file.filename)) {
    throw new UnsupportedReport("Old Excel files (.xls) can't be read. Ask the hotel to send .xlsx or CSV.");
  }
  if (isXlsx(file.filename, file.contentType)) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.data as unknown as ArrayBuffer);
    } catch {
      throw new UnsupportedReport("The Excel file couldn't be opened. It may be damaged or password-protected.");
    }
    const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
    if (!ws) throw new UnsupportedReport(sheet ? `The report has no sheet called "${sheet}".` : "The Excel file has no sheets.");
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col - 1] = cellText(cell.value);
    });
    const rows: Array<Record<string, string>> = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const record: Record<string, string> = {};
      let any = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const v = cellText(row.getCell(i + 1).value);
        if (v) any = true;
        record[h] = v;
      });
      if (any) rows.push(record);
    }
    return { headers: headers.filter(Boolean), rows };
  }
  if (isCsv(file.filename, file.contentType)) {
    const parsed = Papa.parse<Record<string, string>>(file.data.toString("utf8").replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy" });
    return { headers: (parsed.meta.fields ?? []).map((h) => h.trim()), rows: parsed.data };
  }
  throw new UnsupportedReport("Only CSV and Excel (.xlsx) reports can be read.");
}
