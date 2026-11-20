import { describe, it, expect } from "vitest";
import { effectiveBucket, entryBucket, groupByBucket } from "./planNext";

describe("effectiveBucket", () => {
  it("prefers the manual key", () => {
    expect(effectiveBucket({ anime: "24ep" }, { anime: "12ep" }, "anime")).toBe("12ep");
  });

  it("falls back to derived for keys with no override", () => {
    const derived = { anime: "24ep", "tv-show": "2season" };
    expect(effectiveBucket(derived, { anime: "12ep" }, "tv-show")).toBe("2season");
  });

  it("returns null when neither map has the key", () => {
    expect(effectiveBucket({ anime: "24ep" }, null, "movie")).toBeNull();
    expect(effectiveBucket(null, null, "anime")).toBeNull();
  });
});

describe("entryBucket", () => {
  const series = { size_group_derived: { anime: "24ep" }, size_group_manual: null };
  const franchise = { size_group_derived: { anime: "12ep" }, size_group_manual: null };

  it("inherits from the series", () => {
    expect(entryBucket("anime", null, series, franchise)).toBe("24ep");
  });

  it("falls back to the franchise", () => {
    expect(entryBucket("anime", null, null, franchise)).toBe("12ep");
  });

  it("falls back when the series lacks that media type key", () => {
    const other = { size_group_derived: { "tv-show": "2season" }, size_group_manual: null };
    expect(entryBucket("anime", null, other, franchise)).toBe("12ep");
  });

  it("buckets a comic on its own issue total, ignoring its series", () => {
    const comicSeries = { size_group_derived: { comic: "11_plus" }, size_group_manual: null };
    expect(entryBucket("comic", 5, comicSeries, null)).toBe("4_10");
    expect(entryBucket("comic", 3, comicSeries, null)).toBe("1_3");
    expect(entryBucket("comic", 11, comicSeries, null)).toBe("11_plus");
  });

  it("gives a comic with no issue total no bucket", () => {
    expect(entryBucket("comic", null, null, null)).toBeNull();
  });

  it("returns null with no group at all", () => {
    expect(entryBucket("anime", null, null, null)).toBeNull();
  });
});

describe("entryBucket: manga groups by serialization status", () => {
  const series = { size_group_derived: { manga: "ignored" }, size_group_manual: null };

  it("uses the entry's own serialization status", () => {
    expect(entryBucket("manga", "連載中", series, null)).toBe("連載中");
    expect(entryBucket("manga", "完結", null, null)).toBe("完結");
    expect(entryBucket("manga", "腰斬", null, null)).toBe("腰斬");
    expect(entryBucket("manga", "停更", null, null)).toBe("停更");
  });

  it("never inherits from its series or franchise", () => {
    const franchise = { size_group_derived: { manga: "x" }, size_group_manual: null };
    expect(entryBucket("manga", null, series, franchise)).toBeNull();
  });

  it("gives a missing or unknown status no bucket, so it lands in the trailing group", () => {
    expect(entryBucket("manga", null, null, null)).toBeNull();
    expect(entryBucket("manga", "休刊", null, null)).toBeNull();
  });
});

describe("entryBucket: book groups by type", () => {
  it("uses the entry's own type", () => {
    expect(entryBucket("book", "網路小說", null, null)).toBe("網路小說");
    expect(entryBucket("book", "輕小說", null, null)).toBe("輕小說");
    expect(entryBucket("book", "小說", null, null)).toBe("小說");
    expect(entryBucket("book", "短篇集", null, null)).toBe("短篇集");
    expect(entryBucket("book", "指南/設定集", null, null)).toBe("指南/設定集");
    expect(entryBucket("book", "其他", null, null)).toBe("其他");
  });

  it("folds the old English vocabulary into 其他", () => {
    expect(entryBucket("book", "Other", null, null)).toBe("其他");
    expect(entryBucket("book", "Web", null, null)).toBe("其他");
  });

  it("folds a missing or unknown type into 其他, unlike manga", () => {
    expect(entryBucket("book", null, null, null)).toBe("其他");
    expect(entryBucket("book", "Serial", null, null)).toBe("其他");
  });

  it("never inherits from its series or franchise", () => {
    const series = { size_group_derived: { book: "網路小說" }, size_group_manual: null };
    expect(entryBucket("book", "小說", series, null)).toBe("小說");
  });
});

