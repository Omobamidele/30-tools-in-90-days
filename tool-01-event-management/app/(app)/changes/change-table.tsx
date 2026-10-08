import Link from "next/link";
import { changeStatusLabels, type ChangeStatus } from "@/core/changes/state";
import { formatMoney } from "@/core/money";
import { Status, type Tone } from "@/ui/status";
import { Table, Td, Th, Tr } from "@/ui/table";

export const changeTone: Record<ChangeStatus, Tone> = {
  DRAFT: "neutral",
  INTERNAL_REVIEW: "watch",
  SENT_TO_CLIENT: "active",
  APPROVED: "settled",
  APPLIED: "settled",
  REJECTED: "muted",
  EXPIRED: "watch",
  WITHDRAWN: "muted",
};

type Row = {
  id: string;
  number: number;
  title: string;
  status: ChangeStatus;
  eventId: string;
  eventName: string;
  creatorName: string;
  currency: string;
  priceDeltaMinor: number;
  attendanceDelta: number;
  createdAt: Date;
};

export function ChangeTable({ rows, showEvent }: { rows: Row[]; showEvent: boolean }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Change</Th>
          {showEvent ? <Th>Event</Th> : null}
          <Th>Status</Th>
          <Th>Raised by</Th>
          <Th align="right">Attendance</Th>
          <Th align="right">Price change</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id}>
            <Td className="max-w-80">
              <Link href={`/changes/${r.id}`} className="block truncate font-medium hover:underline">
                <span className="num text-muted">CR-{r.number}</span> {r.title}
              </Link>
            </Td>
            {showEvent ? (
              <Td className="max-w-60 truncate">
                <Link href={`/events/${r.eventId}`} className="hover:underline">
                  {r.eventName}
                </Link>
              </Td>
            ) : null}
            <Td>
              <Status tone={changeTone[r.status]}>{changeStatusLabels[r.status]}</Status>
            </Td>
            <Td className="whitespace-nowrap">{r.creatorName}</Td>
            <Td align="right">{r.attendanceDelta ? `${r.attendanceDelta > 0 ? "+" : ""}${r.attendanceDelta}` : "–"}</Td>
            <Td align="right">
              {r.priceDeltaMinor ? `${r.priceDeltaMinor > 0 ? "+" : "−"}${formatMoney(Math.abs(r.priceDeltaMinor), r.currency)}` : "–"}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
