import { describe, expect, it } from "vitest";
import {
  FLOAT_PROGRESS_FIELDS,
  formatProgress,
  nextIntegerAbove,
  nextIntegerBelow,
  parseProgressTotal,
  stepBy,
  stepDown,
  stepUp,
} from "./progressStep";

describe("stepUp / stepDown go to the next integer in that direction", () => {
  it.each([
    [1.2, 2],
    [2.5, 3],
    [2, 3],
    [0, 1],
  ])("%s + -> %s", (from, to) => {
    expect(stepUp(from)).toBe(to);
  });

  it.each([
    [1.2, 1],
    [2.5, 2],
    [2, 1],
    [0.5, 0],
  ])("%s - -> %s", (from, to) => {
    expect(stepDown(from)).toBe(to);
  });

  it("clamps - at 0", () => {
    expect(stepDown(0)).toBe(0);
    expect(stepDown(-3)).toBe(0);
  });

  it("reads float noise as the integer it stands for", () => {
    expect(stepUp(2.0000000001)).toBe(3);
    expect(stepUp(1.9999999999)).toBe(3);
    expect(stepDown(2.0000000001)).toBe(1);
    expect(stepDown(1.9999999999)).toBe(1);
    expect(stepUp(0.1 + 0.2)).toBe(1);
  });

  it("treats a blank or unparseable value as 0", () => {
    expect(stepUp(null)).toBe(1);
    expect(stepUp("")).toBe(1);
    expect(stepDown(undefined)).toBe(0);
  });
});

describe("stepUp stops at the total", () => {
  it("stops at a fractional total instead of passing it", () => {
    expect(stepUp(2, 2.5)).toBe(2.5);
    expect(stepUp("2", "2.5")).toBe(2.5);
  });

  it("steps past nothing once at the total", () => {
    expect(stepUp(2.5, 2.5)).toBe(2.5);
    expect(stepUp(12, 12)).toBe(12);
  });

  it("never lowers a value already over the total", () => {
    expect(stepUp(14, 12)).toBe(14);
  });

  it("steps freely below the total - the cap bites only at the end", () => {
    // Mirror of the above: the same total, far enough below it to step.
    expect(stepUp(1.2, 2.5)).toBe(2);
    expect(stepUp(1, 12)).toBe(2);
  });

  it.each([null, undefined, "", "?"])("has no cap with a %s total", (total) => {
    expect(stepUp(41, total)).toBe(42);
  });
});

describe("nextIntegerAbove / nextIntegerBelow are unclamped", () => {
  it("goes below 0, for a cursor that carries into an earlier arc", () => {
    expect(nextIntegerBelow(0)).toBe(-1);
    expect(nextIntegerBelow(0.5)).toBe(0);
    expect(nextIntegerAbove(-0.5)).toBe(0);
  });
});

describe("stepBy", () => {
  it.each([
    [2.5, 1, 3],
    [2.5, -1, 2],
    [2.5, 3, 5],
    [2.5, -3, 0],
    [2, 9, 11],
    [2, -9, -7],
    [2.5, 0, 2.5],
  ])("%s by %s -> %s", (from, steps, to) => {
    expect(stepBy(from, steps)).toBe(to);
  });
});

describe("parseProgressTotal", () => {
  it.each([
    [12, 12],
    [12.5, 12.5],
    ["12.5", 12.5],
    ["12", 12],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseProgressTotal(raw)).toBe(expected);
  });

  it.each([null, undefined, "", "?", "abc"])("reads %s as no total", (raw) => {
    expect(parseProgressTotal(raw)).toBeNull();
  });
});

describe("formatProgress", () => {
  it.each([
    [2, "2"],
    [2.0, "2"],
    [2.5, "2.5"],
    [0.1 + 0.2, "0.3"],
    [12.5 + 13.5, "26"],
    [2.0000000001, "2"],
    [0, "0"],
  ])("shows %s as %s", (value, shown) => {
    expect(formatProgress(value)).toBe(shown);
  });

  it("passes a placeholder through", () => {
    expect(formatProgress("?")).toBe("?");
    expect(formatProgress(null)).toBeNull();
  });
});

describe("FLOAT_PROGRESS_FIELDS", () => {
  it("holds the progress counters and not the whole-number fields", () => {
    expect(FLOAT_PROGRESS_FIELDS.has("ep_fin")).toBe(true);
    expect(FLOAT_PROGRESS_FIELDS.has("issue_total")).toBe(true);
    expect(FLOAT_PROGRESS_FIELDS.has("vol_fin_page")).toBe(false);
    expect(FLOAT_PROGRESS_FIELDS.has("runtime_min")).toBe(false);
    expect(FLOAT_PROGRESS_FIELDS.has("achievements_total")).toBe(false);
  });
});
