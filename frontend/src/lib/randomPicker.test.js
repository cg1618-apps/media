import { applyFilterDefs, initialFilters } from "./libraryFilters";
import {
  FRANCHISE_MODE,
  NO_SCORE,
  PICKER_LAYOUTS,
  PICKER_MODES,
  PICKER_TYPES,
  UNKNOWN_DECADE,
  decadeOf,
  entryKey,
  filterDefsForMode,
  franchiseFilterDefs,
  hasPlanMark,
  isWeightedMode,
  resolveDefaultFilters,
  statusGroupOf,
  toEntries,
  toFranchiseEntries,
  toStoredFilters,
  typeFilterDefs,
  withPlanMarks,
} from "./randomPicker";
import { LIBRARY_CONFIGS } from "../pages/library/configs";
import { TV_REGIONS, GAME_RELEASE_STATUSES } from "../config/fieldOptions";

// A filter state with `values` switched on for the def `key`.
function withActive(defs, key, values) {
  return { ...initialFilters(defs), [key]: new Set(values) };
}

const keys = (type) => typeFilterDefs(type).map((fd) => fd.key);
const byKey = (type, key) => typeFilterDefs(type).find((fd) => fd.key === key);

it("offers every type that has a library, and nothing else", () => {
  expect(PICKER_TYPES.map((t) => t.type).sort()).toEqual(Object.keys(LIBRARY_CONFIGS).sort());
});

it("orders its modes franchise first, then the mainstream types, then the gated ones", () => {
  expect(PICKER_MODES).toEqual([
    FRANCHISE_MODE,
    "anime",
    "anime-movie",
    "movie",
    "tv-show",
    "cartoon",
    "manga",
    "book",
    "comic",
    "game",
    "hentai",
    "h-comic",
    "h-game",
  ]);
  expect(PICKER_MODES).not.toContain("all");
});

it("puts the watch, read and play vocabularies into one set of status groups", () => {
  expect(statusGroupOf("anime", { watching_status: "Active Watching" })).toBe("In Progress");
  expect(statusGroupOf("manga", { reading_status: "Passive Reading" })).toBe("In Progress");
  expect(statusGroupOf("game", { playing_status: "Play Anytime" })).toBe("In Progress");
  expect(statusGroupOf("game", { playing_status: "Play When Released" })).toBe("Planned");
  expect(statusGroupOf("book", { reading_status: "Won't Read" })).toBe("Dropped");
  // Paused and Temp Dropped are Stopped, apart from Dropped.
  expect(statusGroupOf("anime", { watching_status: "Paused" })).toBe("Stopped");
  expect(statusGroupOf("manga", { reading_status: "Temp Dropped" })).toBe("Stopped");
  expect(statusGroupOf("game", { playing_status: "Temp Dropped" })).toBe("Stopped");
  // Unset counts as "Might", as the library filters count it.
  expect(statusGroupOf("anime", {})).toBe("Might");
});

it("reads the decade from each type's primary release column", () => {
  expect(decadeOf("anime", { release_date_jp: "2014-04" })).toBe("2010s");
  // anime-movie's primary column is release_date_jp, not release_date.
  expect(decadeOf("anime-movie", { release_date_jp: "1999" })).toBe("1990s");
  expect(decadeOf("manga", {})).toBe(UNKNOWN_DECADE);
});

