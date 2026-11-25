import { describe, expect, it } from "vitest";

import { directed, effectiveDirection } from "./sortDirection";

describe("directed", () => {
  const byN = (a, b) => a.n - b.n;
  const rows = [{ n: 2 }, { n: 1 }, { n: 3 }];

  it("keeps the comparator as it is when not reversed", () => {
    expect(directed(byN, false)).toBe(byN);
    expect([...rows].sort(directed(byN, false)).map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it("runs it backwards when reversed, passing extra arguments through", () => {
    expect([...rows].sort(directed(byN, true)).map((r) => r.n)).toEqual([3, 2, 1]);
    const seen = [];
    directed((a, b, x, y) => seen.push(x, y) && 0, true)({}, {}, "f", "s");
    expect(seen).toEqual(["f", "s"]);
  });
});

describe("effectiveDirection", () => {
  it("flips the natural direction while reversed", () => {
    expect(effectiveDirection(false, false)).toBe("asc");
    expect(effectiveDirection(false, true)).toBe("desc");
    expect(effectiveDirection(true, false)).toBe("desc");
    expect(effectiveDirection(true, true)).toBe("asc");
  });
});
