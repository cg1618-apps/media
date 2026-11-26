// The entity library FilterDefs: what each group offers, how a row matches,
// that a gated type the session cannot see is never named, and the default
// every entity library opens on.
import { describe, expect, it } from "vitest";

import { applyFilterDefs, initialFilters } from "./libraryFilters";
import {
  COUNTRY_NOT_SET,
  COUNTRY_OTHERS,
  HAS_RELATIONS,
  NO_RELATIONS,
  GENDER_NOT_SET,
  NO_ENTRIES,
  PUBLISHER_KINDS,
  ROLE_NOT_SET,
  TAGS_NOT_SET,
  UNRATED,
  characterFilterDefs,
  personFilterDefs,
  publisherFilterDefs,
  publisherKindLabels,
  studioChipCountries,
  studioFilterDefs,
} from "./entityFilters";

const SEES_ALL = { visibleGatedTypes: ["h-comic", "h-game", "hentai"] };
const SEES_NONE = { visibleGatedTypes: [] };
// The widest access mode: every content rating can reach it.
const UNRESTRICTED = { ...SEES_ALL, mode: { key: "unrestricted" } };

function def(defs, key) {
  return defs.find((fd) => fd.key === key);
}

function filtered(defs, rows, picks) {
  const filters = initialFilters(defs);
  for (const [key, values] of Object.entries(picks)) filters[key] = new Set(values);
  return applyFilterDefs(rows, defs, filters).map((r) => r.id);
}

