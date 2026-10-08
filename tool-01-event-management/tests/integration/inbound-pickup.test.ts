import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent } from "@/services/events";
import { activateContract, addClause, amendContract, createContract, getContract } from "@/services/contracts";
import { latestPickup } from "@/services/pickup";
import { getInboundForBlocks, receiveInboundEmail, rotateInbound, setUpInbound } from "@/services/inbound-pickup";
import { setStorageForTests, type Storage } from "@/adapters/storage";
import { setEmailSenderForTests } from "@/adapters/email";
import { DomainError } from "@/services/errors";
import * as schema from "@/db/schema";

// Bookings that update themselves: emailed hotel pickup reports (milestone 14).

class MemoryStorage implements Storage {
  readonly driver = "memory";
  files = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.files.set(k, d);
  }
  async get(k: string) {
    return this.files.get(k)!;
  }
  async delete(k: string) {
    this.files.delete(k);
  }
}

let w: World;
let blockId: string;
let eventId: string;
const mapping = { dateColumn: "Stay date", pickedUpColumn: "Rooms picked up", forecastColumn: null, dateFormat: "EU" as const };
const csv = (rows: string[]) => Buffer.from(["Stay date,Rooms picked up,Rate code", ...rows].join("\n")).toString("base64");
const email = (to: string, attachment: { filename: string; contentType: string; contentBase64: string } | null, from = "Reservations <groups@hotelsol.example>") => ({
  to,
  from,
  subject: "Group pickup report",
  attachments: attachment ? [attachment] : [],
});

beforeAll(async () => {
  setStorageForTests(new MemoryStorage());
  setEmailSenderForTests({ driver: "disabled", send: async () => ({ sent: false, reason: "disabled" }) });
  w = await makeWorld();
  const ops = w.ctx("OPS_DIRECTOR");
  const client = await createClient(ops, { name: "Inbound Co" });
  const hotel = await createSupplier(ops, { name: "Hotel Sol", type: "HOTEL", city: "Seville" });
  eventId = (
    await createEvent(ops, {
      clientId: client.id,
      name: "Seville kickoff",
      type: "Sales kickoff",
      startDate: "2027-05-11",
      endDate: "2027-05-12",
      timezone: "Europe/Madrid",
      ownerId: w.people.EVENT_MANAGER.id,
      forecastAttendance: 120,
      baseCurrency: "EUR",
    })
  ).id;
  const k = await createContract(ops, eventId, { supplierId: hotel.id, title: "Rooms", currency: "EUR", contractedValue: "40,000.00" });
  await addClause(ops, k.id, {
    type: "ROOM_BLOCK",
    label: "Main block",
    terms: {
      blockName: "Main block",
      nights: [
        { date: "2027-05-10", rooms: 60, rateMinor: 15_000 },
        { date: "2027-05-11", rooms: 120, rateMinor: 15_000 },
      ],
      commitmentPct: 80,
      basis: "PER_NIGHT",
      cutoffDate: "2027-04-10",
    },
  });
  await activateContract(ops, k.id);
  blockId = (await getContract(ops, k.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!.id;
});
afterAll(async () => {
  setEmailSenderForTests(undefined);
  await closeTestDb();
});

const ownerNotes = () =>
  w.db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, w.people.EVENT_MANAGER.id), eq(schema.notifications.kind, "pickup")));

