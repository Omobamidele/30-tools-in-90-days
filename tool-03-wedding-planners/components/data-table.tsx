"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ColumnDef, type SortingState, flexRender, getCoreRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from "@/components/icons";
import { Table, THead, TH, TR, TD } from "./ui/table";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/card";
import { cn } from "./ui/cn";

type Meta = { align?: "right"; className?: string };

export function DataTable<T>({ columns, data, onRowClick, rowId, selectedId, empty, loading, pageSize = 10, initialSort = [], urlKey = "" }: {
  columns: ColumnDef<T, unknown>[]; data: T[]; onRowClick?: (row: T) => void; rowId: (row: T) => string; selectedId?: string | null;
  empty: React.ReactNode; loading?: boolean; pageSize?: number; initialSort?: SortingState; urlKey?: string;
}) {
  // Sort and page live in the URL (?sort=received.desc&page=2) so refresh, Back and shared links keep them.
  const router = useRouter(); const path = usePathname(); const params = useSearchParams();
  const sk = `${urlKey}sort`, pk = `${urlKey}page`;
  const rawSort = params.get(sk);
  const sorting: SortingState = rawSort === "none" ? [] : rawSort ? [{ id: rawSort.split(".")[0], desc: rawSort.endsWith(".desc") }] : initialSort;
  const pageIndex0 = Math.max(0, Number(params.get(pk) || 1) - 1);
  const write = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null) sp.delete(k); else sp.set(k, v); }
    router.replace(`${path}?${sp}`, { scroll: false });
  };
  const setSorting = (u: SortingState | ((o: SortingState) => SortingState)) => {
    const next = typeof u === "function" ? u(sorting) : u;
    const init = initialSort[0]; const n = next[0];
    const same = n && init && n.id === init.id && n.desc === init.desc;
    write({ [sk]: !n ? "none" : same ? null : `${n.id}.${n.desc ? "desc" : "asc"}`, [pk]: null });
  };
  const pagination = { pageIndex: pageIndex0, pageSize };
  const setPagination = (u: { pageIndex: number; pageSize: number } | ((o: { pageIndex: number; pageSize: number }) => { pageIndex: number; pageSize: number })) => {
    const next = typeof u === "function" ? u(pagination) : u;
    write({ [pk]: next.pageIndex ? String(next.pageIndex + 1) : null });
  };
  const table = useReactTable({
    data, columns, state: { sorting, pagination }, onSortingChange: setSorting, onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    getRowId: rowId, enableSortingRemoval: true, autoResetPageIndex: false,
  });
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
                      <button type="button" onClick={h.column.getToggleSortingHandler()} className={cn("inline-flex items-center gap-1 rounded-control hover:text-ink", meta.align === "right" && "flex-row-reverse", s && "text-ink")}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {s === "asc" ? <ChevronUp className="size-3.5" aria-hidden /> : s === "desc" ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronsUpDown className="size-3.5 text-faint" aria-hidden />}
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
            <TR key={i}>{columns.map((_, j) => <TD key={j}><Skeleton className={cn("h-4", j === 0 ? "w-14" : j === 1 ? "w-44" : "w-20")} /></TD>)}</TR>
          )) : table.getRowModel().rows.map((row) => (
            <TR key={row.id} data-row={row.id} data-state={selectedId === row.id ? "selected" : undefined}
              className={cn(onRowClick && "cursor-pointer hover:bg-canvas", selectedId === row.id && "bg-sunken hover:bg-sunken")}
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
        <div className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-muted">
          <span className="tabular-nums" data-testid="range">Showing {from}–{to} of {total}</span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft />Previous</Button>
          <Button size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">Next<ChevronRight /></Button>
        </div>
      ) : !loading && total ? <div className="border-t border-line px-5 py-3 text-[13px] text-muted" data-testid="range">Showing {from}–{to} of {total}</div> : null}
    </>
  );
}
