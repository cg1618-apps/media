import { describe, expect, it } from "vitest";

import { groupAliasesBySource, storedValues } from "./aliasGroups";

const OPTIONS = [
  {
    category: "Game Genre",
    value: "角色扮演",
    aliases: [
      { source: "igdb", value: "Role-playing (RPG)" },
      { source: "igdb", value: "RPG" },
    ],
  },
  {
    category: "Game Genre",
    value: "射擊",
    aliases: [{ source: "igdb", value: "Shooter" }],
  },
  // In an aliased category, but carrying no alias of its own.
  { category: "Game Genre", value: "獨立", aliases: [] },
  {
    category: "Game Theme",
    value: "動作",
    aliases: [{ source: "igdb", value: "Action" }],
  },
  // A category no API touches at all.
  { category: "Combat Mode", value: "PvE", aliases: [] },
];

describe("groupAliasesBySource", () => {
  it("lists every value of an aliased category, in the options' own order", () => {
    const [igdb] = groupAliasesBySource(OPTIONS);
    const genres = igdb.categories.find((c) => c.category === "Game Genre");
    expect(genres.rows).toEqual([
      { external: "Role-playing (RPG)", value: "角色扮演", family: null },
      { external: "RPG", value: "角色扮演", family: null },
      { external: "Shooter", value: "射擊", family: null },
      // 獨立 sits in a category IGDB fills, but nothing IGDB says maps to it.
      { external: null, value: "獨立", family: null },
    ]);
    expect(genres.aliased).toBe(3);
  });

  it("counts every alias row under its source", () => {
    const [igdb] = groupAliasesBySource(OPTIONS);
    expect(igdb.source).toBe("igdb");
    expect(igdb.total).toBe(4);
  });

  it("leaves out categories no source names at all", () => {
    const [igdb] = groupAliasesBySource(OPTIONS);
    expect(igdb.categories.map((c) => c.category)).toEqual(["Game Genre", "Game Theme"]);
  });

  it("carries a Game Platform console's main platform", () => {
    const [igdb] = groupAliasesBySource([
      {
        category: "Game Platform",
        value: "Android",
        family: "Mobile",
        aliases: [{ source: "igdb", value: "Android" }],
      },
    ]);
    expect(igdb.categories[0].rows).toEqual([
      { external: "Android", value: "Android", family: "Mobile" },
    ]);
  });

  it("returns nothing when no option carries an alias", () => {
    expect(groupAliasesBySource([{ category: "X", value: "y" }])).toEqual([]);
    expect(groupAliasesBySource([])).toEqual([]);
    expect(groupAliasesBySource(undefined)).toEqual([]);
  });
});

describe("storedValues", () => {
  it("puts the main platform first and drops the value that repeats the API's name", () => {
    expect(storedValues({ external: "Android", value: "Android", family: "Mobile" })).toEqual([
      "Mobile",
    ]);
  });

  it("keeps a converted console name beside its main platform", () => {
    expect(
      storedValues({ external: "PlayStation 4", value: "PS4", family: "PlayStation" }),
    ).toEqual(["PlayStation", "PS4"]);
  });

  it("keeps a lone value even when it repeats the API's name", () => {
    expect(storedValues({ external: "Xbox", value: "Xbox", family: null })).toEqual(["Xbox"]);
    expect(storedValues({ external: "Web browser", value: "Browser", family: null })).toEqual([
      "Browser",
    ]);
  });

  it("shows a value with no conversion as itself, with its main platform", () => {
    expect(storedValues({ external: null, value: "Switch 2", family: "Nintendo" })).toEqual([
      "Nintendo",
      "Switch 2",
    ]);
  });
});
