import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/auth/policy";
import { loadEvent } from "../../load";
import { ChangeEditor } from "../../../../changes/change-editor";
import { changeEditorOptions } from "../../../../changes/editor-data";

export const metadata: Metadata = { title: "Raise change" };

export default async function NewChangePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, event, scope } = await loadEvent(id);
  if (!can(ctx.actor, "change.raise", scope)) redirect(`/events/${id}/changes`);
  const opts = await changeEditorOptions(ctx, id);
  return (
    <ChangeEditor
      {...opts}
      eventId={id}
      changeId={null}
      lockVersion={1}
      currency={event.baseCurrency}
      forecastAttendance={event.forecastAttendance}
      initial={{
        title: "",
        type: "HEADCOUNT",
        reason: "",
        attendanceDelta: "",
        requestedByType: "CLIENT",
        lines: [{ contractId: "", category: opts.categories[0], description: "", costDelta: "", priceDelta: "" }],
      }}
    />
  );
}