describe("emailed pickup reports", () => {
  let address = "";

  it("gives each block an address that survives lowercasing, and only pickup editors can set it up", async () => {
    // An event manager who isn't on this event can't (the owner can; owners update their own pickup).
    await expect(setUpInbound(w.ctx("EVENT_MANAGER_2"), blockId, { mapping })).rejects.toBeInstanceOf(DomainError);
    ({ address } = await setUpInbound(w.ctx("OPS_DIRECTOR"), blockId, { mapping }));
    expect(address).toMatch(/^pickup\+[a-z2-7]{26}@inbound\.localhost$/);
  });

  it("records a CSV report, re-evaluates, keeps the file and tells the event owner", async () => {
    const res = await receiveInboundEmail(
      w.db,
      email(address.toUpperCase(), { filename: "pickup.csv", contentType: "text/csv", contentBase64: csv(["10/05/2027,41,GRP", "11/05/2027,88,GRP", "12/05/2027,5,GRP"]) }),
      new Date("2027-03-01T09:00:00Z"),
    );
    expect(res).toMatchObject({ status: "recorded", nights: 2 });
    expect(res.status === "recorded" && res.message).toContain("129 of 180 room nights booked");
    expect(res.status === "recorded" && res.message).toContain("1 row for other nights was ignored");
    const latest = (await latestPickup(w.db, [blockId])).get(blockId)!;
    expect(latest.nights["2027-05-11"].pickedUp).toBe(88);
    const [snap] = await w.db.select().from(schema.pickupSnapshots).where(eq(schema.pickupSnapshots.clauseId, blockId));
    expect(snap.source).toBe("EMAIL");
    expect(snap.fileId).not.toBeNull();
    expect((await ownerNotes()).map((n) => n.title)).toContain("Pickup updated from Hotel Sol's report");
    const [view] = await getInboundForBlocks(w.ctx("OPS_DIRECTOR"), [blockId]);
    expect(view.lastResult?.ok).toBe(true);
  });

  it("ignores the same report sent twice", async () => {
    const before = (await ownerNotes()).length;
    const res = await receiveInboundEmail(w.db, email(address, { filename: "pickup.csv", contentType: "text/csv", contentBase64: csv(["10/05/2027,41,GRP", "11/05/2027,88,GRP", "12/05/2027,5,GRP"]) }));
    expect(res.status).toBe("duplicate");
    expect((await ownerNotes()).length).toBe(before);
  });

  it("reads Excel reports, including real date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pickup");
    ws.addRow(["Stay date", "Rooms picked up"]);
    ws.addRow([new Date(Date.UTC(2027, 4, 10)), 44]);
    ws.addRow([new Date(Date.UTC(2027, 4, 11)), 95]);
    const data = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await receiveInboundEmail(
      w.db,
      email(address, { filename: "pickup.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", contentBase64: data.toString("base64") }),
      new Date("2027-03-08T09:00:00Z"),
    );
    expect(res).toMatchObject({ status: "recorded", nights: 2 });
    expect((await latestPickup(w.db, [blockId])).get(blockId)!.nights["2027-05-11"].pickedUp).toBe(95);
  });

  it("rejects a report whose columns changed, and says which, without touching pickup", async () => {
    const res = await receiveInboundEmail(
      w.db,
      email(address, { filename: "new-format.csv", contentType: "text/csv", contentBase64: Buffer.from("Date,Picked up\n10/05/2027,50").toString("base64") }),
    );
    expect(res.status).toBe("rejected");
    expect(res.message).toContain('"Stay date", "Rooms picked up" are missing');
    expect((await latestPickup(w.db, [blockId])).get(blockId)!.nights["2027-05-11"].pickedUp).toBe(95);
    expect((await ownerNotes()).some((n) => n.title === "Hotel Sol's pickup report couldn't be used")).toBe(true);
  });

  it("rejects emails without a report attachment, and senders outside the allowed domain", async () => {
    expect((await receiveInboundEmail(w.db, email(address, null))).status).toBe("rejected");
    ({ address } = await setUpInbound(w.ctx("OPS_DIRECTOR"), blockId, { mapping, allowedSenderDomain: "hotelsol.es" }));
    const res = await receiveInboundEmail(w.db, email(address, { filename: "p.csv", contentType: "text/csv", contentBase64: csv(["10/05/2027,1,G"]) }, "someone@gmail.com"));
    expect(res.status).toBe("rejected");
    expect(res.message).toContain("only hotelsol.es addresses");
  });

  it("stops accepting an address once it's rotated", async () => {
    const old = address;
    const { address: fresh } = await rotateInbound(w.ctx("OPS_DIRECTOR"), blockId);
    expect(fresh).not.toBe(old);
    address = fresh;
    expect((await receiveInboundEmail(w.db, email(old, null))).status).toBe("unknown_address");
    const [view] = await getInboundForBlocks(w.ctx("OPS_DIRECTOR"), [blockId]);
    expect(view.allowedSenderDomain).toBe("hotelsol.es");
    expect(view.mapping.pickedUpColumn).toBe("Rooms picked up");
  });

  it("keeps pickup history and the report address when the contract is amended", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const [old] = await w.db.select().from(schema.clauses).where(eq(schema.clauses.id, blockId));
    const draft = await amendContract(ops, old.contractId);
    await activateContract(ops, draft.id);
    const newBlock = (await getContract(ops, draft.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!.id;
    expect((await latestPickup(w.db, [newBlock])).get(newBlock)!.nights["2027-05-11"].pickedUp).toBe(95);
    const [view] = await getInboundForBlocks(ops, [newBlock]);
    expect(view.address).toBe(address);
    expect((await receiveInboundEmail(w.db, email(address, null))).status).not.toBe("unknown_address");
  });
});
