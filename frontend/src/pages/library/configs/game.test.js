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

// The filter panel's layout and vocabularies, and the sort list.
describe("game library filters and sorts", () => {
  const defs = GAME_LIBRARY_CONFIG.filterDefs;
  const byKey = (key) => defs.find((fd) => fd.key === key);
  const reversed = (field, values) => [...values].reverse().map((v) => ({ [field]: v }));

  it("orders Type and Release by their vocabularies, on one row", () => {
    expect(byKey("gameType").deriveOptions(reversed("game_type", ["Base Game", "DLC", "Expansion", "Bundle"])))
      .toEqual(["Base Game", "DLC", "Expansion", "Bundle"]);
    const RELEASE = ["Unreleased", "Early Access", "Released", "Ongoing", "Discontinued", "Cancelled"];
    expect(byKey("releaseStatus").deriveOptions(reversed("release_status", RELEASE))).toEqual(RELEASE);
    const keys = defs.map((fd) => fd.key);
    expect(keys.indexOf("releaseStatus")).toBe(keys.indexOf("gameType") + 1);
    expect(byKey("gameType").row).toBeTruthy();
    expect(byKey("releaseStatus").row).toBe(byKey("gameType").row);
  });

  it("groups Play Status might, planned, playing, completed, dropped, with a hint per chip", () => {
    const play = byKey("playingStatus");
    expect(play.groupOptions).toEqual(["Might Play", "Planned", "Playing", "Completed", "Dropped"]);
    expect(play.optionHint("Planned")).toBe("Includes: Plan to Play, Play When Released");
    expect(play.optionHint("Might Play")).toMatch(/no status/);
  });

  it("puts Mode and Combat Mode on one row, and has a Platform filter", () => {
    const keys = defs.map((fd) => fd.key);
    expect(keys.indexOf("combatMode")).toBe(keys.indexOf("gameMode") + 1);
    expect(byKey("gameMode").row).toBeTruthy();
    expect(byKey("combatMode").row).toBe(byKey("gameMode").row);
    expect(byKey("gameMode").advanced).toBeFalsy();
    const platform = byKey("gamePlatform");
    expect(platform.advanced).toBeFalsy();
    const games = [{ game_platform: "PC, PS5" }, { game_platform: "PC" }];
    expect(platform.deriveOptions(games)).toEqual(["PC", "PS5"]);
  });

  it("keeps Main/Remake, Ownership and HLTB in the advanced section, ahead of the genres", () => {
    const advanced = defs.filter((fd) => fd.advanced).map((fd) => fd.key);
    expect(advanced).toEqual(["isMain", "ownership", "hltbMainExtra", "myRating", "gameGenre", "gameTheme", "label"]);
    expect(byKey("ownership").personal).toBe(true);
    expect(byKey("isMain").deriveOptions(reversed("is_main", ["Main", "Remake", "Remaster"])))
      .toEqual(["Main", "Remake", "Remaster"]);
  });

  it("filters HLTB Main + Extra by a minimum, a maximum or both", () => {
    const hltb = byKey("hltbMainExtra");
    expect(hltb.type).toBe("range");
    const g = (h) => ({ hltb_main_extra: h });
    expect(hltb.match(g(30), { min: "20", max: "" })).toBe(true);
    expect(hltb.match(g(30), { min: "", max: "25" })).toBe(false);
    expect(hltb.match(g(null), { min: "1", max: "" })).toBe(false);
  });

  it("offers the sorts title, release date, my rating, Metacritic, Metacritic user, playtime, US price", () => {
    expect(GAME_LIBRARY_CONFIG.sortDefs.map((s) => s.label)).toEqual([
      "Title", "Release Date", "My Rating", "Metacritic", "Metacritic User", "Playtime", "US Price",
    ]);
  });

  it("sorts by US price, highest first, unpriced last", () => {
    const price = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "price_original_us");
    const rows = [{ id: "a", price_original_us: "19.99" }, { id: "b", price_original_us: null }, { id: "c", price_original_us: "59.99" }];
    expect([...rows].sort(price.compare).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by Metacritic user score, highest first, unscored last", () => {
    const user = GAME_LIBRARY_CONFIG.sortDefs.find((s) => s.key === "metacritic_user_score");
    const rows = [{ id: "a", metacritic_user_score: 7.1 }, { id: "b" }, { id: "c", metacritic_user_score: 8.4 }];
    expect([...rows].sort(user.compare).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
