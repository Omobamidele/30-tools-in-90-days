"use client";
import { AlertCircle } from "@/components/icons";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { useStore } from "@/lib/store";
export function ErrorBanner() {
  const { error, restore } = useStore();
  if (!error) return null;
  return (
    <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-[14px] text-ink">
      <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden />
      <span className="flex-1">{error} Restoring the starting data clears the saved changes in this browser and fixes it.</span>
      <Button size="sm" onClick={() => { restore(); toast("Starting data restored"); }}>Restore starting data</Button>
    </div>
  );
}
