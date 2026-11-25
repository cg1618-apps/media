// The advanced section's tag filters: chips ordered by how many of the
// library's entries carry each value, most first, a tie in title order. The
// fixture makes the counts disagree with the alphabet - 冒險 sorts first by
// name and is the rarest - so an alphabetical order fails it.
import { describe, expect, it } from "vitest";

import { genreFilters, tagFilter } from "./libraryFilterDefs";
import { LIBRARY_CONFIGS } from "../pages/library/configs";

const ROWS = [
  { genre_main: "奇幻, 冒險", label: "會跳OP" },
  { genre_main: "奇幻, 戀愛", label: "會跳OP, 很多福利" },
  { genre_main: "奇幻, 戀愛" },
  { genre_main: "日常" },
  { genre_main: null },
];

describe("tagFilter", () => {
  it("orders its chips by appearances in the library, most first, ties by name", () => {
    const def = tagFilter("genreMain", "Genre Main", "genre_main");
    expect(def.deriveOptions(ROWS)).toEqual(["奇幻", "戀愛", ...["冒險", "日常"].sort((a, b) => a.localeCompare(b))]);
  });

  it("counts a value once per entry", () => {
    const def = tagFilter("genreMain", "Genre Main", "genre_main");
    expect(def.deriveOptions([{ genre_main: "日常, 日常" }, { genre_main: "奇幻" }, { genre_main: "奇幻" }])).toEqual([
      "奇幻",
      "日常",
    ]);
  });
});

describe("the genre filters", () => {
  it("are Genre Main, Genre Sub and Label", () => {
    expect(genreFilters().map((fd) => fd.label)).toEqual(["Genre Main", "Genre Sub", "Label"]);
  });

  it("order Label by appearances too", () => {
    const label = genreFilters().find((fd) => fd.key === "label");
    expect(label.deriveOptions(ROWS)).toEqual(["會跳OP", "很多福利"]);
  });

  it("give a game Genre, Theme and Label", () => {
    // The genre-related three close its advanced section.
    const advanced = LIBRARY_CONFIGS.game.filterDefs.filter((fd) => fd.advanced);
    expect(advanced.slice(-3).map((fd) => fd.label)).toEqual(["Genre", "Theme", "Label"]);
  });
});
