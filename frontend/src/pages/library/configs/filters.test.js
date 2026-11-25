// Frontend: the library filters' chips, their order and their hints.
//
// The watch-status filter is one def shared by every library whose status
// vocabulary is the watching one; these iterate the registry, so a watch
// library added later is held to the same order and hint.
import { describe, expect, it } from "vitest";

import { LIBRARY_CONFIGS } from "./index";
import { WATCHING_STATUS_GROUP } from "../../../config/statusGroups";
import { watchingStatusesFor } from "../../../config/fieldOptions";
import { applyFilterDefs, initialFilters } from "../../../lib/libraryFilters";

const WATCH_TYPES = Object.entries(LIBRARY_CONFIGS)
  .filter(([, config]) => config.filterDefs.some((fd) => fd.key === "watchingStatus"))
  .map(([type]) => type);

function active(defs, key, values) {
  return { ...initialFilters(defs), [key]: new Set(values) };
}

it("finds the six watch libraries", () => {
  expect(WATCH_TYPES.sort()).toEqual(
    ["anime", "anime-movie", "cartoon", "hentai", "movie", "tv-show"].sort(),
  );
});

describe.each(WATCH_TYPES)("the %s watch-status filter", (type) => {
  const def = LIBRARY_CONFIGS[type].filterDefs.find((fd) => fd.key === "watchingStatus");

  it("orders its chips might, planned, watching, completed, dropped", () => {
    expect(def.groupOptions).toEqual(["Might Watch", "Planned", "Watching", "Completed", "Dropped"]);
  });

  it("hints exactly the statuses each chip holds, in this type's vocabulary", () => {
    for (const group of def.groupOptions) {
      const statuses = watchingStatusesFor(type).filter((s) => WATCHING_STATUS_GROUP[s] === group);
      expect(statuses.length).toBeGreaterThan(0);
      const hint = def.optionHint(group);
      for (const s of statuses) expect(hint).toContain(s);
    }
    // A film offers no Watch When Airs, an airing type no Watch When Released.
    const planned = def.optionHint("Planned");
    const film = type === "movie" || type === "anime-movie";
    expect(planned.includes("Watch When Airs")).toBe(!film);
    expect(planned.includes("Watch When Released")).toBe(film);
    expect(def.optionHint("Might Watch")).toMatch(/no status/);
  });
});

it("no library offers a 動畫瘋-only toggle", () => {
  for (const config of Object.values(LIBRARY_CONFIGS)) {
    expect(config.filterDefs.map((fd) => fd.key)).not.toContain("bahaOnly");
  }
});

describe("the anime library filters", () => {
  const defs = LIBRARY_CONFIGS.anime.filterDefs;
  const byKey = (key) => defs.find((fd) => fd.key === key);

  it("offers OAD after OVA", () => {
    expect(byKey("airingType").options).toEqual(["TV", "Movie", "ONA", "OVA", "OAD", "Special"]);
  });

  it("orders airing status not yet, airing, finished, canceled", () => {
    expect(byKey("airingStatus").options).toEqual([
      "Not Yet Aired",
      "Airing",
      "Finished Airing",
      "Canceled",
    ]);
  });

  it("keeps airing type, airing status and watch status in the ordinary section", () => {
    expect(defs.filter((fd) => !fd.advanced).map((fd) => fd.key)).toEqual([
      "airingType",
      "airingStatus",
      "watchingStatus",
    ]);
  });

  const items = [
    { system_id: "a", genre_main: "奇幻, 冒險", genre_sub: "異世界", label: "會跳OP", exclusive_source: "Netflix" },
    { system_id: "b", genre_main: "日常", genre_sub: "", label: null, exclusive_source: null },
    { system_id: "c", genre_main: "冒險", genre_sub: "校園, 異世界", label: "很多福利, 會跳OP" },
  ];

  // Most-carried first: 冒險 and 異世界 are on two entries each.
  it("derives each tag filter's chips from the comma-joined values, most-carried first", () => {
    expect(byKey("genreMain").deriveOptions(items)).toEqual(["冒險", ...["奇幻", "日常"].sort((a, b) => a.localeCompare(b))]);
    expect(byKey("genreSub").deriveOptions(items)).toEqual(["異世界", "校園"]);
    expect(byKey("label").deriveOptions(items)).toEqual(["會跳OP", "很多福利"]);
    expect(byKey("exclusiveSource").deriveOptions(items)).toEqual(["Netflix"]);
  });

  it("matches an entry carrying any chosen value", () => {
    const pick = (key, values) =>
      applyFilterDefs(items, defs, active(defs, key, values)).map((i) => i.system_id);
    expect(pick("genreMain", ["冒險"])).toEqual(["a", "c"]);
    expect(pick("genreSub", ["校園"])).toEqual(["c"]);
    expect(pick("label", ["會跳OP"])).toEqual(["a", "c"]);
    expect(pick("exclusiveSource", ["Netflix"])).toEqual(["a"]);
  });
});

