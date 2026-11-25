import { describe, expect, it } from "vitest";

import { entitySorts } from "./entitySorts";

describe("entitySorts", () => {
  const sorts = entitySorts({ count: "credit_count", countLabel: "Credits", ownData: true });
  const byValue = (value) => sorts.find((s) => s.value === value);

  it("offers Name, the count and My rating, the last two running high to low", () => {
    expect(sorts.map((s) => [s.value, s.label, Boolean(s.descending)])).toEqual([
      ["name", "Name", false],
      ["credit_count", "Credits", true],
      ["my_rating", "My rating", true],
    ]);
  });

  it("orders the count most first and the rating best first", () => {
    const rows = [{ credit_count: 1, my_rating: "B" }, { credit_count: 5, my_rating: "S" }];
    expect([...rows].sort(byValue("credit_count").compare)[0].credit_count).toBe(5);
    expect([...rows].sort(byValue("my_rating").compare)[0].my_rating).toBe("S");
  });

  it("drops My rating for a viewer without a list", () => {
    const own = entitySorts({ count: "casting_count", countLabel: "Appearances", ownData: false });
    expect(own.map((s) => s.value)).toEqual(["name", "casting_count"]);
  });
});
