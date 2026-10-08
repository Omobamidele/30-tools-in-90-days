"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SettingsSection } from "@/services/settings";
import { Button } from "@/ui/button";
import { FormError } from "@/ui/form-error";
import { Panel } from "@/ui/page";
import { useAction } from "@/ui/use-action";
import { saveSettingsAction } from "./actions";

/** A settings panel that saves one section of the organisation configuration. */
export function SettingsSectionForm<T>({
  id,
  section,
  title,
  description,
  initial,
  canEdit,
  children,
}: {
  id: string;
  section: SettingsSection;
  title: string;
  description?: string;
  initial: T;
  canEdit: boolean;
  children: (v: T, set: (patch: Partial<T>) => void, fe: (k: string) => string | undefined) => ReactNode;
}) {
  const router = useRouter();
  const save = useAction(saveSettingsAction);
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <section id={id} className="scroll-mt-16">
      <Panel title={title} description={description}>
        <fieldset disabled={!canEdit} className="flex flex-col gap-4 p-4">
          <FormError message={save.error} fieldErrors={save.fieldErrors} />
          {children(v, (patch) => {
            setSaved(false);
            setV({ ...v, ...patch });
          }, save.fe)}
          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                disabled={save.pending}
                onClick={async () => {
                  const res = await save.run(section, v);
                  if (res.ok) {
                    setSaved(true);
                    router.refresh();
                  }
                }}
              >
                Save {title.toLowerCase()}
              </Button>
              {saved ? <span role="status" className="text-table text-settled">Saved</span> : null}
            </div>
          ) : null}
        </fieldset>
      </Panel>
    </section>
  );
}
