"use client";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
export function ErrorBanner() {
  const { error, restore } = useStore();
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-800 ring-1 ring-inset ring-red-600/20">
      <AlertCircle className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{error} <span className="font-mono text-[12px] text-red-700/80">ref: local-storage/wet:v2</span></span>
      <Button size="sm" onClick={restore}>Retry with starting data</Button>
    </div>
  );
}
