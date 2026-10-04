// The entity library FilterDefs: what each group offers, how a row matches,
// that a gated type the session cannot see is never named, and the default
// every entity library opens on.
import { describe, expect, it } from "vitest";

import { applyFilterDefs, initialFilters } from "./libraryFilters";
import {
  COUNTRY_NOT_SET,
  GENDER_NOT_SET,
  NO_ENTRIES,
  ROLE_NOT_SET,
  TAGS_NOT_SET,
  UNRATED,
  characterFilterDefs,
  defaultEntityFilters,
  personFilterDefs,
  publisherFilterDefs,
  studioFilterDefs,
} from "./entityFilters";

const SEES_ALL = { visibleGatedTypes: ["h-comic", "h-game", "hentai"] };
const SEES_NONE = { visibleGatedTypes: [] };

function def(defs, key) {
  return defs.find((fd) => fd.key === key);
}

function filtered(defs, rows, picks) {
  const filters = initialFilters(defs);
  for (const [key, values] of Object.entries(picks)) filters[key] = new Set(values);
  return applyFilterDefs(rows, defs, filters).map((r) => r.id);
}

describe("characterFilterDefs", () => {
  it("offers the four cast types, with h-comic and hentai under Restricted", () => {
    const mediaType = def(characterFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual(["anime", "anime-movie", "manga", "novel", NO_ENTRIES]);
    expect(mediaType.parent).toEqual({
      label: "Restricted",
      children: ["h-comic", "hentai"],
    });
  });

  it("drops the Restricted parent for a session that sees no gated type", () => {
    expect(def(characterFilterDefs(SEES_NONE), "mediaType").parent).toBeUndefined();
    expect(def(characterFilterDefs(null), "mediaType").parent).toBeUndefined();
  });

  it("keeps only the gated children the session may see", () => {
    const mediaType = def(
      characterFilterDefs({ visibleGatedTypes: ["hentai"] }),
      "mediaType",
    );
    expect(mediaType.parent.children).toEqual(["hentai"]);
  });

  const ROWS = [
    { id: "a", media_types: ["anime", "manga"], my_rating: "S", gender: "女" },
    { id: "b", media_types: ["hentai"], my_rating: null, gender: null },
    { id: "c", media_types: [], my_rating: "B", gender: "男" },
  ];

  it("ORs inside a group and ANDs across groups", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(filtered(defs, ROWS, { mediaType: ["manga", "hentai"] })).toEqual(["a", "b"]);
    expect(
      filtered(defs, ROWS, { mediaType: ["manga", "hentai"], myRating: ["S"] }),
    ).toEqual(["a"]);
  });

  it("matches an unset rating as Unrated and an unset gender as Not set", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(filtered(defs, ROWS, { myRating: [UNRATED] })).toEqual(["b"]);
    expect(filtered(defs, ROWS, { gender: [GENDER_NOT_SET] })).toEqual(["b"]);
    expect(filtered(defs, ROWS, { gender: ["男"] })).toEqual(["c"]);
  });

  // The character's own role field - a casting's role never enters into it.
  it("filters by the character's own role, with Not set for null, ANDed with the rest", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "role").options).toEqual([
      "Main", "Core", "Supporting", "Other", ROLE_NOT_SET,
    ]);
    const rows = [
      { id: "m", role: "Main", my_rating: "S", castings: [{ role: "Other" }] },
      { id: "o", role: "Other", my_rating: null },
      { id: "n", role: null, my_rating: "S" },
    ];
    expect(filtered(defs, rows, { role: ["Other"] })).toEqual(["o"]);
    expect(filtered(defs, rows, { role: ["Main", ROLE_NOT_SET] })).toEqual(["m", "n"]);
    expect(filtered(defs, rows, { role: ["Main", ROLE_NOT_SET], myRating: ["S"] })).toEqual([
      "m",
      "n",
    ]);
    expect(filtered(defs, rows, { role: [ROLE_NOT_SET], myRating: [UNRATED] })).toEqual([]);
  });

  it("gives people no Role group - a person's roles are the Type group", () => {
    expect(def(personFilterDefs(SEES_ALL), "role").label).toBe("Type");
  });

  it("offers every rating plus Unrated, and every gender plus Not set", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "myRating").options).toEqual([
      "S", "A+", "A", "B", "C", "D", "E", "F", UNRATED,
    ]);
    expect(def(defs, "gender").options).toEqual([
      "男", "女", "中性/無性", "雙性混和", "其他", GENDER_NOT_SET,
    ]);
  });
});