describe("groupByBucket: manga and book vocabularies", () => {
  it("keys manga in vocabulary order plus a trailing ungrouped pile", () => {
    expect(Object.keys(groupByBucket([], "manga"))).toEqual([
      "完結", "連載中", "腰斬", "停更", "ungrouped",
    ]);
  });

  it("leads book with 網路小說, unlike the form dropdown order", () => {
    expect(Object.keys(groupByBucket([], "book"))).toEqual([
      "網路小說", "輕小說", "小說", "短篇集", "指南/設定集", "其他", "ungrouped",
    ]);
  });

  it("files a statusless manga into ungrouped and a typeless book into 其他", () => {
    const manga = groupByBucket([{ id: 1, bucket: entryBucket("manga", null) }], "manga");
    expect(manga.ungrouped).toHaveLength(1);

    const book = groupByBucket([{ id: 1, bucket: entryBucket("book", null) }], "book");
    expect(book["其他"]).toHaveLength(1);
    expect(book.ungrouped).toHaveLength(0);
  });
});

describe("groupByBucket", () => {
  it("keys every bucket in vocabulary order plus ungrouped", () => {
    const grouped = groupByBucket([], "anime");
    expect(Object.keys(grouped)).toEqual(["12ep", "24ep", "30ep_plus", "ungrouped"]);
  });

  it("files rows by their bucket field", () => {
    const rows = [
      { id: 1, bucket: "12ep" },
      { id: 2, bucket: "12ep" },
      { id: 3, bucket: null },
    ];
    const grouped = groupByBucket(rows, "anime");
    expect(grouped["12ep"]).toHaveLength(2);
    expect(grouped.ungrouped).toHaveLength(1);
    expect(grouped["24ep"]).toEqual([]);
  });

  // anime-movie is the only type with no grouping at all: the five size-bucket
  // types inherit one, and comic/manga/book each group by their own column.
  it("puts everything in ungrouped for an unbucketed media type", () => {
    const grouped = groupByBucket([{ id: 1, bucket: null }], "anime-movie");
    expect(Object.keys(grouped)).toEqual(["ungrouped"]);
    expect(grouped.ungrouped).toHaveLength(1);
  });
});

import {
  ALLOWED_SCOPES,
  KINDS,
  REWATCH_TABS,
  scopesFor,
} from "../config/planNextGroups";

describe("kind vocabulary", () => {
  it("has exactly two kinds", () => {
    expect(KINDS).toEqual(["next", "rewatch"]);
  });

  it("covers every media type under both kinds", () => {
    const types = Object.keys(ALLOWED_SCOPES.next);
    expect(types).toHaveLength(12);
    expect(Object.keys(ALLOWED_SCOPES.rewatch).sort()).toEqual(types.sort());
  });
});

describe("scopesFor", () => {
  // Must agree with app/utils/plan_next_kinds.py for every pair listed.
  it.each([
    ["rewatch", "anime", ["franchise"]],
    ["rewatch", "anime-movie", ["entry"]],
    ["rewatch", "movie", ["entry", "series", "franchise"]],
    ["rewatch", "tv-show", ["entry", "series", "franchise"]],
    ["rewatch", "cartoon", ["franchise"]],
    ["rewatch", "manga", ["entry"]],
    ["rewatch", "book", ["entry", "series", "franchise"]],
    ["rewatch", "comic", ["entry", "series"]],
    ["next", "game", ["entry"]],
    ["rewatch", "game", ["entry", "series", "franchise"]],
    ["next", "h-comic", ["entry"]],
    ["rewatch", "h-comic", ["entry"]],
    ["next", "h-game", ["entry", "series", "franchise"]],
    ["rewatch", "h-game", ["entry", "series", "franchise"]],
    ["next", "hentai", ["entry"]],
    ["rewatch", "hentai", ["entry"]],
  ])("%s / %s", (kind, mediaType, expected) => {
    expect(scopesFor(kind, mediaType)).toEqual(expected);
  });

  it("returns scopes in entry-series-franchise order", () => {
    expect(scopesFor("next", "movie")).toEqual(["entry", "series", "franchise"]);
  });

  it("is empty for an unknown pair", () => {
    expect(scopesFor("nope", "movie")).toEqual([]);
    expect(scopesFor("rewatch", "nope")).toEqual([]);
  });
});

describe("REWATCH_TABS", () => {
  it("covers all twelve types", () => {
    expect(REWATCH_TABS.map((t) => t.key)).toEqual([
      "anime",
      "anime-movie",
      "movie",
      "tv-show",
      "cartoon",
      "manga",
      "book",
      "comic",
      "game",
      "h-comic",
      "h-game",
      "hentai",
    ]);
  });
});