describe("one-type layouts", () => {
  it("builds every type's layout from defs that exist", () => {
    for (const { type } of PICKER_TYPES) {
      expect(() => typeFilterDefs(type)).not.toThrow();
      expect(keys(type)).toEqual(PICKER_LAYOUTS[type].map(([key]) => key));
    }
  });

  it("has no advanced section", () => {
    for (const { type } of PICKER_TYPES) {
      expect(typeFilterDefs(type).filter((fd) => fd.advanced)).toEqual([]);
    }
  });

  it("orders anime source, type, status, decade, scores, rating, status, plan, genres", () => {
    expect(keys("anime")).toEqual([
      "exclusiveSource",
      "airingType",
      "airingStatus",
      "decade",
      "malScore",
      "anilistScore",
      "myRating",
      "watchingStatus",
      "doNext",
      "redo",
      "genreMain",
      "genreSub",
      "label",
    ]);
  });

  it("puts a TV show's Region to the right of Airing Type, with the form's vocabulary", () => {
    const defs = typeFilterDefs("tv-show");
    expect(defs.slice(0, 2).map((fd) => [fd.key, fd.row])).toEqual([
      ["airingType", "kind"],
      ["region", "kind"],
    ]);
    expect(defs[1].options).toEqual(TV_REGIONS);
  });

  it("gives a game its Exclusive Source, every release status, and Ownership beside Play Status", () => {
    expect(keys("game")).toEqual([
      "exclusiveSource",
      "gameType",
      "releaseStatus",
      "decade",
      "metacriticScore",
      "metacriticUserScore",
      "myRating",
      "playingStatus",
      "ownership",
      "doNext",
      "redo",
      "gameMode",
      "combatMode",
      "gamePlatform",
      "gameGenre",
      "gameTheme",
      "label",
    ]);
    expect(byKey("game", "releaseStatus").options).toEqual(GAME_RELEASE_STATUSES);
    expect(byKey("game", "playingStatus").row).toBe(byKey("game", "ownership").row);
    const entries = toEntries("game", [
      { system_id: "g1", exclusive_platform: "Nintendo" },
      { system_id: "g2", exclusive_platform: null },
    ]);
    const defs = typeFilterDefs("game");
    expect(
      applyFilterDefs(entries, defs, withActive(defs, "exclusiveSource", ["Nintendo"])).map(
        (e) => e.item.system_id,
      ),
    ).toEqual(["g1"]);
  });

  it("ends the gated types on their own adult genres", () => {
    expect(keys("hentai").slice(-3)).toEqual(["hGenrePlot", "hGenreAppearance", "hGenreRelation"]);
    expect(keys("h-comic").slice(-3)).toEqual(["hGenrePlot", "hGenreAppearance", "hGenreRelation"]);
    expect(keys("h-game").slice(-5)).toEqual([
      "gameGenre",
      "gameTheme",
      "hGenrePlot",
      "hGenreAppearance",
      "hGenreRelation",
    ]);
  });

  it("runs a library filter against the entry's item", () => {
    const entries = toEntries("anime", [
      { system_id: "a1", airing_type: "TV" },
      { system_id: "a2", airing_type: "Movie" },
    ]);
    const defs = typeFilterDefs("anime");
    expect(
      applyFilterDefs(entries, defs, withActive(defs, "airingType", ["TV"])).map(
        (e) => e.item.system_id,
      ),
    ).toEqual(["a1"]);
  });

  it("narrows by the Stopped status group", () => {
    const entries = toEntries("anime", [
      { system_id: "p", watching_status: "Paused" },
      { system_id: "t", watching_status: "Temp Dropped" },
      { system_id: "d", watching_status: "Dropped" },
    ]);
    const defs = typeFilterDefs("anime");
    expect(
      applyFilterDefs(entries, defs, withActive(defs, "watchingStatus", ["Stopped"])).map(
        (e) => e.item.system_id,
      ),
    ).toEqual(["p", "t"]);
  });
});

