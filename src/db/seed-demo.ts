import { and, eq } from "drizzle-orm";
import type { Db } from "./client";
import { alerts, clauses, contracts, organizations } from "./schema";
import { orgConfigSchema, type RoleKey } from "@/config/schema";
import type { ServiceCtx } from "@/services/context";
import { createAgreement, createClient } from "@/services/clients";
import { createSupplier } from "@/services/suppliers";
import { createEvent, setEventStatus } from "@/services/events";
import { activateContract, addClause, amendContract, createContract, getContract, updateClauseTerms } from "@/services/contracts";
import { recordPickup } from "@/services/pickup";
import { setUpInbound } from "@/services/inbound-pickup";
import { upsertFx } from "@/services/fx";
import { loadExposureContext, snapshotEventExposure } from "@/services/exposure";
import { computeEventExposure } from "@/core/exposure/event";
import { recordActualPenalty } from "@/services/post-event";
import { createChange, respondToApproval, submitChange } from "@/services/changes";
import { postMessage } from "@/services/threads";
import { issueShareLink } from "@/services/client-share";
import { decideAlert } from "@/services/alerts";
import { listObligations, recordPayment } from "@/services/obligations";
import { addDays, localDateOf } from "@/core/time";

// Demo workspace: a fictional agency ("Northbeam Events") with fictional clients and suppliers.
// Created through the same services as real data. Dates are relative to the day of seeding so
// the demo always has live deadlines. Every screen shows a "Demo data" marker.

export type SeededUser = { id: string; name: string; role: RoleKey; email: string };

