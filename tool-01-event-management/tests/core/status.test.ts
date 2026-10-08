import { describe, expect, it } from "vitest";
import { eventHealth } from "@/core/exposure/status";

const calm = { alertSeverities: [] as Array<"HIGH" | "WATCH">, overThreshold: false, incomplete: false, urgentDeadline: false };

describe("event health word", () => {
  it("is on track with nothing open", () => {
    expect(eventHealth(calm)).toBe("ON_TRACK");
  });
  it("asks for a decision on a high alert, over threshold, or an urgent deadline", () => {
    expect(eventHealth({ ...calm, alertSeverities: ["WATCH", "HIGH"] })).toBe("DECIDE");
    expect(eventHealth({ ...calm, overThreshold: true })).toBe("DECIDE");
    expect(eventHealth({ ...calm, urgentDeadline: true })).toBe("DECIDE");
  });
  it("says keep an eye for watch alerts or incomplete figures", () => {
    expect(eventHealth({ ...calm, alertSeverities: ["WATCH"] })).toBe("WATCH");
    expect(eventHealth({ ...calm, incomplete: true })).toBe("WATCH");
  });
});