describe("external scores", () => {
  const ids = (type, key, values, items) => {
    const defs = typeFilterDefs(type);
    return applyFilterDefs(toEntries(type, items), defs, withActive(defs, key, values)).map(
      (e) => e.item.system_id,
    );
  };

  it("offers 9+ to 5+, <5 and No score out of 10", () => {
    expect(byKey("anime", "malScore").options).toEqual(["9+", "8+", "7+", "6+", "5+", "<5", NO_SCORE]);
    expect(byKey("movie", "imdbScore").options).toEqual(["9+", "8+", "7+", "6+", "5+", "<5", NO_SCORE]);
  });

  it("gives anime, anime movie, manga and book an AniList score, read out of 10", () => {
    for (const type of ["anime", "anime-movie", "manga", "book"]) {
      expect(keys(type)).toContain("anilistScore");
    }
    const items = [
      { system_id: "hi", anilist_rating: 85 },
      { system_id: "lo", anilist_rating: 42 },
      { system_id: "none", anilist_rating: null },
    ];
    expect(ids("anime", "anilistScore", ["8+"], items)).toEqual(["hi"]);
    expect(ids("anime", "anilistScore", ["<5"], items)).toEqual(["lo"]);
    expect(ids("anime", "anilistScore", [NO_SCORE], items)).toEqual(["none"]);
  });

  it("reads IMDb's N/A as No score and keeps the lower of two minimums", () => {
    const items = [
      { system_id: "a", imdb_rating: "8.4" },
      { system_id: "b", imdb_rating: "6.2" },
      { system_id: "c", imdb_rating: "N/A" },
    ];
    expect(ids("movie", "imdbScore", ["8+", "6+"], items)).toEqual(["a", "b"]);
    expect(ids("movie", "imdbScore", [NO_SCORE], items)).toEqual(["c"]);
  });

  it("reads both Metacritic scores out of 100", () => {
    const options = ["90+", "80+", "70+", "60+", "50+", "<50", NO_SCORE];
    expect(byKey("game", "metacriticScore").options).toEqual(options);
    expect(byKey("game", "metacriticUserScore").options).toEqual(options);
    const items = [
      { system_id: "a", metacritic_score: 92, metacritic_user_score: 8.1 },
      { system_id: "b", metacritic_score: 45, metacritic_user_score: 4.2 },
    ];
    expect(ids("game", "metacriticScore", ["90+"], items)).toEqual(["a"]);
    expect(ids("game", "metacriticUserScore", ["80+"], items)).toEqual(["a"]);
    expect(ids("game", "metacriticUserScore", ["<50"], items)).toEqual(["b"]);
  });

  it("are catalogue filters, offered without a list", () => {
    const defs = filterDefsForMode("game", { personal: false }).map((fd) => fd.key);
    expect(defs).toEqual(expect.arrayContaining(["metacriticScore", "metacriticUserScore"]));
  });
});

describe("Do Next and Redo", () => {
  const marks = new Set(["next:anime:s1", "rewatch:anime:f1"]);
  const entries = withPlanMarks(
    toEntries("anime", [
      { system_id: "a", watch_next: true },
      { system_id: "b", series_id: "s1" },
      { system_id: "c", franchise_id: "f1" },
      { system_id: "d" },
    ]),
    marks,
  );
  const defs = typeFilterDefs("anime");
  const ids = (key, values) =>
    applyFilterDefs(entries, defs, withActive(defs, key, values)).map((e) => e.item.system_id);

  it("reads a mark on the entry, its series or its franchise", () => {
    expect(hasPlanMark(entries[1], "next", marks)).toBe(true);
    expect(hasPlanMark(entries[3], "next", marks)).toBe(false);
  });

  it("narrows to what is, or is not, marked", () => {
    expect(ids("doNext", ["Do next"])).toEqual(["a", "b"]);
    expect(ids("doNext", ["Not do next"])).toEqual(["c", "d"]);
    expect(ids("redo", ["To redo"])).toEqual(["c"]);
    expect(ids("redo", ["Not to redo"])).toEqual(["a", "b", "d"]);
  });

  it("sit side by side, and are personal", () => {
    expect(byKey("anime", "doNext").row).toBe(byKey("anime", "redo").row);
    expect(byKey("anime", "doNext").personal).toBe(true);
    expect(byKey("anime", "redo").personal).toBe(true);
  });
});

describe("stored defaults", () => {
  it("seeds a filter state, dropping what the defs no longer offer", () => {
    const defs = typeFilterDefs("anime");
    const state = resolveDefaultFilters(defs, {
      airingType: ["TV", "Hologram"], // Hologram is not an anime airing type
      bahaOnly: true, // the retired 動畫瘋-only toggle, still in an old row
      decade: ["2010s"], // dynamic: kept, its options come from the data
      retiredFilter: ["x"],
    });
    expect([...state.airingType]).toEqual(["TV"]);
    expect(state).not.toHaveProperty("bahaOnly");
    expect([...state.decade]).toEqual(["2010s"]);
    expect(state).not.toHaveProperty("retiredFilter");
    expect(state.myRating.size).toBe(0);
  });

  it("seeds an empty state from nothing stored", () => {
    const defs = typeFilterDefs("anime");
    expect(resolveDefaultFilters(defs, undefined)).toEqual(initialFilters(defs));
  });

  it("stores only what is on, and round-trips", () => {
    const defs = typeFilterDefs("anime");
    const stored = { airingType: ["TV", "OVA"], airingStatus: ["Airing"] };
    const state = resolveDefaultFilters(defs, stored);
    expect(toStoredFilters(state)).toEqual(stored);
  });
});

