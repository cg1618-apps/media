// The character and person library FilterDefs: what each group offers, how a
// row matches, and that a gated type the session cannot see is never named.
import { describe, expect, it } from "vitest";

import { applyFilterDefs, initialFilters } from "./libraryFilters";
import {
  GENDER_NOT_SET,
  ROLE_NOT_SET,
  UNRATED,
  characterFilterDefs,
  personFilterDefs,
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
    expect(mediaType.options).toEqual(["anime", "anime-movie", "manga", "novel"]);
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

describe("personFilterDefs", () => {
  it("offers every non-gated type, with all three gated types under Restricted", () => {
    const mediaType = def(personFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual([
      "anime", "anime-movie", "movie", "tv-show", "cartoon",
      "manga", "novel", "comic", "game",
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