describe("characterFilterDefs appearance and trait", () => {
  const ROWS = [
    { id: "a", appearance: ["Red Hair", "Glasses"], trait: ["Kuudere"] },
    { id: "b", appearance: ["Glasses"], trait: [] },
    { id: "c", appearance: [], trait: ["Tsundere", "Kuudere"] },
    { id: "d" },
  ];

  it("offers the values the rows hold, sorted, plus Not set for an empty list", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "appearance").type).toBe("set-dynamic");
    expect(def(defs, "appearance").deriveOptions(ROWS)).toEqual([
      "Glasses", "Red Hair", TAGS_NOT_SET,
    ]);
    expect(def(defs, "trait").deriveOptions(ROWS)).toEqual([
      "Kuudere", "Tsundere", TAGS_NOT_SET,
    ]);
  });

  it("offers no Not set when every row holds a value", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "trait").deriveOptions(ROWS.slice(0, 1))).toEqual(["Kuudere"]);
  });

  it("matches a row holding any ticked value", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(filtered(defs, ROWS, { appearance: ["Red Hair"] })).toEqual(["a"]);
    expect(filtered(defs, ROWS, { appearance: ["Red Hair", "Glasses"] })).toEqual(["a", "b"]);
    expect(filtered(defs, ROWS, { trait: ["Kuudere"] })).toEqual(["a", "c"]);
  });

  it("matches an empty or missing list only under Not set", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(filtered(defs, ROWS, { appearance: [TAGS_NOT_SET] })).toEqual(["c", "d"]);
    expect(filtered(defs, ROWS, { trait: [TAGS_NOT_SET, "Tsundere"] })).toEqual(["b", "c", "d"]);
  });

  it("ANDs the two lists with each other", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(
      filtered(defs, ROWS, { appearance: ["Glasses"], trait: ["Kuudere"] }),
    ).toEqual(["a"]);
  });
});

describe("personFilterDefs", () => {
  it("offers every non-gated type, with all three gated types under Restricted", () => {
    const mediaType = def(personFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual([
      "anime", "anime-movie", "movie", "tv-show", "cartoon",
      "manga", "novel", "comic", "game", NO_ENTRIES,
    ]);
    expect(mediaType.parent.children).toEqual(["h-comic", "hentai", "h-game"]);
  });

  it("filters by the roles a person holds, as a chip group", () => {
    const defs = personFilterDefs(SEES_ALL);
    const rows = [
      { id: "d", roles: [{ role: "director", scope: "anime" }] },
      { id: "w", roles: [{ role: "author", scope: "manga" }] },
      { id: "n", roles: [] },
    ];
    expect(filtered(defs, rows, { role: ["author"] })).toEqual(["w"]);
    expect(filtered(defs, rows, { role: ["author", "director"] })).toEqual(["d", "w"]);
    expect(def(defs, "role").optionLabel("composer")).toBe("Music / Composer");
  });

  // Club is a person type scoped to h-comic only; a session that cannot see
  // h-comic is not told it exists.
  it("offers the Club type only to a session that sees h-comic", () => {
    expect(def(personFilterDefs(SEES_ALL), "role").options).toContain("club");
    expect(def(personFilterDefs(SEES_NONE), "role").options).not.toContain("club");
  });
});

describe("the No entries chip", () => {
  it("matches a row with no media types, and only that row", () => {
    const defs = characterFilterDefs(SEES_ALL);
    const rows = [
      { id: "none", media_types: [] },
      { id: "missing" },
      { id: "anime", media_types: ["anime"] },
    ];
    expect(filtered(defs, rows, { mediaType: [NO_ENTRIES] })).toEqual(["none", "missing"]);
    expect(def(defs, "mediaType").optionLabel(NO_ENTRIES)).toBe("No entries");
    expect(def(defs, "mediaType").optionLabel("anime-movie")).toBe("Anime Movie");
  });
});

describe("defaultEntityFilters", () => {
  const ROWS = [
    { id: "plain", media_types: ["anime"] },
    { id: "mixed", media_types: ["anime", "hentai"] },
    { id: "gated", media_types: ["hentai"] },
    { id: "new", media_types: [] },
  ];

  it("selects every non-restricted type and No entries, and nothing else", () => {
    const defs = personFilterDefs(SEES_ALL);
    const filters = defaultEntityFilters(defs);
    expect([...filters.mediaType]).toEqual([
      "anime", "anime-movie", "movie", "tv-show", "cartoon",
      "manga", "novel", "comic", "game", NO_ENTRIES,
    ]);
    expect(filters.role.size).toBe(0);
    expect(filters.myRating.size).toBe(0);
    expect(filters.gender.size).toBe(0);
  });

  // The Restricted children exist here (SEES_ALL), so the default has
  // something to leave out: a session that sees no gated type would pass
  // this vacuously.
  it("hides a restricted-only row and keeps a mixed or entry-less one", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "mediaType").parent.children).toContain("hentai");
    const filters = defaultEntityFilters(defs);
    expect(applyFilterDefs(ROWS, defs, filters).map((r) => r.id)).toEqual([
      "plain", "mixed", "new",
    ]);
    filters.mediaType.add("hentai");
    expect(applyFilterDefs(ROWS, defs, filters).map((r) => r.id)).toEqual([
      "plain", "mixed", "gated", "new",
    ]);
  });
});

