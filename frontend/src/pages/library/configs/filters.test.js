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

  it("derives each tag filter's chips from the comma-joined values", () => {
    expect(byKey("genreMain").deriveOptions(items)).toEqual(["冒險", "奇幻", "日常"].sort((a, b) => a.localeCompare(b)));
    expect(byKey("genreSub").deriveOptions(items)).toEqual(["校園", "異世界"].sort((a, b) => a.localeCompare(b)));
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

// Every media-type library has an advanced section: exclusive source first
// where the type has one, then the type's own genre and label vocabularies.
const ADVANCED_KEYS = {
  anime: ["exclusiveSource", "genreMain", "genreSub", "label"],
  "anime-movie": ["exclusiveSource", "genreMain", "genreSub", "label"],
  movie: ["exclusiveSource", "genreMain", "genreSub", "label"],
  "tv-show": ["genreMain", "genreSub", "label"],
  cartoon: ["genreMain", "genreSub", "label"],
  manga: ["genreMain", "genreSub", "label"],
  book: ["genreMain", "genreSub", "label"],
  comic: ["genreMain", "genreSub", "label"],
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

  it("keeps only the chosen release type", () => {
    const items = [
      { system_id: "c", release_type: "Cinema" },
      { system_id: "o", release_type: "ONA" },
    ];
    const kept = applyFilterDefs(items, defs, active(defs, "releaseType", ["ONA"]));
    expect(kept.map((i) => i.system_id)).toEqual(["o"]);
  });
});
