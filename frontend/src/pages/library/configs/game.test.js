// Frontend: the game library config's filters and sorts.
//
// The play axis is new, so these lock the three filters that make the page
// useful — play status, ownership and base-game-vs-DLC — and the playtime
// sort, which is the only numeric sort no other library has.
import { describe, expect, it } from "vitest";
import GAME_LIBRARY_CONFIG from "./game";

const GAMES = [
  {
    system_id: "1",
    game_name_cn: "艾爾登法環",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    playing_status: "Active Playing",
    ownership: "Owned",
    hours_played: 32.5,
    metacritic_score: 96,
  },
  {
    system_id: "2",
    game_name_en: "Shadow of the Erdtree",
    game_type: "DLC",
    playing_status: "Might Play",
    ownership: "Wishlist",
  },
];

describe("game library config", () => {
  it("sorts by title on the English name first, as every other library does", () => {
    const rows = [
      { system_id: "a", game_name_cn: "漫威爭鋒", game_name_en: "Marvel Rivals" },
      { system_id: "b", game_name_cn: "黑神話：悟空", game_name_en: "Black Myth: Wukong" },
      { system_id: "c", game_name_en: "A Monster's Expedition" },
      { system_id: "d", game_name_cn: "只有中文" },
    ];
    const title = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "title");
    // An entry with no English name sorts on its next name - here its CN.
    expect([...rows].sort(title.compare).map((g) => g.system_id)).toEqual([
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("filters by play-status display group", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find(
      (f) => f.key === "playingStatus",
    );
    expect(filter.match(GAMES[0], new Set(["Playing"]))).toBe(true);
    expect(filter.match(GAMES[1], new Set(["Playing"]))).toBe(false);
  });

  it("filters by ownership", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "ownership");
    expect(filter.match(GAMES[0], new Set(["Owned"]))).toBe(true);
  });

  it("filters by game type so DLC can be separated from base games", () => {
    const filter = GAME_LIBRARY_CONFIG.filterDefs.find((f) => f.key === "gameType");
    expect(filter.match(GAMES[1], new Set(["DLC"]))).toBe(true);
  });

  it("sorts by playtime, longest first", () => {
    const sort = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "hours_played");
    expect([...GAMES].sort(sort.compare)[0].system_id).toBe("1");
  });

  // A game nobody scored must not outrank a bad one, so an absent score
  // sorts last rather than as a zero.
  it("sorts by metacritic score, highest first, unscored last", () => {
    const sort = GAME_LIBRARY_CONFIG.sortDefs.find(
      (s) => s.key === "metacritic_score",
    );
    const sorted = [...GAMES].sort(sort.compare);
    expect(sorted[0].system_id).toBe("1");
    expect(sorted[1].system_id).toBe("2");
  });
});
