import type { AccountSpec } from "./model";

// Fictional customers of the fictional vendor "Fernway". Detection runs weekly in the seed
// (t = −84, −77 … −7, 0), so each pattern is timed to fire on a chosen run:
//   seat:    first run r with r − crossAt ≥ 13 (14 days at or above 90%)
//   usage:   pace passes 110% five days after hotAt (base 0.9 → hot 1.3)
//   team:    5+ users five days after createdAt
//   feature: 12+ attempts about six days after startAt
// Stories then replay what the team did, through the real services.

const c = (name: string, title: string, domain: string) => ({ name, title, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${domain}` });

export const DEMO_ACCOUNTS: AccountSpec[] = [
  // ---- In the queue now (detected today) -------------------------------------------------
  {
    name: "Brightwater Logistics", domain: "brightwater.example", crmId: "FW-1001", segment: "upper", industry: "Logistics",
    csm: "priya", owner: "tomas", plan: "Scale", seats: 60, credits: 100_000, termStart: -250, addons: ["forecasting"],
    baseSeatRatio: 0.78, basePace: 0.92, seat: { crossAt: -14, to: 1.08 },
    contacts: [c("Elena Ruiz", "Controller", "brightwater.example"), c("Sam Whitley", "FP&A Manager", "brightwater.example")], story: { kind: "pending" },
  },
  {
    name: "Harbor Peak Foods", domain: "harborpeak.example", crmId: "FW-1002", segment: "mid", industry: "Food distribution",
    csm: "priya", owner: "aisha", plan: "Growth", seats: 25, credits: 50_000, termStart: -200, addons: [],
    baseSeatRatio: 0.7, basePace: 0.9, usage: { hotAt: -6, hotPace: 1.3 },
    contacts: [c("Grace Lin", "AP Manager", "harborpeak.example")], story: { kind: "pending" },
  },
  {
    name: "Northgate Medical Supply", domain: "northgatemed.example", crmId: "FW-1003", segment: "upper", industry: "Healthcare supply",
    csm: "marcus", owner: "tomas", plan: "Scale", seats: 45, credits: 75_000, termStart: -180, addons: ["forecasting"],
    baseSeatRatio: 0.74, basePace: 0.88, team: { name: "Procurement", createdAt: -6, users: 9 },
    contacts: [c("Owen Price", "Finance Director", "northgatemed.example")], story: { kind: "pending" },
  },
  {
    name: "Ridgeview Manufacturing", domain: "ridgeviewmfg.example", crmId: "FW-1004", segment: "mid", industry: "Manufacturing",
    csm: "marcus", owner: null, plan: "Growth", seats: 30, credits: 50_000, termStart: -140, addons: [],
    baseSeatRatio: 0.72, basePace: 0.85, feature: { addon: "ap_automation", startAt: -6, perDay: 2 },
    contacts: [c("Hana Sato", "Accounting Manager", "ridgeviewmfg.example")], story: { kind: "pending" },
  },
  {
    name: "Copperline Utilities", domain: "copperline.example", crmId: "FW-1005", segment: "upper", industry: "Utilities",
    csm: "lena", owner: "aisha", plan: "Scale", seats: 80, credits: 150_000, termStart: -300, addons: ["forecasting", "ap_automation"],
    baseSeatRatio: 0.8, basePace: 0.95, exec: { name: "Marta Kowalski", title: "Chief Financial Officer", email: "marta.kowalski@copperline.example", firstSeenAt: -4 },
    contacts: [c("Ben Adler", "Controller", "copperline.example")], story: { kind: "pending" },
  },
  {
    name: "Meridian Packaging", domain: "meridianpack.example", crmId: "FW-1006", segment: "mid", industry: "Packaging",
    csm: "priya", owner: "tomas", plan: "Growth", seats: 35, credits: 50_000, termStart: -220, addons: [],
    baseSeatRatio: 0.8, basePace: 0.9, seat: { crossAt: -14, to: 1.0 }, usage: { hotAt: -6, hotPace: 1.25 },
    contacts: [c("Dev Patel", "FP&A Lead", "meridianpack.example")], story: { kind: "pending" },
  },
  {
    name: "Tallgrass Agritech", domain: "tallgrass.example", crmId: "FW-1007", segment: "mid", industry: "Agriculture technology",
    csm: "lena", owner: "aisha", plan: "Growth", seats: 40, credits: 50_000, termStart: -160, addons: [],
    baseSeatRatio: 0.76, basePace: 0.85, seat: { crossAt: -14, to: 0.98 }, escalationFrom: -9,
    contacts: [c("Nora Quinn", "Finance Manager", "tallgrass.example")], story: { kind: "pending" },
  },
  {
    name: "Orchard Lane Retail", domain: "orchardlane.example", crmId: "FW-1008", segment: "mid", industry: "Retail",
    csm: "marcus", owner: "tomas", plan: "Growth", seats: 28, credits: 25_000, termStart: -290, addons: [],
    baseSeatRatio: 0.75, basePace: 0.9, seat: { crossAt: -14, to: 1.05 },
    contacts: [c("Kai Morgan", "Controller", "orchardlane.example")], story: { kind: "pending" },
  },
  // ---- Waiting since last week (overdue) -------------------------------------------------
  {
    name: "Bluefin Hospitality Group", domain: "bluefinhg.example", crmId: "FW-1009", segment: "upper", industry: "Hospitality",
    csm: "priya", owner: "aisha", plan: "Scale", seats: 70, credits: 100_000, termStart: -170, addons: ["forecasting"],
    baseSeatRatio: 0.7, basePace: 0.9, usage: { hotAt: -13, hotPace: 1.35 },
    contacts: [c("Iris Chen", "VP Finance", "bluefinhg.example")], story: { kind: "pending" },
  },
  {
    name: "Stonebridge Construction", domain: "stonebridge.example", crmId: "FW-1010", segment: "mid", industry: "Construction",
    csm: "lena", owner: null, plan: "Growth", seats: 22, credits: 25_000, termStart: -120, addons: ["ap_automation"],
    baseSeatRatio: 0.7, basePace: 0.82, feature: { addon: "forecasting", startAt: -13, perDay: 2 },
    contacts: [c("Leo Brandt", "Finance Manager", "stonebridge.example")], story: { kind: "pending" },
  },
  {
    name: "Pinecrest Senior Living", domain: "pinecrest.example", crmId: "FW-1011", segment: "mid", industry: "Senior care",
    csm: "marcus", owner: "aisha", plan: "Growth", seats: 32, credits: 50_000, termStart: -110, addons: [],
    baseSeatRatio: 0.78, basePace: 0.9, seat: { crossAt: -27, to: 0.97 },
    contacts: [c("Ruth Okoye", "Controller", "pinecrest.example")], story: { kind: "snoozed", days: 24 },
  },
  {
    name: "Saltmarsh Outdoor", domain: "saltmarsh.example", crmId: "FW-1012", segment: "mid", industry: "Outdoor retail",
    csm: "lena", owner: "tomas", plan: "Growth", seats: 20, credits: 25_000, termStart: -230, addons: [],
    baseSeatRatio: 0.85, basePace: 0.95, staleFrom: -5,
    contacts: [c("Jon Ames", "Accounting Lead", "saltmarsh.example")], story: { kind: "pending" },
  },
  // ---- History: worked and closed ----------------------------------------------------------
  {
    name: "Calder & Finch Distribution", domain: "calderfinch.example", crmId: "FW-1013", segment: "upper", industry: "Distribution",
    csm: "priya", owner: "tomas", plan: "Scale", seats: 50, credits: 75_000, termStart: -260, addons: ["forecasting"],
    baseSeatRatio: 0.8, basePace: 0.9, seat: { crossAt: -77, to: 1.12 },
    contacts: [c("Ada Brooks", "Controller", "calderfinch.example")], story: { kind: "won", factor: 1.3, buy: "seats" },
  },
  {
    name: "Alderbrook Health Partners", domain: "alderbrook.example", crmId: "FW-1014", segment: "upper", industry: "Healthcare",
    csm: "marcus", owner: "aisha", plan: "Scale", seats: 65, credits: 100_000, termStart: -280, addons: [],
    baseSeatRatio: 0.7, basePace: 0.9, usage: { hotAt: -60, hotPace: 1.3 },
    contacts: [c("Paul Ferris", "VP Finance", "alderbrook.example")], story: { kind: "won", factor: 1.0, buy: "credits" },
  },
  {
    name: "Vantage Point Engineering", domain: "vantagepoint.example", crmId: "FW-1015", segment: "mid", industry: "Engineering services",
    csm: "lena", owner: "tomas", plan: "Growth", seats: 30, credits: 50_000, termStart: -190, addons: [],
    baseSeatRatio: 0.72, basePace: 0.85, feature: { addon: "ap_automation", startAt: -55, perDay: 2, until: -20 },
    contacts: [c("Mia Torres", "Controller", "vantagepoint.example")], story: { kind: "won", factor: 1.0, buy: "addon" },
  },
  {
    name: "Clearwater Labs", domain: "clearwaterlabs.example", crmId: "FW-1016", segment: "mid", industry: "Laboratory services",
    csm: "priya", owner: "aisha", plan: "Growth", seats: 26, credits: 50_000, termStart: -210, addons: [],
    baseSeatRatio: 0.7, basePace: 0.92, usage: { hotAt: -45, hotPace: 1.28 },
    contacts: [c("Theo Grant", "Finance Manager", "clearwaterlabs.example")], story: { kind: "won", factor: 1.0, buy: "credits" },
  },
  {
    name: "Lakeshore Credit Union", domain: "lakeshorecu.example", crmId: "FW-1017", segment: "upper", industry: "Financial services",
    csm: "marcus", owner: "tomas", plan: "Scale", seats: 55, credits: 75_000, termStart: -240, addons: ["forecasting"],
    baseSeatRatio: 0.74, basePace: 0.88, team: { name: "Treasury", createdAt: -62, users: 8 },
    contacts: [c("Sara Holm", "Controller", "lakeshorecu.example")], story: { kind: "lost", reason: "No budget" },
  },
  {
    name: "Juniper Fleet Services", domain: "juniperfleet.example", crmId: "FW-1018", segment: "mid", industry: "Fleet services",
    csm: "lena", owner: "aisha", plan: "Growth", seats: 24, credits: 25_000, termStart: -175, addons: [],
    baseSeatRatio: 0.78, basePace: 0.9, seat: { crossAt: -70, to: 1.0, until: -30 },
    contacts: [c("Rafael Diaz", "Accounting Manager", "juniperfleet.example")], story: { kind: "lost", reason: "Chose to stay on current plan" },
  },
  {
    name: "Ironwood Tools", domain: "ironwoodtools.example", crmId: "FW-1019", segment: "mid", industry: "Industrial tools",
    csm: "priya", owner: "tomas", plan: "Growth", seats: 30, credits: 25_000, termStart: -150, addons: [],
    baseSeatRatio: 0.8, basePace: 0.88, seat: { crossAt: -50, to: 0.97, until: -25 },
    contacts: [c("Gus Lam", "Controller", "ironwoodtools.example")],
    story: { kind: "dismissed", reason: "Seats are contractors or a fixed team", note: "Year-end audit contractors; they leave in three weeks." },
  },
  {
    name: "Silverline Pharmacy", domain: "silverline.example", crmId: "FW-1020", segment: "mid", industry: "Pharmacy",
    csm: "marcus", owner: "aisha", plan: "Growth", seats: 20, credits: 50_000, termStart: -230, addons: [],
    baseSeatRatio: 0.7, basePace: 0.9, usage: { hotAt: -40, hotPace: 1.22 },
    contacts: [c("Lucy Ford", "Finance Lead", "silverline.example")],
    story: { kind: "dismissed", reason: "Usage is temporary (project, migration or audit)", note: "Backloading 3 years of invoices during migration." },
  },
  {
    name: "Oakmont Property Management", domain: "oakmontpm.example", crmId: "FW-1021", segment: "mid", industry: "Property management",
    csm: "lena", owner: "tomas", plan: "Growth", seats: 18, credits: 25_000, termStart: -205, addons: [],
    baseSeatRatio: 0.72, basePace: 0.85, feature: { addon: "ap_automation", startAt: -40, perDay: 2, until: -15 },
    contacts: [c("Ivy Hart", "Controller", "oakmontpm.example")], story: { kind: "dismissed", reason: "Budget is frozen or already spent" },
  },
  {
    name: "Granite State Insurance", domain: "granitestate.example", crmId: "FW-1022", segment: "upper", industry: "Insurance",
    csm: "priya", owner: "aisha", plan: "Scale", seats: 75, credits: 100_000, termStart: -100, addons: ["forecasting"],
    baseSeatRatio: 0.8, basePace: 0.9, seat: { crossAt: -48, to: 1.02, until: -10 },
    contacts: [c("Hugo Laine", "VP Finance", "granitestate.example")], story: { kind: "noopp", reason: "Already working this deal" },
  },
  // ---- History: still open -------------------------------------------------------------------
  {
    name: "Harlow Education Trust", domain: "harlowtrust.example", crmId: "FW-1023", segment: "mid", industry: "Education",
    csm: "marcus", owner: "tomas", plan: "Growth", seats: 34, credits: 50_000, termStart: -270, addons: [],
    baseSeatRatio: 0.7, basePace: 0.88, feature: { addon: "forecasting", startAt: -34, perDay: 2 },
    contacts: [c("Freya Nolan", "Finance Director", "harlowtrust.example")], story: { kind: "opportunity", factor: 1.0 },
  },
  {
    name: "Summit Ridge Veterinary", domain: "summitridgevet.example", crmId: "FW-1024", segment: "mid", industry: "Veterinary",
    csm: "lena", owner: "aisha", plan: "Growth", seats: 22, credits: 25_000, termStart: -215, addons: [],
    baseSeatRatio: 0.7, basePace: 0.9, usage: { hotAt: -19, hotPace: 1.3 },
    contacts: [c("Omar Haddad", "Practice Finance Manager", "summitridgevet.example")], story: { kind: "accepted" },
  },
  {
    name: "Marigold Home Goods", domain: "marigoldhome.example", crmId: "FW-1025", segment: "mid", industry: "Home goods",
    csm: "priya", owner: null, plan: "Growth", seats: 26, credits: 50_000, termStart: -130, addons: [],
    baseSeatRatio: 0.78, basePace: 0.9, seat: { crossAt: -20, to: 1.0 },
    contacts: [c("Zoe Carter", "Controller", "marigoldhome.example")], story: { kind: "routed" },
  },
  {
    name: "Fairhaven Shipping", domain: "fairhaven.example", crmId: "FW-1026", segment: "upper", industry: "Shipping",
    csm: "marcus", owner: "aisha", plan: "Scale", seats: 58, credits: 100_000, termStart: -320, addons: ["forecasting"],
    baseSeatRatio: 0.76, basePace: 0.9, exec: { name: "Victor Osei", title: "VP of Finance", email: "victor.osei@fairhaven.example", firstSeenAt: -12 },
    contacts: [c("Kim Sorensen", "Controller", "fairhaven.example")],
    story: { kind: "returned", reason: "Not enough context in the handoff", note: "What does Victor own, and has anyone spoken to him yet?" },
  },
  // ---- Steady customers (no signals) --------------------------------------------------------
  ...(
    [
      ["Sterling Pet Supply", "sterlingpet.example", "mid", "Pet retail", "priya", "aisha", 18, 25_000, -155],
      ["Cobalt Energy Services", "cobaltenergy.example", "upper", "Energy services", "lena", "tomas", 62, 100_000, -285],
      ["Willow Creek Foods", "willowcreek.example", "mid", "Food manufacturing", "marcus", "aisha", 27, 50_000, -125],
      ["Evergreen Charter Schools", "evergreencs.example", "mid", "Education", "lena", null, 21, 25_000, -265],
      ["Highline Apparel", "highline.example", "mid", "Apparel", "priya", "tomas", 24, 25_000, -195],
      ["Crescent Freight Systems", "crescentfreight.example", "upper", "Freight", "marcus", "tomas", 48, 75_000, -145],
      ["Beacon Hill Dental Group", "beaconhilldental.example", "mid", "Dental", "lena", "aisha", 16, 25_000, -305],
      ["Westbrook Builders Supply", "westbrook.example", "mid", "Building supply", "priya", "aisha", 23, 50_000, -235],
      ["Redfern Analytics Partners", "redfern.example", "upper", "Professional services", "marcus", "tomas", 44, 75_000, -105],
      ["Larkspur Credit Partners", "larkspur.example", "upper", "Lending", "lena", "aisha", 52, 100_000, -330],
    ] as const
  ).map(([name, domain, segment, industry, csm, owner, seats, credits, termStart], i): AccountSpec => ({
    name,
    domain,
    crmId: `FW-${1027 + i}`,
    segment,
    industry,
    csm,
    owner,
    plan: segment === "upper" ? "Scale" : "Growth",
    seats,
    credits,
    termStart,
    addons: i % 3 === 0 ? ["forecasting"] : [],
    baseSeatRatio: 0.62 + (i % 5) * 0.04,
    basePace: 0.78 + (i % 4) * 0.05,
    contacts: [c(["Alex Rowe", "Jamie Fox", "Robin Shah", "Casey Lund", "Drew Kim", "Morgan Bly", "Quinn Ash", "Riley Vance", "Jesse Hart", "Avery Lowe"][i], "Controller", domain)],
    story: { kind: "pending" },
  })),
];
