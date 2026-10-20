import { Suspense } from "react";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell";
import { RecordSheet } from "@/components/record";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AppShell>{children}</AppShell>
      <Suspense><RecordSheet /></Suspense>
    </StoreProvider>
  );
}
