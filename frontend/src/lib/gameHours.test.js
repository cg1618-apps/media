import { describe, expect, it } from "vitest";
import { hours, timeToBeatFields } from "./gameHours";

describe("hours", () => {
  it("formats a figure and drops a missing or unreadable one", () => {
    expect(hours(32.5)).toBe("32.5 h");
    expect(hours("12")).toBe("12 h");
    expect(hours(null)).toBeNull();
    expect(hours("")).toBeNull();
    expect(hours("abc")).toBeNull();
  });
});

describe("timeToBeatFields", () => {
  it("lists the recorded figures in order", () => {
    expect(
      timeToBeatFields({ hltb_main: 10, hltb_main_extra: null, hltb_completionist: 30 }),
    ).toEqual([
      { label: "Main", value: "10 h" },
      { label: "Completionist", value: "30 h" },
    ]);
  });

  it("returns nothing when no figure is recorded", () => {
    expect(timeToBeatFields({})).toEqual([]);
    expect(timeToBeatFields(null)).toEqual([]);
  });
});
