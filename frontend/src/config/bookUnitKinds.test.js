import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOOK_UNIT_KINDS_BY_TYPE } from "../lib/bookUnits";

// Reads the Python source rather than importing it: the guard has to fail
// when the backend map changes, which a duplicated JS copy could never do.
const constants = fs.readFileSync(
  path.resolve(__dirname, "../../../app/utils/constants.py"),
  "utf8",
);

describe("book unit kinds", () => {
  it("matches the backend map", () => {
    const block = constants.match(
      /BOOK_UNIT_KINDS_BY_TYPE = \{([\s\S]*?)\n\}/,
    );
    expect(block).not.toBeNull();

    const parsed = {};
    for (const line of block[1].split("\n")) {
      const m = line.match(/"([^"]+)":\s*\(([^)]*)\)/);
      if (!m) continue;
      parsed[m[1]] = m[2]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }

    // Guard the guard: an empty or partial parse (e.g. from a reformat of
    // constants.py) must fail loudly rather than vacuously passing an
    // {} === {} comparison.
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    for (const bookType of ["輕小說", "小說", "網路小說", "短篇集", "指南/設定集", "其他"]) {
      expect(parsed).toHaveProperty(bookType);
    }

    expect(parsed).toEqual(BOOK_UNIT_KINDS_BY_TYPE);
  });
});
