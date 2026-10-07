import { describe, expect, it } from "vitest";

import { orderLoadedCast, sortCast } from "./castOrder";

const cast = [
  { name: "Other", role: "Other", position: 0 },
  { name: "Support", role: "Supporting", position: 1 },
  { name: "Roleless", role: null, position: 2 },
  { name: "Lead", role: "Main", position: 3 },
  { name: "Second", role: "Core", position: 4 },
  { name: "Lead 2", role: "Main", position: 5 },
];

describe("sortCast", () => {
  it("ranks by role, then position, a role-less row last", () => {
    expect(sortCast(cast).map((r) => r.name)).toEqual([
      "Lead", "Lead 2", "Second", "Support", "Other", "Roleless",
    ]);
  });

  it("does not reorder the array it was given", () => {
    sortCast(cast);
    expect(cast[0].name).toBe("Other");
  });
});

describe("orderLoadedCast", () => {
  it("sorts like the detail page and renumbers position to the shown order", () => {
    expect(orderLoadedCast(cast).map((r) => [r.name, r.position])).toEqual([
      ["Lead", 0], ["Lead 2", 1], ["Second", 2], ["Support", 3], ["Other", 4], ["Roleless", 5],
    ]);
  });

  it("takes a missing cast as empty", () => {
    expect(orderLoadedCast(undefined)).toEqual([]);
  });
});
