// Emails the next weekly pickup report from Hotel Alvorada Lisboa (fictional) to the Lisbon
// main block's pickup address, through Mailpit, exactly as a hotel would.
//
//   node scripts/simulate-hotel-report.mjs                 CSV, 18 more rooms a night
//   node scripts/simulate-hotel-report.mjs --xlsx          Excel instead of CSV
//   node scripts/simulate-hotel-report.mjs --bump=40       a bigger week
//   node scripts/simulate-hotel-report.mjs --new-format    the hotel changed its columns (rejected)
//   node scripts/simulate-hotel-report.mjs --wrong-sender  sent from a personal address (rejected)
//
// Then run `npm run inbound:mailpit` (or leave it running) to deliver it to the app.
import "dotenv/config";
import postgres from "postgres";
import nodemailer from "nodemailer";
import ExcelJS from "exceljs";

const args = new Set(process.argv.slice(2));
const bump = Number([...args].find((a) => a.startsWith("--bump="))?.split("=")[1] ?? 18);
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const [block] = await sql`
  select c.id, c.data, i.token
  from clauses c
  join contracts k on k.id = c.contract_id
  join suppliers s on s.id = k.supplier_id
  join pickup_inbound i on i.clause_id = c.id and i.revoked_at is null
  where s.name = 'Hotel Alvorada Lisboa' and c.type = 'ROOM_BLOCK' and c.status = 'CONFIRMED'
  limit 1`;
if (!block) throw new Error("No active pickup address on the Lisbon main block. Seed the demo (npm run db:seed) or set one up on the Exposure tab.");
const latest = await sql`
  select v.night_date::text as date, v.rooms_picked_up as picked
  from pickup_values v
  where v.snapshot_id = (select id from pickup_snapshots where clause_id = ${block.id} order by captured_at desc, created_at desc limit 1)`;
await sql.end();

const nights = block.data.nights.map((n) => {
  const now = latest.find((l) => l.date === n.date)?.picked ?? 0;
  return { date: n.date, rooms: n.rooms, picked: Math.min(n.rooms, now + bump) };
});
const eu = (iso) => iso.split("-").reverse().join("/");
const header = args.has("--new-format") ? ["Arrival", "Booked", "Block", "Rate code"] : ["Stay date", "Rooms picked up", "Rooms in block", "Rate code"];
const rows = nights.map((n) => [eu(n.date), n.picked, n.rooms, "GRPSOL"]);
// A night outside the block, as real reports often include shoulder nights.
rows.push([eu(new Date(Date.parse(`${nights[0].date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)), 6, 0, "GRPSOL"]);

let attachment;
if (args.has("--xlsx")) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Group pickup");
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  attachment = { filename: "alvorada-group-pickup.xlsx", content: Buffer.from(await wb.xlsx.writeBuffer()) };
} else {
  attachment = { filename: "alvorada-group-pickup.csv", content: [header, ...rows].map((r) => r.join(",")).join("\n") };
}

const to = `pickup+${block.token}@${process.env.INBOUND_DOMAIN ?? "inbound.localhost"}`;
const from = args.has("--wrong-sender") ? "Rui (personal) <rui.tavares@gmail.example>" : "Hotel Alvorada Lisboa, Group Reservations <groups@hotelalvorada.example>";
await nodemailer.createTransport(process.env.SMTP_URL ?? "smtp://localhost:2501").sendMail({
  from,
  to,
  subject: "Weekly group pickup: Solvane Sales Kickoff 2027",
  text: "Please find attached this week's pickup for your group block.\n\nKind regards,\nGroup Reservations",
  attachments: [attachment],
});
console.log(`Sent ${attachment.filename} to ${to}`);
console.log(nights.map((n) => `  ${n.date}: ${n.picked} of ${n.rooms}`).join("\n"));
