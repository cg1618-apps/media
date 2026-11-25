// The hubs' media tabs: which filters and sorts each type offers, and how a
// view narrows and orders a list. Every filter case holds entries on both
// sides of the filter, so a pass shows the filter did the narrowing.
import { describe, expect, it } from "vitest";
import {
  NOT_COMPLETED,
  applyView,
  chipOptions,
  defaultView,
  hubSortOptions,
  hubTabConfig,
  isFiltered,
} from "./hubTabs";

const ids = (list) => list.map((e) => e.system_id);
const withFilter = (type, scope, key, value) => {
  const view = defaultView(type, scope);
  return { ...view, filters: { ...view.filters, [key]: value } };
};
const filterKeys = (type, scope = "franchise") =>
  hubTabConfig(type, scope).filters.map((f) => f.key);

describe("hubTabs - which filters a tab carries", () => {
  it("gives every non-game type a Completed filter and no status pills", () => {
    for (const type of [
      "anime",
      "anime-movie",
      "manga",
      "book",
      "comic",
      "movie",
      "tv-show",
      "cartoon",
      "h-comic",
      "hentai",
    ]) {
      for (const scope of ["franchise", "series"]) {
        const keys = filterKeys(type, scope);
        expect(keys).toContain("completed");
        expect(keys).not.toContain("watchingStatus");
        expect(keys).not.toContain("readingStatus");
        expect(keys).not.toContain("airingStatus");
        expect(keys).not.toContain("releaseStatus");
      }
    }
  });

  it("gives anime only the airing type besides Completed", () => {
    expect(filterKeys("anime")).toEqual(["airingType", "completed"]);
  });

  it("gives the two game tabs a game type and a completion level instead", () => {
    for (const type of ["game", "h-game"]) {
      expect(filterKeys(type)).toEqual(["gameType", "completionLevel"]);
    }
  });

  it("replaces the book's serialization pills with the 小說 filter", () => {
    expect(filterKeys("book")).toEqual(["novel", "completed"]);
  });

  it("offers Metacritic sorts on a game and not on an h-game", () => {
    expect(hubTabConfig("game", "series").sorts).toEqual(
      expect.arrayContaining(["metacritic_score", "metacritic_user_score"]),
    );
    expect(hubTabConfig("h-game", "series").sorts).not.toContain("metacritic_score");
  });

  it("groups by series on the franchise hub only", () => {
    expect(defaultView("anime", "franchise").groupBySeries).toBe(true);
    expect(hubTabConfig("anime", "series").groupBySeries).toBeUndefined();
  });

  it("opens manga, h-comic, game and h-game on release date", () => {
    for (const type of ["manga", "h-comic", "game", "h-game"]) {
      expect(defaultView(type, "series").sort).toBe("release_date");
    }
  });
});

describe("hubTabs - the Completed filter", () => {
  const anime = [
    { system_id: "done", anime_name_en: "A", watching_status: "Completed" },
    { system_id: "open", anime_name_en: "B", watching_status: "Plan to Watch" },
  ];

  it("keeps everything on All", () => {
    const view = defaultView("anime", "series");
    expect(isFiltered(view.filters)).toBe(false);
    expect(ids(applyView("anime", "series", anime, view))).toEqual(["done", "open"]);
  });

  it("keeps the finished entries on Yes and the rest on No", () => {
    const yes = withFilter("anime", "series", "completed", "yes");
    const no = withFilter("anime", "series", "completed", "no");
    expect(isFiltered(yes.filters)).toBe(true);
    expect(ids(applyView("anime", "series", anime, yes))).toEqual(["done"]);
    expect(ids(applyView("anime", "series", anime, no))).toEqual(["open"]);
  });
});

