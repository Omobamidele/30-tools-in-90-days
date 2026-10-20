"use client";
import * as React from "react";
import { type ColumnDef, type SortingState, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, THead, TH, TR, TD } from "./ui/table";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/card";
import { cn } from "./ui/cn";

type Meta = { align?: "right"; className?: string };

export function DataTable<T>({ columns, data, onRowClick, rowId, selectedId, empty, loading, pageSize = 10, initialSort = [] }: {
  columns: ColumnDef<T, unknown>[]; data: T[]; onRowClick?: (row: T) => void; rowId: (row: T) => string; selectedId?: string | null;
  empty: React.ReactNode; loading?: boolean; pageSize?: number; initialSort?: SortingState;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSort);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });
  const table = useReactTable({
    data, columns, state: { sorting, pagination }, onSortingChange: setSorting, onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    getRowId: rowId, enableSortingRemoval: true, autoResetPageIndex: false,
  });
  React.useEffect(() => { setPagination((p) => ({ ...p, pageIndex: 0 })); }, [data.length]);
  const total = data.length; const { pageIndex } = table.getState().pagination;
  const from = total ? pageIndex * pageSize + 1 : 0; const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const meta = (h.column.columnDef.meta || {}) as Meta; const s = h.column.getIsSorted();
                return (
                  <TH key={h.id} className={cn(meta.align === "right" && "text-right", meta.className)} aria-sort={s === "asc" ? "ascending" : s === "desc" ? "descending" : undefined}>
                    {h.column.getCanSort() ? (
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 rounded hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40", meta.align === "right" && "flex-row-reverse", s && "text-gray-900")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {s === "asc" ? <ChevronUp className="size-3.5" aria-hidden /> : s === "desc" ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronsUpDown className="size-3.5 text-gray-300" aria-hidden />}
                      </button>
                    ) : flexRender(h.column.columnDef.header, h.getContext())}
                  </TH>
                );
              })}
            </tr>
          ))}
        </THead>
        <tbody>
          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <TR key={i}>{columns.map((_, j) => <TD key={j}><Skeleton className={cn("h-3.5", j === 0 ? "w-40" : "w-16")} /></TD>)}</TR>
          )) : table.getRowModel().rows.map((row) => (
            <TR key={row.id} data-row={row.id} data-state={selectedId === row.id ? "selected" : undefined}
              className={cn(onRowClick && "cursor-pointer hover:bg-gray-50", selectedId === row.id && "bg-brand-50/60 hover:bg-brand-50/60")}
              onClick={(ev) => { if ((ev.target as HTMLElement).closest("button,a,input")) return; onRowClick?.(row.original); }}>
              {row.getVisibleCells().map((cell) => {
                const meta = (cell.column.columnDef.meta || {}) as Meta;
                return <TD key={cell.id} className={cn(meta.align === "right" && "text-right tabular-nums", meta.className)}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>;
              })}
            </TR>
          ))}
        </tbody>
      </Table>
      {!loading && total === 0 ? empty : null}
      {!loading && total > pageSize ? (
        <div className="flex items-center gap-2 border-t border-gray-100 px-5 py-3 text-[12px] text-gray-500">
          <span className="tabular-nums" data-testid="range">Showing {from}–{to} of {total}</span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft />Previous</Button>
          <Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">Next<ChevronRight /></Button>
        </div>
      ) : !loading && total ? <div className="border-t border-gray-100 px-5 py-3 text-[12px] tabular-nums text-gray-500" data-testid="range">Showing {from}–{to} of {total}</div> : null}
    </>
  );
}
