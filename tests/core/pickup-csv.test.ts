import { describe, expect, it } from "vitest";
import { guessDateFormat, mapPickupCsv, parseCsvDate } from "@/core/pickup-csv";

describe("pickup CSV", () => {
  it("parses ISO, US and EU dates and rejects impossible ones", () => {
    expect(parseCsvDate("2027-11-14", "US")).toBe("2027-11-14");
    expect(parseCsvDate("11/14/2027", "US")).toBe("2027-11-14");
    expect(parseCsvDate("14/11/2027", "EU")).toBe("2027-11-14");
    expect(parseCsvDate("14.11.27", "EU")).toBe("2027-11-14");
    expect(parseCsvDate("02/30/2027", "US")).toBeNull();
    expect(parseCsvDate("Nov 14", "US")).toBeNull();
  });

  it("guesses the date format from the values", () => {
    expect(guessDateFormat(["2027-11-14"])).toBe("ISO");
    expect(guessDateFormat(["14/11/2027", "15/11/2027"])).toBe("EU");
    expect(guessDateFormat(["11/14/2027"])).toBe("US");
  });

  it("maps rows onto block nights with row-level errors", () => {
    const rows = [
      { Night: "11/13/2027", "Rooms Picked Up": "71", Forecast: "" },
      { Night: "11/14/2027", "Rooms Picked Up": "1,40", Forecast: "170" },
      { Night: "11/15/2027", "Rooms Picked Up": "ten", Forecast: "" },
      { Night: "11/20/2027", "Rooms Picked Up": "5", Forecast: "" }, // outside the block
      { Night: "11/13/2027", "Rooms Picked Up": "72", Forecast: "" }, // duplicate
      { Night: "", "Rooms Picked Up": "", Forecast: "" }, // blank line
      { Night: "Total", "Rooms Picked Up": "216", Forecast: "" },
    ];
    const r = mapPickupCsv(
      rows,
      { dateColumn: "Night", pickedUpColumn: "Rooms Picked Up", forecastColumn: "Forecast", dateFormat: "US" },
      ["2027-11-13", "2027-11-14", "2027-11-15"],
    );
    expect(r.nights).toEqual({
      "2027-11-13": { pickedUp: 71, forecastFinal: null },
      "2027-11-14": { pickedUp: 140, forecastFinal: 170 },
    });
    expect(r.ignored).toBe(1);
    expect(r.errors.map((e) => [e.row, e.problem])).toEqual([
      [4, "Not a whole number of rooms"],
      [6, "Night appears more than once; the first row was kept"],
      [8, "Not a date"],
    ]);
  });
});