describe("characterFilterDefs", () => {
  it("offers the five cast types, with h-comic and hentai under Restricted", () => {
    const mediaType = def(characterFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual(["anime", "anime-movie", "manga", "book", "game", NO_ENTRIES]);
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
    // b is cast on hentai only, so it is in play once hentai is ticked.
    const hentai = { mediaType: ["anime", "manga", "hentai", NO_ENTRIES] };
    expect(filtered(defs, ROWS, { ...hentai, myRating: [UNRATED] })).toEqual(["b"]);
    expect(filtered(defs, ROWS, { ...hentai, gender: [GENDER_NOT_SET] })).toEqual(["b"]);
    expect(filtered(defs, ROWS, { gender: ["男"] })).toEqual(["c"]);
  });

  // The character's own role field - a casting's role never enters into it.
  it("filters by the character's own role, with Not set for null, ANDed with the rest", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "role").options).toEqual([
      "Main", "Core", "Important Supporting", "Supporting", "Other", ROLE_NOT_SET,
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

  it("offers a person only 男 and 女 plus Not set", () => {
    expect(def(personFilterDefs(SEES_ALL), "gender").options).toEqual([
      "男", "女", GENDER_NOT_SET,
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

  it("offers the values the rows hold, the most-carried first, plus Not set last", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "appearance").type).toBe("set-dynamic");
    // Glasses is on two rows, Red Hair on one.
    expect(def(defs, "appearance").deriveOptions(ROWS)).toEqual([
      "Glasses", "Red Hair", TAGS_NOT_SET,
    ]);
    // Kuudere is on two rows, Tsundere on one.
    expect(def(defs, "trait").deriveOptions(ROWS)).toEqual([
      "Kuudere", "Tsundere", TAGS_NOT_SET,
    ]);
    // A value carried more often outranks one earlier in the alphabet; a tie
    // reads in name order.
    const byCount = [
      { appearance: ["Twin Tails"] },
      { appearance: ["Twin Tails", "Ahoge"] },
      { appearance: ["Twin Tails", "Bob"] },
      { appearance: ["Bob"] },
      { appearance: [] },
    ];
    expect(def(defs, "appearance").deriveOptions(byCount)).toEqual([
      "Twin Tails", "Bob", "Ahoge", TAGS_NOT_SET,
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
      "manga", "book", "comic", "game", NO_ENTRIES,
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
    expect(def(defs, "role").optionLabel("composer")).toBe("作曲");
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

describe("the entry-type group with nothing ticked", () => {
  const ROWS = [
    { id: "plain", media_types: ["anime"] },
    { id: "mixed", media_types: ["anime", "hentai"] },
    { id: "gated", media_types: ["hentai"] },
    { id: "new", media_types: [] },
  ];

  // The Restricted children exist here (SEES_ALL), so the empty group has
  // something to leave out: a session that sees no gated type would pass
  // this vacuously.
  it("hides a restricted-only row and keeps a mixed or entry-less one", () => {
    const defs = characterFilterDefs(SEES_ALL);
    expect(def(defs, "mediaType").parent.children).toContain("hentai");
    const filters = initialFilters(defs);
    expect(filters.mediaType.size).toBe(0);
    expect(applyFilterDefs(ROWS, defs, filters).map((r) => r.id)).toEqual([
      "plain", "mixed", "new",
    ]);
    filters.mediaType.add("hentai");
    expect(applyFilterDefs(ROWS, defs, filters).map((r) => r.id)).toEqual([
      "mixed", "gated",
    ]);
  });

  it("shows what every plain type and No entries ticked shows", () => {
    const defs = personFilterDefs(SEES_ALL);
    const all = initialFilters(defs);
    all.mediaType = new Set(def(defs, "mediaType").options);
    expect(applyFilterDefs(ROWS, defs, initialFilters(defs))).toEqual(
      applyFilterDefs(ROWS, defs, all),
    );
  });
});

describe("the entity libraries' filter order", () => {
  const keys = (defs) => defs.map((fd) => fd.key);
  const advanced = (defs) => defs.filter((fd) => fd.advanced).map((fd) => fd.key);
  const ordinary = (defs) => defs.filter((fd) => !fd.advanced).map((fd) => fd.key);

  it("puts Entry type first on every entity library and My Rating in its advanced section", () => {
    for (const defs of [
      characterFilterDefs(UNRESTRICTED),
      personFilterDefs(UNRESTRICTED),
      studioFilterDefs(UNRESTRICTED),
      publisherFilterDefs(UNRESTRICTED),
    ]) {
      expect(keys(defs)[0]).toBe("mediaType");
      expect(advanced(defs)).toContain("myRating");
      expect(ordinary(defs)).not.toContain("myRating");
    }
  });

  it("orders each library's ordinary filters", () => {
    expect(ordinary(characterFilterDefs(UNRESTRICTED))).toEqual([
      "mediaType", "role", "gender",
    ]);
    expect(ordinary(personFilterDefs(UNRESTRICTED))).toEqual([
      "mediaType", "role", "gender",
    ]);
    expect(ordinary(studioFilterDefs(UNRESTRICTED))).toEqual([
      "mediaType", "country",
    ]);
    expect(ordinary(publisherFilterDefs(UNRESTRICTED))).toEqual([
      "mediaType", "kind", "country",
    ]);
  });

  it("orders each library's advanced filters", () => {
    expect(advanced(characterFilterDefs(UNRESTRICTED))).toEqual([
      "cardKind", "hasIdentities", "myRating", "appearance", "trait",
    ]);
    expect(advanced(personFilterDefs(UNRESTRICTED))).toEqual(["contentRating", "myRating"]);
    expect(advanced(studioFilterDefs(UNRESTRICTED))).toEqual([
      "contentRating", "relation", "myRating",
    ]);
    expect(advanced(publisherFilterDefs(UNRESTRICTED))).toEqual([
      "contentRating", "relation", "myRating",
    ]);
  });

  it("draws every advanced filter after every ordinary one", () => {
    for (const defs of [
      characterFilterDefs(UNRESTRICTED),
      personFilterDefs(UNRESTRICTED),
      studioFilterDefs(UNRESTRICTED),
      publisherFilterDefs(UNRESTRICTED),
    ]) {
      const first = defs.findIndex((fd) => fd.advanced);
      expect(defs.slice(first).every((fd) => fd.advanced)).toBe(true);
    }
  });

  it("leaves My Rating out for a viewer without a list, keeping the rest in order", () => {
    expect(keys(personFilterDefs(SEES_ALL, { ownData: false }))).toEqual([
      "mediaType", "role", "gender",
    ]);
  });
});

describe("personFilterDefs Type labels", () => {
  it("names each person type in Chinese, keeping Club as it reads", () => {
    const type = def(personFilterDefs(SEES_ALL), "role");
    expect(Object.fromEntries(type.options.map((k) => [k, type.optionLabel(k)]))).toEqual({
      director: "導演",
      producer: "製片",
      composer: "作曲",
      author: "作家",
      illustrator: "畫家",
      club: "Club",
      seiyuu: "聲優",
    });
  });
});

describe("publisherFilterDefs country", () => {
  it("offers the countries the most publishers name first, then Not set", () => {
    const country = def(publisherFilterDefs(SEES_ALL), "country");
    const rows = [
      { country: "Taiwan" },
      { country: "Japan" },
      { country: "Taiwan" },
      { country: null },
      { country: "China" },
      { country: "Japan" },
      { country: "Taiwan" },
    ];
    expect(country.deriveOptions(rows)).toEqual(["Taiwan", "Japan", "China", COUNTRY_NOT_SET]);
  });
});

describe("studioFilterDefs", () => {
  it("offers the studio's credit types, with hentai and h-game under Restricted", () => {
    const mediaType = def(studioFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual(["anime", "anime-movie", "game", NO_ENTRIES]);
    expect(mediaType.parent.children).toEqual(["hentai", "h-game"]);
    expect(def(studioFilterDefs(SEES_NONE), "mediaType").parent).toBeUndefined();
  });

  it("gives a chip only to a country more than five studios name, most-named first", () => {
    const many = (country, n) => Array.from({ length: n }, () => ({ countries: [country] }));
    const rows = [...many("Korea", 6), ...many("Japan", 8), ...many("China", 5)];
    expect(studioChipCountries(rows)).toEqual(["Japan", "Korea"]);
    // A studio naming a country twice counts once.
    expect(studioChipCountries([...many("USA", 4), { countries: ["USA", "USA"] }])).toEqual([]);
    expect(studioChipCountries([...many("USA", 5), { countries: ["USA", "UK"] }])).toEqual(["USA"]);
  });

  it("derives the chips, then Others and Not set only when a row needs them", () => {
    const japan = Array.from({ length: 6 }, () => ({ countries: ["Japan"] }));
    const country = (rows) => def(studioFilterDefs(SEES_ALL, { studios: rows }), "country");
    expect(country(japan).type).toBe("set-dynamic");
    expect(country(japan).deriveOptions(japan)).toEqual(["Japan"]);
    const all = [...japan, { countries: ["Poland"] }, { countries: null }];
    expect(country(all).deriveOptions(all)).toEqual(["Japan", COUNTRY_OTHERS, COUNTRY_NOT_SET]);
  });

  it("matches a studio under every chip one of its countries falls under", () => {
    const rows = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `jp${i}`, countries: ["Japan"] })),
      { id: "jp-pl", countries: ["Japan", "Poland"], my_rating: "S" },
      { id: "pl", countries: ["Poland"] },
      { id: "none", countries: null, my_rating: "S" },
      { id: "empty", countries: [] },
    ];
    const defs = studioFilterDefs(SEES_ALL, { studios: rows });
    expect(filtered(defs, rows, { country: [COUNTRY_OTHERS] })).toEqual(["jp-pl", "pl"]);
    expect(filtered(defs, rows, { country: [COUNTRY_NOT_SET] })).toEqual(["none", "empty"]);
    expect(filtered(defs, rows, { country: ["Japan"] })).toHaveLength(7);
    expect(filtered(defs, rows, { country: [COUNTRY_NOT_SET], myRating: ["S"] })).toEqual(["none"]);
  });

  it("filters by relation off has_relations, Has relation / No relation", () => {
    const defs = studioFilterDefs(SEES_ALL);
    const relation = def(defs, "relation");
    expect(relation.options).toEqual([HAS_RELATIONS, NO_RELATIONS]);
    const rows = [
      { id: "related", has_relations: true },
      { id: "alone", has_relations: false },
      // A row from before the field existed reads as no relation.
      { id: "older" },
    ];
    expect(filtered(defs, rows, { relation: [HAS_RELATIONS] })).toEqual(["related"]);
    expect(filtered(defs, rows, { relation: [NO_RELATIONS] })).toEqual(["alone", "older"]);
    expect(filtered(defs, rows, {})).toEqual(["related", "alone", "older"]);
  });
});

describe("publisherFilterDefs", () => {
  it("offers the six publisher types and no Restricted parent", () => {
    const mediaType = def(publisherFilterDefs(SEES_ALL), "mediaType");
    expect(mediaType.options).toEqual([
      "anime", "anime-movie", "manga", "book", "comic", "game", NO_ENTRIES,
    ]);
    expect(mediaType.parent).toBeUndefined();
  });

  it("matches the types it is credited on OR offered on", () => {
    const defs = publisherFilterDefs(SEES_ALL);
    const rows = [
      { id: "credited", media_types: ["manga"], scopes: [] },
      { id: "offered", media_types: [], scopes: ["manga"] },
      { id: "neither", media_types: [], scopes: [] },
      { id: "book", media_types: ["book"], scopes: ["book"] },
    ];
    expect(filtered(defs, rows, { mediaType: ["manga"] })).toEqual(["credited", "offered"]);
    // No entries is about credits: an offered-but-uncredited publisher has none.
    expect(filtered(defs, rows, { mediaType: [NO_ENTRIES] })).toEqual(["offered", "neither"]);
  });
});

describe("publisherFilterDefs kind group", () => {
  const kind = () => def(publisherFilterDefs(SEES_ALL), "kind");

  it("offers 遊戲發行商, 台灣出版社, 台灣代理商 and 其他, in that order", () => {
    const fd = kind();
    expect(fd.label).toBe("Kind");
    expect(fd.options.map((k) => fd.optionLabel(k))).toEqual([
      "遊戲發行商", "台灣出版社", "台灣代理商", "其他",
    ]);
  });

  it("names every publisher type in exactly one kind but 其他", () => {
    const named = PUBLISHER_KINDS.flatMap((k) => k.mediaTypes);
    expect(new Set(named).size).toBe(named.length);
    expect(named.sort()).toEqual(["anime", "anime-movie", "book", "game", "manga"]);
  });

  it("matches a publisher by the types it is credited on OR offered on", () => {
    const defs = publisherFilterDefs(SEES_ALL);
    const [game, twPublisher, twDistributor, other] = kind().options;
    const rows = [
      { id: "game", media_types: ["game"], scopes: [] },
      { id: "manga", media_types: [], scopes: ["manga"] },
      { id: "book", media_types: ["book"], scopes: ["book"] },
      { id: "anime", media_types: ["anime"], scopes: [] },
      { id: "movie", media_types: [], scopes: ["anime-movie"] },
      { id: "comic", media_types: ["comic"], scopes: ["comic"] },
      { id: "nothing", media_types: [], scopes: [] },
    ];
    expect(filtered(defs, rows, { kind: [game] })).toEqual(["game"]);
    expect(filtered(defs, rows, { kind: [twPublisher] })).toEqual(["manga", "book"]);
    expect(filtered(defs, rows, { kind: [twDistributor] })).toEqual(["anime", "movie"]);
    expect(filtered(defs, rows, { kind: [other] })).toEqual(["comic"]);
    // OR inside the group.
    expect(filtered(defs, rows, { kind: [game, other] })).toEqual(["game", "comic"]);
  });

  it("matches a publisher covering several kinds under each of them", () => {
    const defs = publisherFilterDefs(SEES_ALL);
    const [game, twPublisher, twDistributor, other] = kind().options;
    const rows = [{ id: "both", media_types: ["anime"], scopes: ["manga", "comic"] }];
    expect(filtered(defs, rows, { kind: [twDistributor] })).toEqual(["both"]);
    expect(filtered(defs, rows, { kind: [twPublisher] })).toEqual(["both"]);
    expect(filtered(defs, rows, { kind: [other] })).toEqual(["both"]);
    // The refusal case, on the same row: it holds no game type.
    expect(filtered(defs, rows, { kind: [game] })).toEqual([]);
  });
});

// The rating group is the viewer's own (self.list): every library's defs
// leave it out for `{ ownData: false }`, and keep it by default.
describe("the My Rating group and ownData", () => {
  const builders = {
    character: (o) => characterFilterDefs(SEES_ALL, o),
    person: (o) => personFilterDefs(SEES_ALL, o),
    studio: (o) => studioFilterDefs(SEES_ALL, o),
    publisher: (o) => publisherFilterDefs(SEES_ALL, o),
  };
  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: dropped without own data, kept with it`, () => {
      expect(build({ ownData: false }).map((fd) => fd.key)).not.toContain("myRating");
      expect(build({ ownData: true }).map((fd) => fd.key)).toContain("myRating");
    });
  }
});

// The Content rating group follows the active mode: it offers only the
// ratings the server can serve in it, and is absent where that is one.
describe("the Content rating group", () => {
  const builders = {
    person: (auth) => personFilterDefs(auth),
    studio: (auth) => studioFilterDefs(auth),
    publisher: (auth) => publisherFilterDefs(auth),
  };
  const inMode = (key) => ({ ...SEES_ALL, mode: { key } });

  for (const [name, build] of Object.entries(builders)) {
    it(`${name}: absent in safe and normal, and without a mode`, () => {
      // The same builder produces the group in borderline, so its absence
      // below is the mode's doing.
      expect(def(build(inMode("borderline")), "contentRating")).toBeDefined();
      for (const auth of [inMode("safe"), inMode("normal"), SEES_ALL, null]) {
        expect(def(build(auth), "contentRating")).toBeUndefined();
      }
    });

    it(`${name}: normal and borderline in borderline, all three in unrestricted`, () => {
      expect(def(build(inMode("borderline")), "contentRating").options).toEqual([
        "normal", "borderline",
      ]);
      expect(def(build(inMode("unrestricted")), "contentRating").options).toEqual([
        "normal", "borderline", "unrestricted",
      ]);
    });
  }

  it("labels the ratings and matches a row with none as normal", () => {
    const defs = personFilterDefs(UNRESTRICTED);
    const group = def(defs, "contentRating");
    expect(group.label).toBe("Content rating");
    expect(group.options.map(group.optionLabel)).toEqual([
      "Normal", "Borderline (15+)", "Unrestricted (18+)",
    ]);
    const rows = [
      { id: 1, media_types: [], content_rating: "normal" },
      { id: 2, media_types: [], content_rating: "borderline" },
      { id: 3, media_types: [], content_rating: "unrestricted" },
      { id: 4, media_types: [] },
    ];
    expect(filtered(defs, rows, { contentRating: ["normal"] })).toEqual([1, 4]);
    expect(filtered(defs, rows, { contentRating: ["borderline", "unrestricted"] })).toEqual([2, 3]);
  });
});

describe("publisherKindLabels", () => {
  it("names each kind a publisher covers, in kind order, then 其他", () => {
    expect(publisherKindLabels({ media_types: ["comic", "anime"], scopes: ["game"] })).toEqual([
      "遊戲發行商", "台灣代理商", "其他",
    ]);
    expect(publisherKindLabels({ media_types: [], scopes: [] })).toEqual([]);
  });
});