export async function seedDemoWorkspace(db: Db, orgId: string, people: SeededUser[]) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const config = orgConfigSchema.parse(org.config);
  const by = (email: string) => people.find((p) => p.email === email)!;
  const ctxAs = (u: SeededUser): ServiceCtx => ({
    db,
    now: () => new Date(),
    actor: { userId: u.id, name: u.name, role: u.role, orgId, orgTimezone: org.timezone, baseCurrency: org.baseCurrency, config },
  });
  const ops = ctxAs(by("ops@northbeam.test"));
  const priya = by("priya@northbeam.test");
  const sam = by("sam@northbeam.test");
  const finance = ctxAs(by("finance@northbeam.test"));

  const today = localDateOf(new Date(), org.timezone);
  const d = (n: number) => addDays(today, n);

  // Clients and agreements --------------------------------------------------
  const solvane = await createClient(ops, {
    name: "Solvane Software",
    industry: "B2B software",
    billingContactName: "Dana Whitfield",
    billingContactEmail: "events@solvane.example",
  });
  await createAgreement(ops, solvane.id, {
    name: "Master services agreement 2026",
    effectiveFrom: d(-200),
    effectiveTo: "",
    rules: [
      { category: "DEPOSIT", bearer: "CLIENT", agencyPct: 0 },
      { category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
      { category: "FB_SHORTFALL", bearer: "SPLIT", agencyPct: 50 },
      { category: "CANCELLATION", bearer: "CLIENT", agencyPct: 0 },
      { category: "OTHER", bearer: "NONE", agencyPct: 0 },
    ],
  });

  const kestrel = await createClient(ops, {
    name: "Kestrel Medtech",
    industry: "Medical devices",
    billingContactName: "Ravi Menon",
    billingContactEmail: "ap@kestrel-medtech.example",
    notes: "HCP attendees: per-attendee spend must be reportable.",
  });
  await createAgreement(ops, kestrel.id, {
    name: "Advisory programme SOW",
    effectiveFrom: d(-90),
    effectiveTo: d(300),
    rules: [
      { category: "DEPOSIT", bearer: "CLIENT", agencyPct: 0 },
      // Agency guaranteed the block to win the work: attrition is ours.
      { category: "ATTRITION", bearer: "AGENCY", agencyPct: 100 },
      { category: "FB_SHORTFALL", bearer: "CLIENT", agencyPct: 0 },
      { category: "CANCELLATION", bearer: "CLIENT", agencyPct: 0 },
      { category: "OTHER", bearer: "NONE", agencyPct: 0 },
    ],
  });

  // No agreement on purpose: shows unassigned exposure.
  const tarnwell = await createClient(ops, {
    name: "Tarnwell Capital",
    industry: "Asset management",
    billingContactName: "Elena Brooks",
  });

  // Suppliers -----------------------------------------------------------------
  const alvorada = await createSupplier(ops, { name: "Hotel Alvorada Lisboa", type: "HOTEL", city: "Lisbon", country: "Portugal" });
  const tejo = await createSupplier(ops, { name: "Centro de Congressos do Tejo", type: "VENUE", city: "Lisbon", country: "Portugal" });
  const lumen = await createSupplier(ops, { name: "Lumen Stage Productions", type: "AV_PRODUCTION", city: "Porto", country: "Portugal" });
  const lakeshore = await createSupplier(ops, { name: "The Lakeshore Hotel Chicago", type: "HOTEL", city: "Chicago", country: "United States" });
  const saguaro = await createSupplier(ops, { name: "Saguaro Springs Resort", type: "HOTEL", city: "Scottsdale", country: "United States" });

  // Event 1: large SKO in Lisbon, EUR contracts, USD reporting ---------------
  const skoStart = d(53);
  const sko = await createEvent(ops, {
    clientId: solvane.id,
    name: "Solvane Sales Kickoff 2027",
    coverImage: "lisbon",
    type: "Sales kickoff",
    startDate: skoStart,
    endDate: addDays(skoStart, 2),
    destination: "Lisbon, Portugal",
    timezone: "Europe/Lisbon",
    ownerId: priya.id,
    forecastAttendance: 420,
    baseCurrency: "USD",
    memberIds: [sam.id],
  });
  await setEventStatus(ops, sko.id, "CONTRACTED");

  const hotel = await createContract(ops, sko.id, {
    supplierId: alvorada.id,
    title: "Group agreement",
    reference: "ALV-GRP-2611",
    signedDate: d(-120),
    currency: "EUR",
    contractedValue: "167,370.00",
  });
  await addClause(ops, hotel.id, {
    type: "PAYMENT",
    label: "Deposit 1",
    terms: { label: "Deposit 1", dueDate: d(-110), dueTime: "17:00", percentOfContract: 25 },
  });
  await addClause(ops, hotel.id, {
    type: "PAYMENT",
    label: "Deposit 2",
    terms: { label: "Deposit 2", dueDate: addDays(skoStart, -40), dueTime: "17:00", percentOfContract: 25 },
  });
  await addClause(ops, hotel.id, {
    type: "ROOM_BLOCK",
    label: "Main block",
    terms: {
      blockName: "Main block",
      nights: [
        { date: addDays(skoStart, -1), rooms: 120, rateMinor: 18_900 },
        { date: skoStart, rooms: 220, rateMinor: 18_900 },
        { date: addDays(skoStart, 1), rooms: 220, rateMinor: 18_900 },
      ],
      commitmentPct: 80,
      basis: "PER_NIGHT",
      damagesPct: 100,
      cutoffDate: addDays(skoStart, -25),
      cutoffTime: "17:00",
      reviewPoints: [{ date: addDays(skoStart, -45), maxReductionPct: 10 }],
    },
    inputs: { projection: "CURRENT" },
  });
  await addClause(ops, hotel.id, {
    type: "FB_MINIMUM",
    label: "Food & beverage minimum",
    terms: { label: "Food & beverage minimum", minimumMinor: 4_800_000, basis: "PRE_TAX_PRE_SERVICE", surchargePct: 22 },
    inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 9_500 },
  });
  await addClause(ops, hotel.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: {
      basis: "CONTRACT_VALUE",
      depositTreatment: "CREDITED",
      tiers: [
        { startsOn: d(-120), penaltyPct: 25 },
        { startsOn: addDays(skoStart, -45), penaltyPct: 50 },
        { startsOn: addDays(skoStart, -14), penaltyPct: 100 },
      ],
    },
  });
  await addClause(ops, hotel.id, {
    type: "FINAL_GUARANTEE",
    label: "Final guarantee",
    terms: { dueDate: addDays(skoStart, -3), dueTime: "12:00", subject: "FB_COVERS", tolerancePct: 5 },
  });
  await addClause(ops, hotel.id, {
    type: "OTHER_DEADLINE",
    label: "Rooming list due",
    terms: { label: "Rooming list due", dueDate: addDays(skoStart, -21), dueTime: "17:00" },
  });
  await activateContract(ops, hotel.id);

  const venue = await createContract(ops, sko.id, {
    supplierId: tejo.id,
    title: "Venue hire",
    reference: "CCT-2026-0412",
    signedDate: d(-100),
    currency: "EUR",
    contractedValue: "98,000.00",
  });
  await addClause(ops, venue.id, {
    type: "PAYMENT",
    label: "Booking deposit",
    terms: { label: "Booking deposit", dueDate: d(-95), dueTime: "17:00", percentOfContract: 30 },
  });
  await addClause(ops, venue.id, {
    type: "PAYMENT",
    label: "Balance",
    terms: { label: "Balance", dueDate: addDays(skoStart, -30), dueTime: "17:00", percentOfContract: 70 },
  });
  await addClause(ops, venue.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: {
      basis: "CONTRACT_VALUE",
      depositTreatment: "CREDITED",
      tiers: [
        { startsOn: d(-100), penaltyPct: 20 },
        { startsOn: addDays(skoStart, -60), penaltyPct: 50 },
        { startsOn: addDays(skoStart, -21), penaltyPct: 100 },
      ],
    },
  });
  await activateContract(ops, venue.id);

  const av = await createContract(ops, sko.id, {
    supplierId: lumen.id,
    title: "Staging and AV",
    signedDate: d(-60),
    currency: "EUR",
    contractedValue: "64,500.00",
  });
  await addClause(ops, av.id, {
    type: "PAYMENT",
    label: "50% on confirmation",
    terms: { label: "50% on confirmation", dueDate: addDays(skoStart, -21), dueTime: "17:00", percentOfContract: 50 },
  });
  await addClause(ops, av.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: {
      basis: "CONTRACT_VALUE",
      depositTreatment: "ADDITIONAL",
      tiers: [{ startsOn: addDays(skoStart, -30), penaltyPct: 50 }, { startsOn: addDays(skoStart, -7), penaltyPct: 100 }],
    },
  });
  await activateContract(ops, av.id);

  // Paid deposits (past due dates)
  for (const o of await listObligations(finance, { eventId: sko.id })) {
    if (o.kind === "PAYMENT" && o.dueAt < new Date() && o.amountMinor) {
      await recordPayment(finance, o.id, { paidAt: localDateOf(o.dueAt, "Europe/Lisbon"), amount: (o.amountMinor / 100).toFixed(2), reference: `TRF-${o.label.slice(0, 3).toUpperCase()}` });
    }
  }

  // Event 2: advisory board in Chicago, soon --------------------------------
  const abStart = d(18);
  const board = await createEvent(ops, {
    clientId: kestrel.id,
    name: "Kestrel Cardiology Advisory Board",
    coverImage: "chicago",
    type: "Customer event",
    startDate: abStart,
    endDate: addDays(abStart, 1),
    destination: "Chicago, IL",
    timezone: "America/Chicago",
    ownerId: sam.id,
    forecastAttendance: 36,
    baseCurrency: "USD",
    exposureThreshold: "10,000",
  });
  await setEventStatus(ops, board.id, "CONTRACTED");
  const lk = await createContract(ops, board.id, {
    supplierId: lakeshore.id,
    title: "Meeting and room agreement",
    signedDate: d(-70),
    currency: "USD",
    contractedValue: "58,400.00",
  });
  await addClause(ops, lk.id, {
    type: "PAYMENT",
    label: "Deposit",
    terms: { label: "Deposit", dueDate: d(-65), amountMinor: 1_500_000 },
  });
  await addClause(ops, lk.id, {
    type: "ROOM_BLOCK",
    label: "Advisor rooms",
    terms: {
      blockName: "Advisor rooms",
      nights: [
        { date: addDays(abStart, -1), rooms: 40, rateMinor: 32_900 },
        { date: abStart, rooms: 40, rateMinor: 32_900 },
      ],
      commitmentPct: 90,
      basis: "CUMULATIVE",
      damagesPct: 80,
      cutoffDate: d(4),
      cutoffTime: "17:00",
    },
  });
  await addClause(ops, lk.id, {
    type: "FB_MINIMUM",
    label: "Food & beverage minimum",
    terms: { label: "Food & beverage minimum", minimumMinor: 2_200_000, surchargePct: 24 },
    inputs: { forecastMethod: "MANUAL", forecastManualMinor: 1_850_000 },
  });
  await addClause(ops, lk.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: {
      basis: "CONTRACT_VALUE",
      tiers: [
        { startsOn: d(-70), penaltyPct: 30 },
        { startsOn: d(-10), penaltyPct: 75 },
        { startsOn: d(11), penaltyPct: 100 },
      ],
    },
  });
  await addClause(ops, lk.id, {
    type: "FINAL_GUARANTEE",
    label: "Final guarantee",
    terms: { dueDate: addDays(abStart, -3), dueTime: "12:00", subject: "ATTENDANCE" },
  });
  await activateContract(ops, lk.id);
  const [lkDeposit] = (await listObligations(finance, { eventId: board.id })).filter((o) => o.kind === "PAYMENT");
  if (lkDeposit) await recordPayment(finance, lkDeposit.id, { paidAt: d(-66), amount: "15,000.00", reference: "ACH-44120" });

  // Event 3: partner summit, no client agreement ----------------------------
  const psStart = d(128);
  const summit = await createEvent(ops, {
    clientId: tarnwell.id,
    name: "Tarnwell Partner Summit",
    coverImage: "resort",
    type: "Customer event",
    startDate: psStart,
    endDate: addDays(psStart, 2),
    destination: "Scottsdale, AZ",
    timezone: "America/Phoenix",
    ownerId: priya.id,
    forecastAttendance: 180,
    baseCurrency: "USD",
  });
  const sg = await createContract(ops, summit.id, {
    supplierId: saguaro.id,
    title: "Group sales agreement",
    signedDate: d(-14),
    currency: "USD",
    contractedValue: "212,800.00",
  });
  await addClause(ops, sg.id, {
    type: "PAYMENT",
    label: "Deposit",
    terms: { label: "Deposit", dueDate: d(9), percentOfContract: 20 },
  });
  await addClause(ops, sg.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: {
      basis: "CONTRACT_VALUE",
      tiers: [
        { startsOn: d(-14), penaltyPct: 15 },
        { startsOn: addDays(psStart, -90), penaltyPct: 40 },
        { startsOn: addDays(psStart, -30), penaltyPct: 80 },
      ],
    },
  });
  await activateContract(ops, sg.id);

  // Exchange rates (admin-maintained) ---------------------------------------
  const admin = ctxAs(by("admin@northbeam.test"));
  await upsertFx(admin, { fromCcy: "EUR", toCcy: "USD", rate: "1.0850", asOf: d(-1) });
  await upsertFx(admin, { fromCcy: "GBP", toCcy: "USD", rate: "1.2700", asOf: d(-1) });

  // History ------------------------------------------------------------------
  // Replays the last `from` days in order: a housing report every 3 days (pickup moving from
  // `start` to `end`), and a daily exposure snapshot computed by the real engine with the clock
  // set to that day. Each snapshot only sees pickup reported up to that day, exactly as the
  // daily job would have. Today's report (the `end` figures) is recorded last.
  const DAY = 86_400_000;
  const blockOf = async (contractId: string) => (await getContract(ops, contractId)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  type Pace = { contractId: string; nights: Array<{ date: string; start: number; end: number }> };
  const replay = async (eventId: string, from: number, paces: Pace[] = []) => {
    const blocks = await Promise.all(paces.map(async (p) => ({ ...p, clauseId: (await blockOf(p.contractId)).id })));
    for (let k = from; k >= 1; k--) {
      const when = new Date(Date.now() - k * DAY);
      const c: ServiceCtx = { ...ops, now: () => when };
      if (k === from || k % 3 === 0) {
        const t = (from - k) / from;
        for (const b of blocks) {
          await recordPickup(c, b.clauseId, {
            capturedAt: when.toISOString(),
            nights: b.nights.map((n) => ({ date: n.date, pickedUp: Math.round(n.start + (n.end - n.start) * t) })),
          });
        }
      }
      await snapshotEventExposure(db, c, eventId, "daily");
    }
    for (const b of blocks) await recordPickup(ops, b.clauseId, { nights: b.nights.map((n) => ({ date: n.date, pickedUp: n.end })) });
  };

  await replay(sko.id, 30, [
    {
      contractId: hotel.id,
      nights: [
        { date: addDays(skoStart, -1), start: 38, end: 71 },
        { date: skoStart, start: 84, end: 140 },
        { date: addDays(skoStart, 1), start: 90, end: 152 },
      ],
    },
  ]);
  await replay(board.id, 30, [
    {
      contractId: lk.id,
      nights: [
        { date: addDays(abStart, -1), start: 9, end: 21 },
        { date: abStart, start: 11, end: 24 },
      ],
    },
  ]);
  await replay(summit.id, 14);

  // More clients --------------------------------------------------------------
  const halden = await createClient(ops, {
    name: "Halden Robotics",
    industry: "Industrial automation",
    billingContactName: "Marcus Lind",
    billingContactEmail: "finance@haldenrobotics.example",
  });
  await createAgreement(ops, halden.id, {
    name: "Events framework agreement",
    effectiveFrom: d(-150),
    effectiveTo: "",
    rules: [
      { category: "DEPOSIT", bearer: "CLIENT", agencyPct: 0 },
      // Shared risk on rooms: the agency negotiated the block size.
      { category: "ATTRITION", bearer: "SPLIT", agencyPct: 50 },
      { category: "FB_SHORTFALL", bearer: "CLIENT", agencyPct: 0 },
      { category: "CANCELLATION", bearer: "CLIENT", agencyPct: 0 },
      { category: "OTHER", bearer: "NONE", agencyPct: 0 },
    ],
  });
  const meridian = await createClient(ops, {
    name: "Meridian Pharma",
    industry: "Pharmaceuticals",
    billingContactName: "Sofia Almeida",
    billingContactEmail: "congress@meridianpharma.example",
    notes: "Congress satellite events: per-HCP spend reporting applies.",
  });
  await createAgreement(ops, meridian.id, {
    name: "Congress services agreement",
    effectiveFrom: d(-60),
    effectiveTo: d(365),
    rules: [
      { category: "DEPOSIT", bearer: "CLIENT", agencyPct: 0 },
      { category: "ATTRITION", bearer: "CLIENT", agencyPct: 0 },
      { category: "FB_SHORTFALL", bearer: "CLIENT", agencyPct: 0 },
      { category: "CANCELLATION", bearer: "CLIENT", agencyPct: 0 },
      { category: "OTHER", bearer: "NONE", agencyPct: 0 },
    ],
  });

  const aldwych = await createSupplier(ops, { name: "The Aldwych Grand London", type: "HOTEL", city: "London", country: "United Kingdom" });
  const larimer = await createSupplier(ops, { name: "Larimer Square Hotel Denver", type: "HOTEL", city: "Denver", country: "United States" });
  const pier = await createSupplier(ops, { name: "Pier 27 Event Center", type: "VENUE", city: "San Francisco", country: "United States" });
  const embarcadero = await createSupplier(ops, { name: "Embarcadero Bay Hotel", type: "HOTEL", city: "San Francisco", country: "United States" });
  const marina = await createSupplier(ops, { name: "Hotel Marina Barceloneta", type: "HOTEL", city: "Barcelona", country: "Spain" });
  const gastro = await createSupplier(ops, { name: "Gastro Events BCN", type: "CATERER", city: "Barcelona", country: "Spain" });
  const silverado = await createSupplier(ops, { name: "Silverado Vineyard Lodge", type: "HOTEL", city: "Napa", country: "United States" });
  const congress = await createSupplier(ops, { name: "Congress Avenue Hotel Austin", type: "HOTEL", city: "Austin", country: "United States" });
  const hudson = await createSupplier(ops, { name: "The Hudson Room", type: "VENUE", city: "New York", country: "United States" });

  // Event 5: EMEA customer summit in London, GBP reporting ------------------
  const emeaStart = d(38);
  const emea = await createEvent(ops, {
    clientId: solvane.id,
    name: "Solvane Customer Summit EMEA",
    coverImage: "london",
    type: "User conference",
    startDate: emeaStart,
    endDate: addDays(emeaStart, 1),
    destination: "London, United Kingdom",
    timezone: "Europe/London",
    ownerId: priya.id,
    forecastAttendance: 300,
    baseCurrency: "GBP",
  });
  await setEventStatus(ops, emea.id, "CONTRACTED");
  const ald = await createContract(ops, emea.id, { supplierId: aldwych.id, title: "Conference and rooms agreement", reference: "AGL-7731", signedDate: d(-80), currency: "GBP", contractedValue: "126,400.00" });
  await addClause(ops, ald.id, { type: "PAYMENT", label: "Deposit", terms: { label: "Deposit", dueDate: d(-75), dueTime: "17:00", percentOfContract: 30 } });
  await addClause(ops, ald.id, {
    type: "ROOM_BLOCK",
    label: "Delegate rooms",
    terms: {
      blockName: "Delegate rooms",
      nights: [
        { date: addDays(emeaStart, -1), rooms: 90, rateMinor: 24_500 },
        { date: emeaStart, rooms: 150, rateMinor: 24_500 },
      ],
      commitmentPct: 85,
      basis: "PER_NIGHT",
      damagesPct: 100,
      cutoffDate: d(10),
      cutoffTime: "17:00",
    },
  });
  await addClause(ops, ald.id, {
    type: "FB_MINIMUM",
    label: "Conference catering minimum",
    terms: { label: "Conference catering minimum", minimumMinor: 3_800_000, surchargePct: 12.5 },
    inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 11_200 },
  });
  await addClause(ops, ald.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", depositTreatment: "CREDITED", tiers: [{ startsOn: d(-80), penaltyPct: 20 }, { startsOn: d(-22), penaltyPct: 50 }, { startsOn: d(17), penaltyPct: 90 }] },
  });
  await activateContract(ops, ald.id);
  for (const o of await listObligations(finance, { eventId: emea.id })) {
    if (o.kind === "PAYMENT" && o.dueAt < new Date() && o.amountMinor) await recordPayment(finance, o.id, { paidAt: d(-76), amount: (o.amountMinor / 100).toFixed(2), reference: "BACS-20931" });
  }
  await replay(emea.id, 30, [
    {
      contractId: ald.id,
      nights: [
        { date: addDays(emeaStart, -1), start: 31, end: 63 },
        { date: emeaStart, start: 64, end: 118 },
      ],
    },
  ]);

  // Event 6: surgeon training in Denver; agency carries attrition (Kestrel SOW) ----
  const denStart = d(26);
  const denver = await createEvent(ops, {
    clientId: kestrel.id,
    name: "Kestrel Surgeon Training Summit",
    coverImage: "theatre-seats",
    type: "Customer event",
    startDate: denStart,
    endDate: addDays(denStart, 1),
    destination: "Denver, CO",
    timezone: "America/Denver",
    ownerId: sam.id,
    forecastAttendance: 64,
    baseCurrency: "USD",
    exposureThreshold: "15,000",
  });
  await setEventStatus(ops, denver.id, "CONTRACTED");
  const lar = await createContract(ops, denver.id, { supplierId: larimer.id, title: "Group and meeting agreement", reference: "LSH-44810", signedDate: d(-60), currency: "USD", contractedValue: "71,200.00" });
  await addClause(ops, lar.id, { type: "PAYMENT", label: "Deposit", terms: { label: "Deposit", dueDate: d(-55), amountMinor: 2_000_000 } });
  await addClause(ops, lar.id, {
    type: "ROOM_BLOCK",
    label: "Faculty and delegate rooms",
    terms: {
      blockName: "Faculty and delegate rooms",
      nights: [
        { date: addDays(denStart, -1), rooms: 60, rateMinor: 25_900 },
        { date: denStart, rooms: 60, rateMinor: 25_900 },
      ],
      commitmentPct: 90,
      basis: "CUMULATIVE",
      damagesPct: 100,
      cutoffDate: d(12),
      cutoffTime: "17:00",
    },
  });
  await addClause(ops, lar.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: d(-60), penaltyPct: 35 }, { startsOn: d(5), penaltyPct: 75 }, { startsOn: d(19), penaltyPct: 100 }] },
  });
  await addClause(ops, lar.id, { type: "FINAL_GUARANTEE", label: "Final guarantee", terms: { dueDate: addDays(denStart, -4), dueTime: "12:00", subject: "ATTENDANCE" } });
  await activateContract(ops, lar.id);
  const [larDeposit] = (await listObligations(finance, { eventId: denver.id })).filter((o) => o.kind === "PAYMENT");
  if (larDeposit) await recordPayment(finance, larDeposit.id, { paidAt: d(-56), amount: "20,000.00", reference: "ACH-45502" });
  await replay(denver.id, 30, [
    {
      contractId: lar.id,
      nights: [
        { date: addDays(denStart, -1), start: 14, end: 29 },
        { date: denStart, start: 16, end: 33 },
      ],
    },
  ]);

  // Event 7: product launch in San Francisco; attrition split 50/50 --------
  const sfStart = d(44);
  const launch = await createEvent(ops, {
    clientId: halden.id,
    name: "Halden Robotics Product Launch",
    coverImage: "san-francisco",
    type: "Product launch",
    startDate: sfStart,
    endDate: sfStart,
    destination: "San Francisco, CA",
    timezone: "America/Los_Angeles",
    ownerId: priya.id,
    forecastAttendance: 520,
    baseCurrency: "USD",
    memberIds: [sam.id],
  });
  await setEventStatus(ops, launch.id, "CONTRACTED");
  const p27 = await createContract(ops, launch.id, { supplierId: pier.id, title: "Venue and catering agreement", reference: "P27-1188", signedDate: d(-50), currency: "USD", contractedValue: "148,000.00" });
  await addClause(ops, p27.id, { type: "PAYMENT", label: "Booking deposit", terms: { label: "Booking deposit", dueDate: d(-45), dueTime: "17:00", percentOfContract: 25 } });
  await addClause(ops, p27.id, { type: "PAYMENT", label: "Balance", terms: { label: "Balance", dueDate: d(29), dueTime: "17:00", percentOfContract: 75 } });
  await addClause(ops, p27.id, {
    type: "FB_MINIMUM",
    label: "Reception food & beverage minimum",
    terms: { label: "Reception food & beverage minimum", minimumMinor: 6_200_000, surchargePct: 22 },
    inputs: { forecastMethod: "MANUAL", forecastManualMinor: 5_100_000 },
  });
  await addClause(ops, p27.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", depositTreatment: "CREDITED", tiers: [{ startsOn: d(-50), penaltyPct: 25 }, { startsOn: d(14), penaltyPct: 50 }, { startsOn: d(30), penaltyPct: 100 }] },
  });
  await activateContract(ops, p27.id);
  const emb = await createContract(ops, launch.id, { supplierId: embarcadero.id, title: "Group rooms agreement", signedDate: d(-40), currency: "USD", contractedValue: "47,840.00" });
  await addClause(ops, emb.id, {
    type: "ROOM_BLOCK",
    label: "Guest rooms",
    terms: {
      blockName: "Guest rooms",
      nights: [
        { date: addDays(sfStart, -1), rooms: 80, rateMinor: 29_900 },
        { date: sfStart, rooms: 80, rateMinor: 29_900 },
      ],
      commitmentPct: 80,
      basis: "PER_NIGHT",
      damagesPct: 100,
      cutoffDate: d(16),
      cutoffTime: "17:00",
    },
  });
  await addClause(ops, emb.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "ROOM_REVENUE", tiers: [{ startsOn: d(-40), penaltyPct: 30 }, { startsOn: d(16), penaltyPct: 80 }] },
  });
  await activateContract(ops, emb.id);
  for (const o of await listObligations(finance, { eventId: launch.id })) {
    if (o.kind === "PAYMENT" && o.dueAt < new Date() && o.amountMinor) await recordPayment(finance, o.id, { paidAt: d(-46), amount: (o.amountMinor / 100).toFixed(2), reference: "WIRE-77120" });
  }
  await replay(launch.id, 25, [
    {
      contractId: emb.id,
      nights: [
        { date: addDays(sfStart, -1), start: 16, end: 44 },
        { date: sfStart, start: 20, end: 51 },
      ],
    },
  ]);

  // Event 8: congress satellite in Barcelona; catering contract not yet active --
  const bcnStart = d(67);
  const satellite = await createEvent(ops, {
    clientId: meridian.id,
    name: "Meridian Oncology Satellite Symposium",
    coverImage: "barcelona",
    type: "Customer event",
    startDate: bcnStart,
    endDate: bcnStart,
    destination: "Barcelona, Spain",
    timezone: "Europe/Madrid",
    ownerId: sam.id,
    forecastAttendance: 140,
    baseCurrency: "EUR",
  });
  await setEventStatus(ops, satellite.id, "CONTRACTED");
  const mar = await createContract(ops, satellite.id, { supplierId: marina.id, title: "Faculty rooms agreement", signedDate: d(-20), currency: "EUR", contractedValue: "29,400.00" });
  await addClause(ops, mar.id, {
    type: "ROOM_BLOCK",
    label: "Faculty rooms",
    terms: { blockName: "Faculty rooms", nights: [{ date: addDays(bcnStart, -1), rooms: 70, rateMinor: 21_000 }], commitmentPct: 80, basis: "PER_NIGHT", damagesPct: 100, cutoffDate: d(35), cutoffTime: "18:00" },
  });
  await addClause(ops, mar.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: d(-20), penaltyPct: 10 }, { startsOn: d(37), penaltyPct: 60 }] },
  });
  await activateContract(ops, mar.id);
  // Signed but terms not entered yet: the event reads "incomplete", never zero.
  await createContract(ops, satellite.id, { supplierId: gastro.id, title: "Symposium catering", signedDate: d(-6), currency: "EUR", contractedValue: "18,900.00" });
  await replay(satellite.id, 20, [{ contractId: mar.id, nights: [{ date: addDays(bcnStart, -1), start: 12, end: 38 }] }]);

  // Event 9: leadership offsite, still planning ------------------------------
  const napaStart = d(150);
  const offsite = await createEvent(ops, {
    clientId: halden.id,
    name: "Halden Leadership Offsite",
    coverImage: "napa",
    type: "Board / leadership offsite",
    startDate: napaStart,
    endDate: addDays(napaStart, 2),
    destination: "Napa, CA",
    timezone: "America/Los_Angeles",
    ownerId: priya.id,
    forecastAttendance: 28,
    baseCurrency: "USD",
  });
  const sil = await createContract(ops, offsite.id, { supplierId: silverado.id, title: "Exclusive-use agreement", signedDate: d(-5), currency: "USD", contractedValue: "64,000.00" });
  await addClause(ops, sil.id, { type: "PAYMENT", label: "Deposit", terms: { label: "Deposit", dueDate: d(20), percentOfContract: 20 } });
  await addClause(ops, sil.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: d(-5), penaltyPct: 10 }, { startsOn: addDays(napaStart, -60), penaltyPct: 50 }, { startsOn: addDays(napaStart, -21), penaltyPct: 100 }] },
  });
  await activateContract(ops, sil.id);
  await replay(offsite.id, 5);

  // Event 10: engineering offsite in Austin, pickup on track -----------------
  const atxStart = d(32);
  const atx = await createEvent(ops, {
    clientId: solvane.id,
    name: "Solvane Engineering Offsite",
    coverImage: "hotel-lobby",
    type: "Board / leadership offsite",
    startDate: atxStart,
    endDate: addDays(atxStart, 1),
    destination: "Austin, TX",
    timezone: "America/Chicago",
    ownerId: sam.id,
    forecastAttendance: 88,
    baseCurrency: "USD",
  });
  await setEventStatus(ops, atx.id, "CONTRACTED");
  const cav = await createContract(ops, atx.id, { supplierId: congress.id, title: "Meeting and rooms agreement", signedDate: d(-45), currency: "USD", contractedValue: "38,600.00" });
  await addClause(ops, cav.id, {
    type: "ROOM_BLOCK",
    label: "Team rooms",
    terms: {
      blockName: "Team rooms",
      nights: [
        { date: addDays(atxStart, -1), rooms: 45, rateMinor: 19_900 },
        { date: atxStart, rooms: 45, rateMinor: 19_900 },
      ],
      commitmentPct: 80,
      basis: "CUMULATIVE",
      damagesPct: 100,
      cutoffDate: d(4),
      cutoffTime: "17:00",
    },
  });
  await addClause(ops, cav.id, {
    type: "FB_MINIMUM",
    label: "Food & beverage minimum",
    terms: { label: "Food & beverage minimum", minimumMinor: 1_500_000, surchargePct: 20 },
    inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 9_800 },
  });
  await addClause(ops, cav.id, {
    type: "CANCELLATION",
    label: "Cancellation schedule",
    terms: { basis: "CONTRACT_VALUE", tiers: [{ startsOn: d(-45), penaltyPct: 25 }, { startsOn: d(2), penaltyPct: 75 }] },
  });
  await activateContract(ops, cav.id);
  await replay(atx.id, 30, [
    {
      contractId: cav.id,
      nights: [
        { date: addDays(atxStart, -1), start: 22, end: 43 },
        { date: atxStart, start: 24, end: 45 },
      ],
    },
  ]);

  // A change waiting for internal approval (priced at cost: below the margin floor) --
  const lab = await createChange(ctxAs(sam), denver.id, {
    title: "Add hands-on cadaver lab session",
    type: "ADD_FUNCTION",
    reason: "Client asked for a practical session on day two.",
    attendanceDelta: 0,
    requestedByType: "CLIENT",
    lines: [
      { contractId: "", category: "AV & production", description: "Lab AV and camera feed", costDelta: "8,400.00", priceDelta: "8,400.00" },
      { contractId: lar.id, category: "Food & beverage", description: "Working lunch for lab delegates", costDelta: "2,100.00", priceDelta: "2,100.00" },
    ],
  });
  await submitChange(ctxAs(sam), lab.id, { recipientEmail: "ravi.menon@kestrel-medtech.example" });

  // A client change that was approved and applied: billed rather than absorbed (Money protected).
  // Goes through the real single-use client approval link.
  const reception = await createChange(ctxAs(priya), sko.id, {
    title: "Add partner welcome reception",
    type: "ADD_FUNCTION",
    reason: "Solvane invited 60 channel partners to a reception on arrival night.",
    attendanceDelta: 0,
    requestedByType: "CLIENT",
    lines: [
      { contractId: hotel.id, category: "Food & beverage", description: "Reception drinks and canapés, 60 guests", costDelta: "5,400.00", priceDelta: "6,480.00" },
      { contractId: "", category: "AV & production", description: "Background music and lighting", costDelta: "900.00", priceDelta: "1,080.00" },
    ],
  });
  const sent = await submitChange(ctxAs(priya), reception.id, { recipientEmail: "events@solvane.example" });
  if (!sent.link) throw new Error("Seed: the reception change should go straight to the client (check approval limit and margin floor).");
  await respondToApproval(db, sent.link.url.split("/approve/")[1], { decision: "APPROVE", approverName: "Dana Whitfield", comment: "Approved, thanks." }, { ip: null, userAgent: "seed" }, new Date());

  // Event 4: delivered three weeks ago, with actual penalties recorded -----
  // Its "projected" snapshots are computed by the real engine with the clock set to
  // 30 and 7 days before the event, as the daily job would have done at the time.
  const pastStart = d(-21);
  const past = await createEvent(ops, {
    clientId: solvane.id,
    name: "Solvane Partner Enablement Day",
    coverImage: "podium",
    type: "Customer event",
    startDate: pastStart,
    endDate: pastStart,
    destination: "Boston, MA",
    timezone: "America/New_York",
    ownerId: sam.id,
    forecastAttendance: 150,
    baseCurrency: "USD",
  });
  await setEventStatus(ops, past.id, "CONTRACTED");
  const harbor = await createSupplier(ops, { name: "Harborview Conference Hotel", type: "HOTEL", city: "Boston", country: "United States" });
  const hv = await createContract(ops, past.id, { supplierId: harbor.id, title: "Group and meeting agreement", signedDate: d(-160), currency: "USD", contractedValue: "96,000.00" });
  await addClause(ops, hv.id, {
    type: "ROOM_BLOCK",
    label: "Attendee rooms",
    terms: {
      blockName: "Attendee rooms",
      nights: [{ date: addDays(pastStart, -1), rooms: 110, rateMinor: 27_900 }],
      commitmentPct: 85,
      basis: "PER_NIGHT",
      cutoffDate: addDays(pastStart, -28),
    },
  });
  await addClause(ops, hv.id, {
    type: "FB_MINIMUM",
    label: "Food & beverage minimum",
    terms: { label: "Food & beverage minimum", minimumMinor: 3_000_000, surchargePct: 24 },
    inputs: { forecastMethod: "PER_HEAD", perHeadMinor: 18_500 },
  });
  await activateContract(ops, hv.id);
  const hvBlock = (await getContract(ops, hv.id)).clauses.find((c) => c.type === "ROOM_BLOCK")!;
  const at = (days: number) => new Date(`${addDays(pastStart, days)}T11:00:00Z`);
  const snapshotAs = async (when: Date, picked: number) => {
    const c = { ...ops, now: () => when };
    await recordPickup(c, hvBlock.id, { capturedAt: when.toISOString(), nights: [{ date: addDays(pastStart, -1), pickedUp: picked }] });
    await snapshotEventExposure(db, c, past.id, "daily");
  };
  await snapshotAs(at(-30), 72);
  await snapshotAs(at(-7), 81);
  await snapshotAs(at(0), 84);
  await setEventStatus(ops, past.id, "LIVE");
  await setEventStatus(ops, past.id, "DELIVERED");
  await recordActualPenalty(finance, hv.id, { category: "ATTRITION", amount: "3,069.00", invoiceRef: "HCH-88213" });

  // Event 11: investor dinner delivered six weeks ago; F&B minimum missed ----
  const dinStart = d(-40);
  const dinner = await createEvent(ops, {
    clientId: tarnwell.id,
    name: "Tarnwell Investor Dinner",
    coverImage: "long-table",
    type: "Customer event",
    startDate: dinStart,
    endDate: dinStart,
    destination: "New York, NY",
    timezone: "America/New_York",
    ownerId: priya.id,
    forecastAttendance: 110,
    baseCurrency: "USD",
  });
  await setEventStatus(ops, dinner.id, "CONTRACTED");
  const hud = await createContract(ops, dinner.id, { supplierId: hudson.id, title: "Private dining agreement", signedDate: d(-130), currency: "USD", contractedValue: "42,000.00" });
  await addClause(ops, hud.id, {
    type: "FB_MINIMUM",
    label: "Dinner minimum spend",
    terms: { label: "Dinner minimum spend", minimumMinor: 3_600_000, surchargePct: 22 },
    inputs: { forecastMethod: "MANUAL", forecastManualMinor: 3_250_000 },
  });
  await activateContract(ops, hud.id);
  for (const days of [-30, -7, 0]) {
    const when = new Date(`${addDays(dinStart, days)}T15:00:00Z`);
    await snapshotEventExposure(db, { ...ops, now: () => when }, dinner.id, "daily");
  }
  await setEventStatus(ops, dinner.id, "LIVE");
  await setEventStatus(ops, dinner.id, "DELIVERED");
  await recordActualPenalty(finance, hud.id, { category: "FB_SHORTFALL", amount: "4,392.00", invoiceRef: "HUD-3310" });

  // Team threads -------------------------------------------------------------
  // Posted through the real service with the clock set back, so audit entries and @mention
  // notifications are genuine. Figures match the seeded contracts above.
  const jordan = by("ops@northbeam.test");
  const lee = by("finance@northbeam.test");
  const say = async (u: SeededUser, eventId: string, daysAgo: number, hour: number, body: string) => {
    const when = new Date(`${d(-daysAgo)}T${String(hour).padStart(2, "0")}:15:00Z`);
    await postMessage({ ...ctxAs(u), now: () => when }, eventId, { body });
  };
  await say(priya, sko.id, 9, 14, "Solvane cut the SKO attendance forecast from 450 to 420. The F&B minimum is still covered at €95 a head.");
  await say(jordan, sko.id, 8, 9, "Good. The Alvorada block review lets us drop up to 10% before the cutoff. @Priya Nair can we decide by the 28th?");
  await say(sam, sko.id, 3, 16, "Registration pace this week: +62 room nights. Main block is at 363 of 560.");
  await say(priya, sko.id, 2, 10, "Holding the block for now. I'll revisit after Wednesday's registration report.");

  await say(sam, board.id, 6, 15, "Pickup on the Advisor rooms is 21 and 24 against a 90% commitment on 40 rooms. Kestrel's travel team says 8 more advisors confirm this week.");
  await say(jordan, board.id, 5, 9, "@Sam Okafor the cutoff is in a few days and attrition is ours under the SOW. If we're not at 30 per night by Friday, ask Lakeshore for a release.");
  await say(lee, board.id, 4, 13, "Deposit of USD 15,000 has cleared (ACH-44120). Nothing else is due before the event.");
  await say(sam, board.id, 1, 17, "Lakeshore will release up to 6 rooms a night without penalty if we confirm by the 25th. Waiting on Kestrel's final list.");

  await say(sam, denver.id, 2, 11, "Kestrel asked for a hands-on lab on day two. I priced it at cost for now; the change request is waiting for internal approval. @Jordan Mendes");
  await say(jordan, denver.id, 1, 8, "Seen. We can't take it at zero margin. I'll send it back for a 15% markup unless Kestrel is a strategic priority this quarter.");

  await say(lee, launch.id, 7, 12, "Pier 27 booking deposit paid (WIRE-77120). The 75% balance is due at the end of October.");
  await say(priya, launch.id, 3, 15, "Halden still expects 520 guests but the Embarcadero block has only 44 and 51 rooms picked up. Chasing their guest list today.");

  // Emailed pickup reports are on for the Lisbon main block (scripts/simulate-hotel-report.mjs
  // sends the next report; npm run inbound:mailpit delivers it).
  await setUpInbound(ops, (await blockOf(hotel.id)).id, {
    mapping: { dateColumn: "Stay date", pickedUpColumn: "Rooms picked up", forecastColumn: null, dateFormat: "EU" },
    allowedSenderDomain: "hotelalvorada.example",
  });

  // An event with no contracts yet, for the bulk contract import demo. The five sample contracts
  // in fixtures/contracts/ are rendered with dates that match it (scripts/make-sample-contracts.mjs).
  await createEvent(ops, {
    clientId: halden.id,
    name: "Halden EMEA Customer Days",
    coverImage: "banquet-rounds",
    type: "Customer event",
    startDate: d(84),
    endDate: d(85),
    destination: "Porto, Portugal",
    timezone: "Europe/Lisbon",
    ownerId: priya.id,
    forecastAttendance: 240,
    baseCurrency: "EUR",
    memberIds: [sam.id],
  });

  // A read-only link for Solvane, so the client view can be opened straight after seeding.
  const share = await issueShareLink(ops, solvane.id);
  console.log(`Client link for Solvane Software: ${share.url}`);

  console.log(
    "Demo records: 5 clients, 15 suppliers, 12 events (2 delivered; 1 with no contracts yet, for the import demo), 15 contracts, 30 days of pickup and exposure history, team threads on 4 events, one change awaiting approval, FX rates.",
  );
  return { sko, board, summit, hotel, venue, av, lk, sg };
}

