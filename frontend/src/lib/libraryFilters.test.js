// The parent-chip switch (a FilterDef's `parent: { label, children }`): the
// four rules, and that values outside the children are never touched.
import { describe, expect, it } from "vitest";

import {
  applyFilterDefs,
  countActiveFilters,
  initialFilters,
  isFilterActive,
  isParentActive,
  sameFilters,
  toggleParentValues,
} from "./libraryFilters";

const CHILDREN = ["h-comic", "hentai"];

describe("toggleParentValues", () => {
  it("turns every child on when none is on", () => {
    expect(toggleParentValues(new Set(), CHILDREN)).toEqual(new Set(CHILDREN));
  });

  it("turns every child off when all are on", () => {
    expect(toggleParentValues(new Set(CHILDREN), CHILDREN)).toEqual(new Set());
  });

  it("turns the rest on when only some are on", () => {
    expect(toggleParentValues(new Set(["hentai"]), CHILDREN)).toEqual(
      new Set(CHILDREN),
    );
  });

  it("leaves values outside the children alone, either way", () => {
    expect(toggleParentValues(new Set(["anime"]), CHILDREN)).toEqual(
      new Set(["anime", ...CHILDREN]),
    );
    expect(toggleParentValues(new Set(["anime", ...CHILDREN]), CHILDREN)).toEqual(
      new Set(["anime"]),
    );
  });

  it("returns a new Set rather than mutating the one it was given", () => {
    const active = new Set(["hentai"]);
    toggleParentValues(active, CHILDREN);
    expect(active).toEqual(new Set(["hentai"]));
  });
});

describe("isParentActive", () => {
  it("is true only while every child is on", () => {
    expect(isParentActive(new Set(CHILDREN), CHILDREN)).toBe(true);
    expect(isParentActive(new Set(["hentai"]), CHILDREN)).toBe(false);
    expect(isParentActive(new Set(), CHILDREN)).toBe(false);
  });

  // An empty child list would be vacuously "all on"; a parent with nothing
  // under it is never active.
  it("is false for a parent with no children", () => {
    expect(isParentActive(new Set(["anime"]), [])).toBe(false);
  });
});

// A "range" def: its state is { min, max }, either bound alone narrowing,
// an item with no value never matching a set range.
import { rangeFilter } from "./libraryFilterDefs";

describe("range filters", () => {
  const hltb = rangeFilter("hltb", "HLTB Main + Extra", (g) => g.hltb_main_extra, { unit: "h" });
  const defs = [hltb];
  const items = [
    { id: "short", hltb_main_extra: 8 },
    { id: "mid", hltb_main_extra: 30 },
    { id: "long", hltb_main_extra: 90 },
    { id: "unknown", hltb_main_extra: null },
  ];
  const run = (range) =>
    applyFilterDefs(items, defs, { hltb: range }).map((i) => i.id);

  it("starts empty and inactive", () => {
    const state = initialFilters(defs);
    expect(state.hltb).toEqual({ min: "", max: "" });
    expect(isFilterActive(state.hltb)).toBe(false);
    expect(countActiveFilters(state)).toBe(0);
    expect(run(state.hltb)).toEqual(["short", "mid", "long", "unknown"]);
  });

  it("narrows by a minimum alone, a maximum alone, or both, inclusively", () => {
    expect(run({ min: "30", max: "" })).toEqual(["mid", "long"]);
    expect(run({ min: "", max: "30" })).toEqual(["short", "mid"]);
    expect(run({ min: "10", max: "90" })).toEqual(["mid", "long"]);
  });

  it("counts as one active filter, and compares by its bounds", () => {
    expect(countActiveFilters({ hltb: { min: "5", max: "9" } })).toBe(1);
    expect(sameFilters({ hltb: { min: "5", max: "" } }, { hltb: { min: "5", max: "" } })).toBe(true);
    expect(sameFilters({ hltb: { min: "5", max: "" } }, { hltb: { min: "6", max: "" } })).toBe(false);
  });

  it("ignores a bound that is not a number", () => {
    expect(isFilterActive({ min: "abc", max: "" })).toBe(false);
  });
});
