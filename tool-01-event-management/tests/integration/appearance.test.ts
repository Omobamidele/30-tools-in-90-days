import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeTestDb, makeWorld, type World } from "./harness";
import { createClient } from "@/services/clients";
import { createEvent, getEvent, updateEvent } from "@/services/events";
import { getPreferences, resolveWallpaper, updatePreferences } from "@/services/preferences";
import { DomainError } from "@/services/errors";
import { COVERS, WALLPAPERS } from "@/config/imagery";
import * as schema from "@/db/schema";
import { existsSync } from "node:fs";
import path from "node:path";

let w: World;
let clientId: string;

beforeAll(async () => {
  w = await makeWorld();
  clientId = (await createClient(w.ctx("OPS_DIRECTOR"), { name: "Client A" })).id;
});
afterAll(async () => {
  await closeTestDb();
});

const baseEvent = () => ({
  clientId,
  name: "Covered summit",
  type: "Customer event",
  startDate: "2027-10-01",
  endDate: "2027-10-02",
  timezone: "Europe/Lisbon",
  ownerId: w.people.EVENT_MANAGER.id,
  forecastAttendance: 120,
  baseCurrency: "EUR",
});

describe("imagery catalogue", () => {
  it("points only at files that exist in public/", () => {
    for (const p of [...WALLPAPERS, ...COVERS]) {
      expect(existsSync(path.join(process.cwd(), "public", p.src)), p.src).toBe(true);
    }
  });
});

describe("wallpaper preference", () => {
  it("defaults to the organisation wallpaper and stores a personal choice", async () => {
    const ctx = w.ctx("FINANCE");
    expect(await getPreferences(ctx)).toEqual({ wallpaper: null, weeklyBrief: true });
    expect(resolveWallpaper({ wallpaper: null, weeklyBrief: true }, "ballroom")?.key).toBe("ballroom");

    await updatePreferences(ctx, { wallpaper: "skyline" });
    expect((await getPreferences(ctx)).wallpaper).toBe("skyline");
    await updatePreferences(ctx, { wallpaper: "plain" });
    expect(resolveWallpaper(await getPreferences(ctx), "ballroom")).toBeNull();
  });

  it("keeps preferences per person", async () => {
    await updatePreferences(w.ctx("MD"), { wallpaper: "gala" });
    expect((await getPreferences(w.ctx("ADMIN"))).wallpaper).toBeNull();
  });

  it("rejects unknown wallpapers and ignores stale stored values", async () => {
    await expect(updatePreferences(w.ctx("MD"), { wallpaper: "disco" })).rejects.toBeInstanceOf(DomainError);
    await w.db.update(schema.users).set({ preferences: { wallpaper: "removed-photo" } }).where(eq(schema.users.id, w.people.MD.id));
    expect(await getPreferences(w.ctx("MD"))).toEqual({ wallpaper: null, weeklyBrief: true });
  });
});

describe("event cover", () => {
  it("stores a catalogue cover, audits a change and allows clearing it", async () => {
    const ops = w.ctx("OPS_DIRECTOR");
    const e = await createEvent(ops, { ...baseEvent(), coverImage: "lisbon" });
    expect(e.coverImage).toBe("lisbon");

    const updated = await updateEvent(ops, e.id, { ...baseEvent(), coverImage: "podium" }, e.lockVersion);
    expect(updated.coverImage).toBe("podium");
    const log = await w.db.select().from(schema.activityLog).where(eq(schema.activityLog.entityId, e.id));
    expect(log.some((l) => JSON.stringify(l.diff ?? {}).includes("podium"))).toBe(true);

    const cleared = await updateEvent(ops, e.id, { ...baseEvent(), coverImage: "" }, updated.lockVersion);
    expect(cleared.coverImage).toBeNull();
    expect((await getEvent(ops, e.id)).event.coverImage).toBeNull();
  });

  it("rejects a cover that is not in the catalogue", async () => {
    await expect(createEvent(w.ctx("OPS_DIRECTOR"), { ...baseEvent(), coverImage: "https://example.com/x.jpg" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      fieldErrors: { coverImage: "Choose one of the listed cover photos" },
    });
  });
});
