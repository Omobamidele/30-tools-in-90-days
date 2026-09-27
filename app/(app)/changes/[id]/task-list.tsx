"use client";

import { useRouter } from "next/navigation";
import { useAction } from "@/ui/use-action";
import { cx } from "@/ui/cx";
import { completeTaskAction } from "../actions";

export function TaskList({ tasks, canEdit }: { tasks: Array<{ id: string; title: string; done: boolean }>; canEdit: boolean }) {
  const router = useRouter();
  const toggle = useAction(completeTaskAction);
  return (
    <ul className="divide-y divide-rule">
      {tasks.map((t) => (
        <li key={t.id} className="px-4 py-2">
          <label className={cx("flex items-start gap-2.5 text-table", t.done && "text-muted line-through")}>
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand)]"
              checked={t.done}
              disabled={!canEdit || toggle.pending}
              onChange={async (e) => (await toggle.run(t.id, e.target.checked)).ok && router.refresh()}
            />
            {t.title}
          </label>
        </li>
      ))}
    </ul>
  );
}
