import { PanelSkeleton } from "@/ui/skeleton";

// Sits under the event header and tabs, so switching tabs keeps the record on screen.
export default function Loading() {
  return <PanelSkeleton />;
}
