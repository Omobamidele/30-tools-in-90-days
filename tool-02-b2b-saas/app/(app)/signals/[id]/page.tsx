import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { PageHeader } from "@/ui/page";
import { SignalStory } from "../signal-story";

export const metadata: Metadata = { title: "Signal" };

export default async function SignalPage({ params }: PageProps<"/signals/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
  return (
    <>
      <PageHeader crumbs={[{ href: "/signals", label: "Signals" }, { label: "Signal" }]} title="Signal" />
      <SignalStory ctx={ctx} id={id} layout="page" />
    </>
  );
}