describe("hubTabs - the 小說 filter", () => {
  const books = [
    { system_id: "ln", type: "輕小說" },
    { system_id: "web", type: "網路小說" },
    { system_id: "guide", type: "指南/設定集" },
    { system_id: "untyped", type: null },
  ];

  it("counts 輕小說, 小說 and 網路小說 as Yes, anything else as No", () => {
    const yes = withFilter("book", "series", "novel", "yes");
    const no = withFilter("book", "series", "novel", "no");
    expect(ids(applyView("book", "series", books, yes)).sort()).toEqual(["ln", "web"]);
    expect(ids(applyView("book", "series", books, no)).sort()).toEqual(["guide", "untyped"]);
  });
});

describe("hubTabs - the game filters", () => {
  const games = [
    { system_id: "main", game_type: "Base Game", completion_level: "Main Story" },
    { system_id: "post", game_type: "DLC", completion_level: "Post-game" },
    { system_id: "none", game_type: "DLC", completion_level: null },
  ];
  const config = hubTabConfig("game", "series");
  const level = config.filters.find((f) => f.key === "completionLevel");
  const gameType = config.filters.find((f) => f.key === "gameType");

  it("offers the levels with Post-game after the other three, then Not completed", () => {
    expect(chipOptions(level, games).map(level.optionLabel)).toEqual([
      "Main Story",
      "Main + Extras",
      "Completionist",
      "Post-game",
      "Not completed",
    ]);
  });

  it("puts an entry with no level under Not completed", () => {
    const view = withFilter("game", "series", "completionLevel", new Set([NOT_COMPLETED]));
    expect(ids(applyView("game", "series", games, view))).toEqual(["none"]);
  });

  it("narrows by the stored level string", () => {
    const view = withFilter("game", "series", "completionLevel", new Set(["Post-game"]));
    expect(ids(applyView("game", "series", games, view))).toEqual(["post"]);
  });

  it("offers the game types the list holds, in vocabulary order", () => {
    expect(chipOptions(gameType, games)).toEqual(["Base Game", "DLC"]);
  });
});

describe("hubTabs - sorts", () => {
  it("sorts by Metacritic, highest first, unscored last", () => {
    const games = [
      { system_id: "low", metacritic_score: 70 },
      { system_id: "none", metacritic_score: null },
      { system_id: "high", metacritic_score: 94 },
    ];
    const view = { ...defaultView("game", "series"), sort: "metacritic_score" };
    expect(ids(applyView("game", "series", games, view))).toEqual(["high", "low", "none"]);
  });

  it("sorts a movie by its TW date first", () => {
    const movies = [
      { system_id: "later", release_date_tw: "2024-05-01", release_date_usa: "2023-01-01" },
      { system_id: "earlier", release_date_tw: "2024-01-01", release_date_usa: "2024-12-01" },
    ];
    const view = defaultView("movie", "series");
    expect(ids(applyView("movie", "series", movies, view))).toEqual(["earlier", "later"]);
  });
});

describe("hubTabs - the sort direction", () => {
  const anime = [
    { system_id: "a", anime_name_en: "A", my_rating: "B" },
    { system_id: "b", anime_name_en: "B", my_rating: "S" },
  ];

  it("opens every tab in its sort's natural direction", () => {
    expect(defaultView("anime", "series").reversed).toBe(false);
  });

  it("runs the whole order backwards while reversed, tie-break included", () => {
    const title = { ...defaultView("anime", "series"), sort: "title" };
    expect(ids(applyView("anime", "series", anime, title))).toEqual(["a", "b"]);
    expect(ids(applyView("anime", "series", anime, { ...title, reversed: true }))).toEqual([
      "b",
      "a",
    ]);
  });

  it("offers the sorts by plain sentence-case names, the scores best first", () => {
    const options = hubSortOptions(hubTabConfig("anime", "series"), true);
    expect(options.map((o) => o.label)).toEqual(["Title", "Release date", "My rating", "MAL rating"]);
    expect(options.filter((o) => o.descending).map((o) => o.value)).toEqual([
      "my_rating",
      "mal_rating",
    ]);
    expect(hubSortOptions(hubTabConfig("anime", "series"), false).map((o) => o.value)).not.toContain(
      "my_rating",
    );
  });
});
