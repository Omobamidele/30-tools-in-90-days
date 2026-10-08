"use client";

import { useState } from "react";
import { CalendarPlus } from "@/ui/icons";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";
import { issueCalendarTokenAction } from "./actions";

export function CalendarSubscribe({ appUrl, hasToken }: { appUrl: string; hasToken: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const issue = useAction(issueCalendarTokenAction);

  async function create() {
    const res = await issue.run();
    if (res.ok) setUrl(`${appUrl}/api/ics/${res.data.token}.ics`);
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CalendarPlus size={14} aria-hidden /> Subscribe in calendar
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Subscribe in your calendar" description="A private feed of the deadlines you own, with a reminder a day before each.">
        <div className="flex flex-col gap-3 text-body">
          {url ? (
            <>
              <p className="text-table">Add this link in your calendar app as a subscription (not an import) so it stays up to date.</p>
              <div className="flex gap-2">
                <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Calendar feed link" />
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-meta text-muted">Anyone with this link can see your deadlines. This is the only time it is shown.</p>
            </>
          ) : (
            <>
              <p className="text-table">
                {hasToken
                  ? "You already have a calendar link. Creating a new one stops the old link from working."
                  : "Create a private link to use in Google Calendar, Outlook or Apple Calendar."}
              </p>
              {issue.error ? <p className="text-table text-risk">{issue.error}</p> : null}
              <div>
                <Button variant="primary" onClick={create} disabled={issue.pending}>
                  {hasToken ? "Create a new link" : "Create link"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  );
}
