// The parent-chip switch (a FilterDef's `parent: { label, children }`): the
// four rules, and that values outside the children are never touched.
import { describe, expect, it } from "vitest";

import { isParentActive, toggleParentValues } from "./libraryFilters";

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
