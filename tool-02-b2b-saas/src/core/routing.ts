// Routing an accepted signal to a seller (spec FR-16): the account owner first, then the
// segment's round-robin queue, then the sales leader. The reason is stored with the CSQL so
// nobody has to guess why it landed with them.

export type RoutingInput = {
  owner: { id: string; name: string; active: boolean } | null;
  segment: string | null;
  queues: Array<{ id: string; segment: string; name: string; members: Array<{ id: string; name: string; active: boolean }>; cursor: number }>;
  salesLead: { id: string; name: string } | null;
};

export type RoutingResult =
  | { ok: true; sellerId: string; reason: string; queueId?: string; nextCursor?: number }
  | { ok: false; reason: string };

export function routeCsql(input: RoutingInput): RoutingResult {
  if (input.owner?.active) return { ok: true, sellerId: input.owner.id, reason: `Account owner (${input.owner.name})` };
  const missing = input.owner ? `Owner ${input.owner.name} is inactive` : "No account owner";
  const queue = input.queues.find((q) => q.segment === input.segment);
  const members = queue?.members.filter((m) => m.active) ?? [];
  if (queue && members.length) {
    const pick = members[queue.cursor % members.length];
    return { ok: true, sellerId: pick.id, reason: `${missing}; ${queue.name} round-robin`, queueId: queue.id, nextCursor: (queue.cursor + 1) % members.length };
  }
  if (input.salesLead) return { ok: true, sellerId: input.salesLead.id, reason: `${missing}; sent to sales lead` };
  return { ok: false, reason: `${missing}, no queue for this segment and no sales lead. Set up routing in Settings.` };
}
