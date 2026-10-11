import type { Metadata } from "next";
import { appCtx } from "@/services/app-ctx";
import { SignalStory } from "../signal-story";

export const metadata: Metadata = { title: "Signal" };

export default async function SignalPage({ params, searchParams }: PageProps<"/signals/[id]">) {
  const { id } = await params;
  const { view } = (await searchParams) as { view?: string };
  const ctx = await appCtx();
  return <SignalStory ctx={ctx} id={id} view={view} />;
}