// Every media-type library has an advanced section: exclusive source (or a
// TV show's original source) first where the type has one, then the type's
// own genre and label vocabularies, which always close the section.
const ADVANCED_KEYS = {
  anime: ["exclusiveSource", "genreMain", "genreSub", "label"],
  "anime-movie": ["exclusiveSource", "genreMain", "genreSub", "label"],
  movie: ["exclusiveSource", "genreMain", "genreSub", "label"],
  "tv-show": ["originalSource", "genreMain", "genreSub", "label"],
  cartoon: ["genreMain", "genreSub", "label"],
  manga: ["genreMain", "genreSub", "label"],
  book: ["genreMain", "genreSub", "label"],
  comic: ["genreMain", "genreSub", "label", "era", "events"],
  game: ["gameGenre", "gameTheme", "label"],
  "h-game": ["gameGenre", "gameTheme", "hGenrePlot", "hGenreAppearance", "hGenreRelation"],
  "h-comic": ["hGenrePlot", "hGenreAppearance", "hGenreRelation"],
  hentai: ["hGenrePlot", "hGenreAppearance", "hGenreRelation"],
};

it("names an advanced section for every library", () => {
  expect(Object.keys(ADVANCED_KEYS).sort()).toEqual(Object.keys(LIBRARY_CONFIGS).sort());
});

describe.each(Object.entries(ADVANCED_KEYS))("the %s advanced section", (type, keys) => {
  const defs = LIBRARY_CONFIGS[type].filterDefs;

  it("holds exactly its tag filters, after every ordinary filter", () => {
    expect(defs.filter((fd) => fd.advanced).map((fd) => fd.key)).toEqual(keys);
    const firstAdvanced = defs.findIndex((fd) => fd.advanced);
    expect(defs.slice(firstAdvanced).every((fd) => fd.advanced)).toBe(true);
  });

  // The one exception is comic, whose Era and Event filters follow its
  // genres, at the owner's choice.
  it("puts the genre-related filters at the bottom", () => {
    const GENRE_KEYS = new Set([
      "genreMain", "genreSub", "label", "gameGenre", "gameTheme",
      "hGenrePlot", "hGenreAppearance", "hGenreRelation",
    ]);
    const AFTER_GENRES = { comic: ["era", "events"] };
    const advanced = defs
      .filter((fd) => fd.advanced)
      .map((fd) => fd.key)
      .filter((k) => !(AFTER_GENRES[type] || []).includes(k));
    const firstGenre = advanced.findIndex((k) => GENRE_KEYS.has(k));
    expect(firstGenre).toBeGreaterThan(-1);
    expect(advanced.slice(firstGenre).every((k) => GENRE_KEYS.has(k))).toBe(true);
  });

  it("keeps the advanced filters catalogue, not personal", () => {
    for (const fd of defs.filter((d) => d.advanced)) expect(fd.personal).toBeFalsy();
  });
});

it("reads a movie's exclusive source from original_source", () => {
  const defs = LIBRARY_CONFIGS.movie.filterDefs;
  const items = [
    { system_id: "m1", original_source: "Netflix, Disney+" },
    { system_id: "m2", original_source: null },
  ];
  const kept = applyFilterDefs(items, defs, active(defs, "exclusiveSource", ["Disney+"]));
  expect(kept.map((i) => i.system_id)).toEqual(["m1"]);
});

