// Frontend: unit tests for the anime-season calendar helpers.
import { describe, it, expect } from "vitest";
import { nextSeason } from "./season";

describe("nextSeason", () => {
  it("returns the season after the one the date falls in", () => {
    expect(nextSeason(new Date(2026, 0, 15))).toEqual({ code: "SPR", year: 2026 });
    expect(nextSeason(new Date(2026, 3, 1))).toEqual({ code: "SUM", year: 2026 });
    expect(nextSeason(new Date(2026, 8, 25))).toEqual({ code: "FAL", year: 2026 });
  });

  it("rolls Fall over into Winter of the following year", () => {
    expect(nextSeason(new Date(2026, 9, 1))).toEqual({ code: "WIN", year: 2027 });
    expect(nextSeason(new Date(2026, 11, 31))).toEqual({ code: "WIN", year: 2027 });
  });

  it("treats the last day of a quarter as still in that season", () => {
    expect(nextSeason(new Date(2026, 2, 31))).toEqual({ code: "SPR", year: 2026 });
    expect(nextSeason(new Date(2026, 5, 30))).toEqual({ code: "SUM", year: 2026 });
  });
});
