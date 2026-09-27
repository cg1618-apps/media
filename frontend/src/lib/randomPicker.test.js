import { applyFilterDefs, initialFilters } from "./libraryFilters";
import {
  PICKER_TYPES,
  UNKNOWN_DECADE,
  decadeOf,
  entryKey,
  generalFilterDefs,
  pickRandom,
  resolveDefaultFilters,
  statusGroupOf,
  toEntries,
  toStoredFilters,
  typeFilterDefs,
} from "./randomPicker";
import { LIBRARY_CONFIGS } from "../pages/library/configs";

// A filter state with `values` switched on for the def `key`.
function withActive(defs, key, values) {
  return { ...initialFilters(defs), [key]: new Set(values) };
}

it("offers every type that has a library, and nothing else", () => {
  expect(PICKER_TYPES.map((t) => t.type).sort()).toEqual(Object.keys(LIBRARY_CONFIGS).sort());
});

it("puts the watch, read and play vocabularies into one set of status groups", () => {
  expect(statusGroupOf("anime", { watching_status: "Active Watching" })).toBe("In Progress");
  expect(statusGroupOf("manga", { reading_status: "Passive Reading" })).toBe("In Progress");
  expect(statusGroupOf("game", { playing_status: "Play Anytime" })).toBe("In Progress");
  expect(statusGroupOf("game", { playing_status: "Play When Released" })).toBe("Planned");
  expect(statusGroupOf("novel", { reading_status: "Won't Read" })).toBe("Dropped");
  // Unset counts as "Might", as the library filters count it.
  expect(statusGroupOf("anime", {})).toBe("Might");
});

it("reads the decade from each type's primary release column", () => {
  expect(decadeOf("anime", { release_date: "2014-04" })).toBe("2010s");
  // anime-movie's primary column is release_date_jp, not release_date.
  expect(decadeOf("anime-movie", { release_date_jp: "1999" })).toBe("1990s");
  expect(decadeOf("manga", {})).toBe(UNKNOWN_DECADE);
});

describe("general mode", () => {
  // Both types populated, so a media-type or status filter has something to
  // refuse as well as something to keep.
  const entries = [
    ...toEntries("anime", [
      { system_id: "a1", watching_status: "Plan to Watch", my_rating: "A", release_date: "2014" },
      { system_id: "a2", watching_status: "Completed", release_date: "2003" },
    ]),
    ...toEntries("manga", [{ system_id: "m1", reading_status: "Plan to Read", my_rating: "S" }]),
  ];
  const defs = generalFilterDefs(["anime", "manga"]);
  const keys = (pool) => pool.map(entryKey);

  it("narrows by media type", () => {
    expect(keys(applyFilterDefs(entries, defs, withActive(defs, "mediaType", ["manga"])))).toEqual([
      "manga:m1",
    ]);
  });

  it("narrows by status group across types", () => {
    expect(keys(applyFilterDefs(entries, defs, withActive(defs, "statusGroup", ["Planned"])))).toEqual([
      "anime:a1",
      "manga:m1",
    ]);
  });

  it("counts an entry with no rating as Unrated", () => {
    expect(keys(applyFilterDefs(entries, defs, withActive(defs, "myRating", ["Unrated"])))).toEqual([
      "anime:a2",
    ]);
  });

  it("derives decades newest first, unknown last", () => {
    const decade = defs.find((d) => d.key === "decade");
    expect(decade.deriveOptions(entries)).toEqual(["2010s", "2000s", UNKNOWN_DECADE]);
  });
});

describe("one-type mode", () => {
  it("runs the type's own library filters against the entry's item", () => {
    const defs = typeFilterDefs("anime");
    expect(defs.map((d) => d.key)).toEqual([
      ...LIBRARY_CONFIGS.anime.filterDefs.map((d) => d.key),
      "myRating",
      "decade",
    ]);
    const entries = toEntries("anime", [
      { system_id: "tv", airing_type: "TV" },
      { system_id: "ova", airing_type: "OVA" },
    ]);
    const pool = applyFilterDefs(entries, defs, withActive(defs, "airingType", ["OVA"]));
    expect(pool.map(entryKey)).toEqual(["anime:ova"]);
  });

  it("derives a dynamic library filter's options from the items", () => {
    const gameType = typeFilterDefs("game").find((d) => d.key === "gameType");
    const entries = toEntries("game", [{ game_type: "RPG" }, { game_type: "ACT" }, {}]);
    expect(gameType.deriveOptions(entries)).toEqual(["ACT", "RPG"]);
  });
});

describe("pickRandom", () => {
  const pool = toEntries("anime", [{ system_id: "a" }, { system_id: "b" }, { system_id: "c" }]);

  it("draws by the random source", () => {
    expect(entryKey(pickRandom(pool, null, () => 0))).toBe("anime:a");
    expect(entryKey(pickRandom(pool, null, () => 0.99))).toBe("anime:c");
  });

  it("never repeats the previous pick while there is another", () => {
    for (const r of [0, 0.5, 0.99]) {
      expect(entryKey(pickRandom(pool, pool[0], () => r))).not.toBe("anime:a");
    }
  });

  it("repeats the only entry, and draws nothing from an empty pool", () => {
    expect(pickRandom([pool[0]], pool[0])).toBe(pool[0]);
    expect(pickRandom([])).toBeNull();
  });
});

describe("stored defaults", () => {
  it("seeds a filter state, dropping what the defs no longer offer", () => {
    const defs = typeFilterDefs("anime");
    const state = resolveDefaultFilters(defs, {
      airingType: ["TV", "Hologram"], // Hologram is not an anime airing type
      bahaOnly: true,
      decade: ["2010s"], // dynamic: kept, its options come from the data
      retiredFilter: ["x"],
    });
    expect([...state.airingType]).toEqual(["TV"]);
    expect(state.bahaOnly).toBe(true);
    expect([...state.decade]).toEqual(["2010s"]);
    expect(state).not.toHaveProperty("retiredFilter");
    expect(state.myRating.size).toBe(0);
  });

  it("seeds an empty state from nothing stored", () => {
    const defs = generalFilterDefs(["anime"]);
    expect(resolveDefaultFilters(defs, undefined)).toEqual(initialFilters(defs));
  });

  it("stores only what is on, and round-trips", () => {
    const defs = typeFilterDefs("anime");
    const stored = { airingType: ["TV", "OVA"], bahaOnly: true };
    const state = resolveDefaultFilters(defs, stored);
    expect(toStoredFilters(state)).toEqual(stored);
  });
});