describe("franchise mode", () => {
  const franchises = [
    { system_id: "f1", franchise_type: "Anime", franchise_expectation: "High", my_rating: "A" },
    { system_id: "f2", franchise_type: "Movie, TV", franchise_expectation: "Low" },
    { system_id: "f3", franchise_type: "Book, Game, Anime Movie" },
  ];
  const lists = {
    anime: [{ system_id: "a1", franchise_id: "f1" }],
    movie: [{ system_id: "m1", franchise_id: "f2" }],
  };
  const entries = toFranchiseEntries(franchises, lists);
  const defs = franchiseFilterDefs();
  const ids = (filters) => applyFilterDefs(entries, defs, filters).map((e) => e.item.system_id);

  it("leads the modes and draws unweighted", () => {
    expect(PICKER_MODES[0]).toBe(FRANCHISE_MODE);
    expect(isWeightedMode(FRANCHISE_MODE)).toBe(false);
    expect(isWeightedMode("anime")).toBe(true);
  });

  it("filters on franchise type, my rating and expectation, in that order", () => {
    expect(defs.map((fd) => fd.key)).toEqual(["franchiseType", "myRating", "expectation"]);
  });

  it("wraps every franchise as an entry keyed apart from media entries", () => {
    expect(entryKey(entries[0])).toBe("franchise:f1");
  });

  it("orders franchise types as the mode strip orders the types", () => {
    const typeDef = defs[0];
    expect(typeDef.deriveOptions(entries)).toEqual([
      "Anime",
      "Anime Movie",
      "Movie",
      "TV",
      "Book",
      "Game",
    ]);
  });

  it("filters on the franchise type, each of a multi-type franchise counting", () => {
    expect(ids(withActive(defs, "franchiseType", ["TV"]))).toEqual(["f2"]);
  });

  it("filters on expectation and on my rating", () => {
    expect(ids(withActive(defs, "expectation", ["High"]))).toEqual(["f1"]);
    expect(ids(withActive(defs, "myRating", ["A"]))).toEqual(["f1"]);
  });
});

describe("personal filters", () => {
  it("drops exactly the flagged defs without a list, in every mode", () => {
    for (const mode of PICKER_MODES) {
      const all = filterDefsForMode(mode);
      const without = filterDefsForMode(mode, { personal: false });
      expect(without.map((fd) => fd.key)).toEqual(
        all.filter((fd) => !fd.personal).map((fd) => fd.key),
      );
    }
  });

  it("flags every def that reads the viewer's own list", () => {
    const personal = filterDefsForMode("game")
      .filter((fd) => fd.personal)
      .map((fd) => fd.key);
    expect(personal).toEqual(["myRating", "playingStatus", "ownership", "doNext", "redo"]);
    expect(
      franchiseFilterDefs()
        .filter((fd) => fd.personal)
        .map((fd) => fd.key),
    ).toEqual(["myRating", "expectation"]);
  });
});

// A range filter round-trips through the stored defaults as { min, max },
// and an empty one is not stored at all.
describe("stored range filters", () => {
  const defs = [{ key: "runtime", label: "Runtime", type: "range", match: () => true }];
  it("stores only a set range, and restores it", () => {
    expect(toStoredFilters({ runtime: { min: "", max: "" } })).toEqual({});
    expect(toStoredFilters({ runtime: { min: "20", max: "" } })).toEqual({ runtime: { min: "20", max: "" } });
    expect(resolveDefaultFilters(defs, { runtime: { min: "20", max: "" } }).runtime).toEqual({ min: "20", max: "" });
    expect(resolveDefaultFilters(defs, {}).runtime).toEqual({ min: "", max: "" });
  });
});
