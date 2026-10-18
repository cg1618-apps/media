// The hub pages' media tab row and the count shown on each tab come from one
// list, so a tab can never appear without its count.
import { describe, expect, it } from "vitest";
import { buildMediaTabs } from "./mediaTabs";

describe("buildMediaTabs", () => {
  it("offers a tab only for a non-empty list, in the order given", () => {
    const { tabs } = buildMediaTabs([
      ["Anime", [1]],
      ["Manga", []],
      ["Game", [1, 2]],
    ]);
    expect(tabs).toEqual(["Anime", "Game"]);
  });

  it("drops a row whose type the page does not offer, however full", () => {
    const { tabs } = buildMediaTabs([
      ["Anime", [1], false],
      ["Game", [1], true],
    ]);
    expect(tabs).toEqual(["Game"]);
  });

  it("counts every tab it offers", () => {
    const { tabs, countOf } = buildMediaTabs([
      ["Comic", [1, 2, 3]],
      ["H-Game", [1]],
      ["Hentai", [1, 2]],
    ]);
    expect(tabs.map(countOf)).toEqual([3, 1, 2]);
  });

  it("counts zero for a tab it does not hold", () => {
    expect(buildMediaTabs([["Anime", [1]]]).countOf("Characters")).toBe(0);
  });
});
