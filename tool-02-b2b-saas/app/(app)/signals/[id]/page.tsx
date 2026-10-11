import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { Breadcrumbs } from "@/ui/page";
import { SignalStory } from "../signal-story";

export const metadata: Metadata = { title: "Signal" };

export default async function SignalPage({ params }: PageProps<"/signals/[id]">) {
  const { id } = await params;
  const ctx = await appCtx();
  return (
    <>
      <Breadcrumbs items={[{ href: "/signals", label: "Signals" }, { label: "Signal" }]} />
      <SignalStory ctx={ctx} id={id} layout="page" />
    </>
  );
}
