// Frontend: every media library's Title sort reads the English name first,
// and puts a Latin title ahead of a CJK one whatever the browser's language.
//
// localeCompare with no locale collates in the browser's, and under zh-TW
// that puts Han characters BEFORE Latin - so a CN-only entry jumped ahead of
// every English title even where the sort key was English-first. This test
// makes the default collation zh-TW's for its duration, which is what makes
// it bite: under the test runner's own en-US the bug cannot show.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LIBRARY_CONFIGS } from "./index";

const PREFIX = {
  anime: "anime",
  "anime-movie": "anime_movie",
  movie: "movie",
  "tv-show": "tv",
  cartoon: "cartoon",
  manga: "manga",
  book: "book",
  comic: "comic",
  game: "game",
  "h-comic": "h_comic",
  "h-game": "h_game",
  hentai: "hentai",
};

const original = String.prototype.localeCompare;
beforeAll(() => {
  String.prototype.localeCompare = function (that, locales, options) {
    return original.call(this, that, locales ?? "zh-TW", options);
  };
});
afterAll(() => {
  String.prototype.localeCompare = original;
});

describe.each(Object.keys(LIBRARY_CONFIGS))("%s library Title sort", (type) => {
  it("sorts on the English name first, a CN-only title after every Latin one", () => {
    const p = PREFIX[type];
    const rows = [
      { system_id: "cn-only", [`${p}_name_cn`]: "黑神話" },
      { system_id: "zeta", [`${p}_name_en`]: "Zeta", [`${p}_name_cn`]: "漫威" },
      { system_id: "alpha", [`${p}_name_en`]: "Alpha" },
      { system_id: "ten", [`${p}_name_en`]: "Item 10" },
      { system_id: "two", [`${p}_name_en`]: "Item 2" },
    ];
    const title = LIBRARY_CONFIGS[type].sortDefs.find((s) => s.key === "title");
    const order = [...rows].sort((a, b) => title.compare(a, b, {}, {}));
    expect(order.map((r) => r.system_id)).toEqual([
      "alpha",
      "two",
      "ten",
      "zeta",
      "cn-only",
    ]);
  });
});