describe("personFilterDefs with a role", () => {
  it("drops the Type group - every row already holds the role", () => {
    const keys = personFilterDefs(SEES_ALL, "seiyuu").map((fd) => fd.key);
    expect(keys).toEqual(["mediaType", "myRating", "gender"]);
  });
});

describe("studioFilterDefs", () => {
  it("offers the studio's credit types, with hentai and h-game under Restricted", () => {
    const mediaType = def(studioFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual(["anime", "anime-movie", "game", NO_ENTRIES]);
    expect(mediaType.parent.children).toEqual(["hentai", "h-game"]);
    expect(def(studioFilterDefs(SEES_NONE), "mediaType").parent).toBeUndefined();
  });

  it("derives the countries on record, with Not set only when a row has none", () => {
    const country = def(studioFilterDefs(SEES_ALL), "country");
    expect(country.type).toBe("set-dynamic");
    expect(
      country.deriveOptions([{ country: "Japan" }, { country: "China" }, { country: "Japan" }]),
    ).toEqual(["China", "Japan"]);
    expect(country.deriveOptions([{ country: "Japan" }, { country: null }])).toEqual([
      "Japan", COUNTRY_NOT_SET,
    ]);
  });

  it("filters by country and rating, ANDed", () => {
    const defs = studioFilterDefs(SEES_ALL);
    const rows = [
      { id: "jp", country: "Japan", my_rating: "S" },
      { id: "cn", country: "China", my_rating: null },
      { id: "unknown", country: null, my_rating: "S" },
    ];
    expect(filtered(defs, rows, { country: ["Japan", COUNTRY_NOT_SET] })).toEqual([
      "jp", "unknown",
    ]);
    expect(filtered(defs, rows, { country: [COUNTRY_NOT_SET], myRating: ["S"] })).toEqual([
      "unknown",
    ]);
    expect(filtered(defs, rows, { myRating: [UNRATED] })).toEqual(["cn"]);
  });
});

describe("publisherFilterDefs", () => {
  it("offers the six publisher types and no Restricted parent", () => {
    const mediaType = def(publisherFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual([
      "anime", "anime-movie", "manga", "novel", "comic", "game", NO_ENTRIES,
    ]);
    expect(mediaType.parent).toBeUndefined();
  });

  it("matches the types it is credited on OR offered on", () => {
    const defs = publisherFilterDefs(SEES_ALL);
    const rows = [
      { id: "credited", media_types: ["manga"], scopes: [] },
      { id: "offered", media_types: [], scopes: ["manga"] },
      { id: "neither", media_types: [], scopes: [] },
      { id: "novel", media_types: ["novel"], scopes: ["novel"] },
    ];
    expect(filtered(defs, rows, { mediaType: ["manga"] })).toEqual(["credited", "offered"]);
    // No entries is about credits: an offered-but-uncredited publisher has none.
    expect(filtered(defs, rows, { mediaType: [NO_ENTRIES] })).toEqual(["offered", "neither"]);
  });
});
