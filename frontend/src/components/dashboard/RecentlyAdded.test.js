// How Recently added maps "rows" to cards: anime two rows, every other type
// one, a row being the grid's column count at each width.
import { describe, expect, it } from "vitest";

import {
  GRID_COLUMNS,
  RECENT_PER_TYPE,
  cardVisibility,
  rowsFor,
  sectionsOf,
} from "./RecentlyAdded";

const entry = (id, media_type) => ({ system_id: id, media_type });
const many = (type, n) => Array.from({ length: n }, (_, i) => entry(`${type}${i}`, type));

describe("rows", () => {
  it("gives anime two rows and every other type one", () => {
    expect(rowsFor("anime")).toBe(2);
    expect(rowsFor("manga")).toBe(1);
    expect(rowsFor("anime-movie")).toBe(1);
  });

  it("asks the server for anime's two rows at the widest grid", () => {
    expect(RECENT_PER_TYPE).toBe(2 * GRID_COLUMNS.xl);
  });
});

describe("cardVisibility", () => {
  // The count of cards visible at each width, for a section of `rows`.
  const visibleAt = (rows, total) => {
    const classes = Array.from({ length: total }, (_, i) => cardVisibility(i, rows));
    const shown = (bp) =>
      classes.filter((c) => {
        const order = ["base", "sm", "lg", "xl"];
        // The last rule at or below this breakpoint wins, as in CSS.
        let visible = true;
        for (const b of order.slice(0, order.indexOf(bp) + 1)) {
          if (b === "base" && c.split(" ").includes("hidden")) visible = false;
          if (b !== "base" && c.includes(`${b}:hidden`)) visible = false;
          if (b !== "base" && c.includes(`${b}:block`)) visible = true;
        }
        return visible;
      }).length;
    return { base: shown("base"), sm: shown("sm"), lg: shown("lg"), xl: shown("xl") };
  };

  it("shows whole rows only: one row is the column count at each width", () => {
    expect(visibleAt(1, 6)).toEqual({ base: 2, sm: 3, lg: 4, xl: 6 });
  });

  it("shows two whole rows of anime", () => {
    expect(visibleAt(2, 12)).toEqual({ base: 4, sm: 6, lg: 8, xl: 12 });
  });
});

describe("sectionsOf", () => {
  it("groups by type in the registry's order and skips an empty type", () => {
    const sections = sectionsOf([entry("m1", "manga"), entry("a1", "anime")]);
    expect(sections.map((s) => s.type)).toEqual(["anime", "manga"]);
  });

  it("cuts a one-row type at six and anime at twelve", () => {
    const sections = sectionsOf([...many("manga", 12), ...many("anime", 12)]);
    const count = Object.fromEntries(sections.map((s) => [s.type, s.entries.length]));
    expect(count).toEqual({ anime: 12, manga: 6 });
  });

  it("returns no sections for no rows", () => {
    expect(sectionsOf([])).toEqual([]);
  });
});