/**
 * Runs after the first daily rules, so the cutoff alert exists. Priya negotiated 20 arrival-night
 * rooms back at the Aldwych: the contract is amended through the normal flow, and the decision
 * records the drop in exposure that the amendment actually produced. Nothing is typed in by hand.
 */
export async function seedRecordedRelease(db: Db, orgId: string, people: SeededUser[]) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  const config = orgConfigSchema.parse(org.config);
  const u = people.find((p) => p.email === "priya@northbeam.test")!;
  const priya: ServiceCtx = {
    db,
    now: () => new Date(),
    actor: { userId: u.id, name: u.name, role: u.role, orgId, orgTimezone: org.timezone, baseCurrency: org.baseCurrency, config },
  };
  const [ald] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.orgId, orgId), eq(contracts.reference, "AGL-7731"), eq(contracts.status, "ACTIVE")));
  const [alert] = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.eventId, ald.eventId), eq(alerts.rule, "CUTOFF"), eq(alerts.status, "OPEN")));
  if (!alert) throw new Error("Seed: expected an open cutoff alert on the London summit");

  // Measure the release with the exposure engine: today's inputs, with the arrival night 20 rooms smaller.
  const shrink = <T extends { nights: Array<{ rooms: number }> }>(t: T): T => ({ ...t, nights: t.nights.map((n, i) => (i === 0 ? { ...n, rooms: n.rooms - 20 } : n)) });
  const ec = await loadExposureContext(db, orgId, ald.eventId, new Date());
  const before = computeEventExposure(ec.input).current.totalMinor;
  const after = computeEventExposure({
    ...ec.input,
    contracts: ec.input.contracts.map((k) =>
      k.contractId !== ald.id ? k : { ...k, clauses: k.clauses.map((c) => (c.type === "ROOM_BLOCK" ? { ...c, terms: shrink(c.terms as { nights: Array<{ rooms: number }> }) } : c)) },
    ),
  }).current.totalMinor;

  // Agreed with the hotel: record it, then paper it as a contract amendment.
  await decideAlert(priya, alert.id, {
    type: "RELEASED_INVENTORY",
    exposureReduction: ((before - after) / 100).toFixed(2),
    roomNights: 20,
    note: "Aldwych agreed to take back 20 arrival-night rooms at no charge. Contract amended to version 2.",
  });
  const draft = await amendContract(priya, ald.id);
  const [block] = await db.select().from(clauses).where(and(eq(clauses.contractId, draft.id), eq(clauses.type, "ROOM_BLOCK")));
  await updateClauseTerms(priya, block.id, { terms: shrink(block.data as { nights: Array<{ rooms: number }> }) }, block.lockVersion);
  await activateContract(priya, draft.id);
}
