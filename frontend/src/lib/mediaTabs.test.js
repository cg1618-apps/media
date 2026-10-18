// The hub pages' media tab row, the count shown on each tab and the header
// totals come from one list, so a tab can never appear without being counted.
import { describe, expect, it } from "vitest";
import { buildMediaTabs, isCompleted } from "./mediaTabs";

const row = (label, type, entries, offered) => ({ label, type, entries, offered });

describe("buildMediaTabs", () => {
  it("offers a tab only for a non-empty list, in the order given", () => {
    const { tabs } = buildMediaTabs([
      row("Anime", "anime", [{}]),
      row("Manga", "manga", []),
      row("Game", "game", [{}, {}]),
    ]);
    expect(tabs).toEqual(["Anime", "Game"]);
  });

  it("drops a row whose type the page does not offer, however full", () => {
    const { tabs, total } = buildMediaTabs([
      row("Anime", "anime", [{}], false),
      row("Game", "game", [{}], true),
    ]);
    expect(tabs).toEqual(["Game"]);
    expect(total).toBe(1);
  });

  it("counts every tab it offers", () => {
    const { tabs, countOf } = buildMediaTabs([
      row("Comic", "comic", [{}, {}, {}]),
      row("H-Game", "h-game", [{}]),
      row("Hentai", "hentai", [{}, {}]),
    ]);
    expect(tabs.map(countOf)).toEqual([3, 1, 2]);
  });

  it("counts zero for a tab it does not hold", () => {
    expect(buildMediaTabs([row("Anime", "anime", [{}])]).countOf("Characters")).toBe(0);
  });

  it("totals every listed entry and judges each by its own status field", () => {
    const { total, completed } = buildMediaTabs([
      row("Anime", "anime", [{ watching_status: "Completed" }, { watching_status: "Paused" }]),
      row("Novel", "novel", [{ reading_status: "Completed (解說)" }]),
      row("Game", "game", [{ playing_status: "Completed" }, { playing_status: "Plan to Play" }]),
    ]);
    expect(total).toBe(5);
    expect(completed).toBe(3);
  });
});

describe("isCompleted", () => {
  it("reads the type's own status field", () => {
    expect(isCompleted("game", { playing_status: "Completed" })).toBe(true);
    // A game's status lives in playing_status; a stray watching_status does not count.
    expect(isCompleted("game", { watching_status: "Completed" })).toBe(false);
    expect(isCompleted("hentai", { watching_status: "Completed (解說)" })).toBe(true);
    expect(isCompleted("h-comic", { reading_status: "Dropped" })).toBe(false);
  });
});