describe("the anime movie release type filter", () => {
  const defs = LIBRARY_CONFIGS["anime-movie"].filterDefs;
  const def = defs.find((fd) => fd.key === "releaseType");

  it("is an ordinary filter with the vocabulary's chips in order", () => {
    expect(def.advanced).toBeFalsy();
    expect(def.options).toEqual(["Cinema", "ONA"]);
  });

  it("sits directly below Watch Status", () => {
    const keys = defs.map((fd) => fd.key);
    expect(keys.indexOf("releaseType")).toBe(keys.indexOf("watchingStatus") + 1);
  });

  it("keeps only the chosen release type", () => {
    const items = [
      { system_id: "c", release_type: "Cinema" },
      { system_id: "o", release_type: "ONA" },
    ];
    const kept = applyFilterDefs(items, defs, active(defs, "releaseType", ["ONA"]));
    expect(kept.map((i) => i.system_id)).toEqual(["o"]);
  });
});

// Every airing library's Airing Status chips run in the order a title moves
// through them: not yet, airing, finished, then canceled.
describe.each(["anime", "tv-show", "cartoon", "hentai"])("the %s airing-status filter", (type) => {
  const def = LIBRARY_CONFIGS[type].filterDefs.find((fd) => fd.key === "airingStatus");
  const ORDER = ["Not Yet Aired", "Airing", "Finished Airing", "Canceled"];

  it("orders its chips not yet, airing, finished, canceled", () => {
    const options =
      def.type === "set-dynamic"
        ? // Fed every status in reverse, so an alphabetical or as-found order fails.
          def.deriveOptions([...ORDER].reverse().map((airing_status) => ({ airing_status })))
        : def.options;
    expect(options).toEqual(ORDER);
  });
});

// A TV show's Original Source is a multi-value tag field, served under its
// sheet header source_official; Airing Type offers TV first, and shares a
// row with Region, drawn to its left.
describe("the TV show library's filters", () => {
  const defs = LIBRARY_CONFIGS["tv-show"].filterDefs;
  const byKey = (key) => defs.find((fd) => fd.key === key);

  it("filters by original source, any chosen value", () => {
    const items = [
      { system_id: "t1", source_official: "Netflix, HBO" },
      { system_id: "t2", source_official: "HBO" },
      { system_id: "t3", source_official: null },
    ];
    expect(byKey("originalSource").label).toBe("Original Source");
    expect(byKey("originalSource").deriveOptions(items)).toEqual(["HBO", "Netflix"]);
    const picked = applyFilterDefs(items, defs, active(defs, "originalSource", ["Netflix"]));
    expect(picked.map((i) => i.system_id)).toEqual(["t1"]);
  });

  it("offers Airing Type with TV first, on Region's row and left of it", () => {
    const airing = byKey("airingType");
    expect(airing.options[0]).toBe("TV");
    expect(airing.options).toContain("Special");
    const keys = defs.map((fd) => fd.key);
    expect(keys.indexOf("region")).toBe(keys.indexOf("airingType") + 1);
    expect(airing.row).toBeTruthy();
    expect(byKey("region").row).toBe(airing.row);
    const items = [
      { system_id: "a", airing_type: "TV" },
      { system_id: "b", airing_type: "Special" },
    ];
    expect(applyFilterDefs(items, defs, active(defs, "airingType", ["Special"])).map((i) => i.system_id)).toEqual(["b"]);
  });
});

it("offers a cartoon's Airing Type in the order TV, Movie, Special", () => {
  const def = LIBRARY_CONFIGS.cartoon.filterDefs.find((fd) => fd.key === "airingType");
  expect(def.options).toEqual(["TV", "Movie", "Special"]);
});

it("filters a comic by era and by any of its events, most-carried first", () => {
  const defs = LIBRARY_CONFIGS.comic.filterDefs;
  const byKey = (key) => defs.find((fd) => fd.key === key);
  const items = [
    { system_id: "a", era: "Modern", events: "Civil War, Secret Wars" },
    { system_id: "b", era: "Silver", events: "Secret Wars" },
    { system_id: "c", era: "Modern", events: null },
  ];
  expect(byKey("era").advanced).toBe(true);
  expect(byKey("events").advanced).toBe(true);
  expect(byKey("era").deriveOptions(items)).toEqual(["Modern", "Silver"]);
  expect(byKey("events").deriveOptions(items)).toEqual(["Secret Wars", "Civil War"]);
  expect(applyFilterDefs(items, defs, active(defs, "events", ["Civil War"])).map((i) => i.system_id)).toEqual(["a"]);
});
