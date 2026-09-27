"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/field";
import { FormError } from "@/ui/form-error";
import { useAction } from "@/ui/use-action";
import { COVERS } from "@/config/imagery";
import { Photo } from "@/ui/photo";
import { cx } from "@/ui/cx";
import { createEventAction, updateEventAction } from "./actions";

export type EventFormValues = {
  clientId: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  destination: string;
  timezone: string;
  ownerId: string;
  forecastAttendance: string;
  baseCurrency: string;
  exposureThreshold: string;
  memberIds: string[];
  /** Cover photo key, or "" for none. */
  coverImage: string;
};

export function EventForm({
  eventId,
  lockVersion,
  initial,
  clients,
  users,
  eventTypes,
  currencies,
  timezones,
  ownerLocked,
  labels,
}: {
  eventId?: string;
  lockVersion?: number;
  initial: EventFormValues;
  clients: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string }>;
  eventTypes: string[];
  currencies: string[];
  timezones: string[];
  ownerLocked: boolean;
  labels: { client: string; event: string };
}) {
  const router = useRouter();
  const create = useAction(createEventAction);
  const update = useAction(updateEventAction);
  const a = eventId ? update : create;
  const [members, setMembers] = useState<string[]>(initial.memberIds);
  const [ownerId, setOwnerId] = useState(initial.ownerId);
  const [cover, setCover] = useState(initial.coverImage);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = { ...Object.fromEntries(new FormData(e.currentTarget)), memberIds: members, ownerId };
    if (eventId) {
      const res = await update.run(eventId, values, lockVersion!);
      if (res.ok) {
        router.push(`/events/${eventId}`);
        router.refresh();
      }
    } else {
      const res = await create.run(values);
      if (res.ok) router.push(`/events/${res.data.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4" noValidate>
      <FormError message={a.error} fieldErrors={a.fieldErrors} />
      <Field label={`${labels.event} name`} required error={a.fe("name")}>
        {(p) => <Input {...p} name="name" defaultValue={initial.name} autoFocus />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={labels.client} required error={a.fe("clientId")}>
          {(p) => (
            <Select {...p} name="clientId" defaultValue={initial.clientId}>
              <option value="">Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Type" required error={a.fe("type")}>
          {(p) => (
            <Select {...p} name="type" defaultValue={initial.type}>
              <option value="">Choose…</option>
              {eventTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Start date" required error={a.fe("startDate")}>
          {(p) => <Input {...p} name="startDate" type="date" defaultValue={initial.startDate} />}
        </Field>
        <Field label="End date" required error={a.fe("endDate")}>
          {(p) => <Input {...p} name="endDate" type="date" defaultValue={initial.endDate} />}
        </Field>
        <Field label="Destination" error={a.fe("destination")}>
          {(p) => <Input {...p} name="destination" defaultValue={initial.destination} placeholder="City, country" />}
        </Field>
        <Field
          label="Timezone"
          required
          help="Supplier deadlines are shown in this timezone"
          error={a.fe("timezone")}
        >
          {(p) => (
            <Select {...p} name="timezone" defaultValue={initial.timezone}>
              {timezones.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Forecast attendance" required error={a.fe("forecastAttendance")}>
          {(p) => (
            <Input {...p} name="forecastAttendance" type="number" min={0} inputMode="numeric" className="num" defaultValue={initial.forecastAttendance} />
          )}
        </Field>
        <Field label="Reporting currency" required error={a.fe("baseCurrency")}>
          {(p) => (
            <Select {...p} name="baseCurrency" defaultValue={initial.baseCurrency}>
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Owner" required error={a.fe("ownerId")} help={ownerLocked ? "You own events you create" : undefined}>
          {(p) => (
            <Select {...p} value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={ownerLocked}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label="Exposure alert threshold"
          help="Leave empty to use the workspace default"
          error={a.fe("exposureThreshold")}
        >
          {(p) => <Input {...p} name="exposureThreshold" inputMode="decimal" className="num" defaultValue={initial.exposureThreshold} />}
        </Field>
      </div>
      <fieldset>
        <legend className="text-table font-medium">Cover photo</legend>
        <p className="text-meta text-muted">Shown on the event&apos;s header, board card and lists, so the team recognises it at a glance.</p>
        {a.fe("coverImage") ? <p className="mt-1 text-meta text-risk">{a.fe("coverImage")}</p> : null}
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {[{ key: "", label: "No cover" }, ...COVERS].map((c) => {
            const on = cover === c.key;
            const photo = COVERS.find((x) => x.key === c.key) ?? null;
            return (
              <label key={c.key || "none"} className="group cursor-pointer">
                <input type="radio" name="coverImage" value={c.key} checked={on} onChange={() => setCover(c.key)} className="peer sr-only" />
                <span
                  className={cx(
                    "block rounded-[8px] border-2 p-0.5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                    on ? "border-brand" : "border-transparent group-hover:border-rule-strong",
                  )}
                >
                  <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[6px] bg-sunken">
                    {photo ? <Photo photo={photo} sizes="128px" /> : null}
                  </span>
                </span>
                <span className={cx("mt-1 block truncate text-meta", on ? "font-medium text-ink" : "text-muted")}>{c.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-table font-medium">Team</legend>
        <p className="text-meta text-muted">Team members can work on this event alongside the owner.</p>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
          {users
            .filter((u) => u.id !== ownerId)
            .map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-table">
                <input
                  type="checkbox"
                  checked={members.includes(u.id)}
                  onChange={(e) => setMembers((m) => (e.target.checked ? [...m, u.id] : m.filter((x) => x !== u.id)))}
                  className="size-4 accent-[var(--brand)]"
                />
                {u.name}
              </label>
            ))}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={a.pending}>
          {eventId ? "Save changes" : `Create ${labels.event.toLowerCase()}`}
        </Button>
        <Button onClick={() => router.push(eventId ? `/events/${eventId}` : "/events")}>Cancel</Button>
      </div>
    </form>
  );
}
