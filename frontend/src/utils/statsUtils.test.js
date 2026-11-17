// Frontend: the favourite-grid and plan cover resolvers.
//
// A group has no cover of its own; it borrows one from an entry, and a
// borrowed cover must keep the focal point of the entry it came from, or a
// franchise card would crop the same picture differently from the entry's.
import { describe, expect, it } from "vitest";

import { FALLBACK_SVG } from "../lib/covers";
import { FAVORITE_GRIDS } from "../config/favoriteGrids";
import {
  favoriteCover,
  favoritePool,
  getCoverForSlot,
  getSeriesCoverForSlot,
  NOVEL_BOOK_TYPES,
  novelsOnly,
} from "./statsUtils";

const old = {
  system_id: "e1",
  release_date: "2001-01-01",
  cover_image_file: "anime/e1.jpg",
  cover_image_focus: "90% 90%",
  _type: "anime",
};
const recent = {
  system_id: "e2",
  release_date: "2020-01-01",
  cover_image_file: "movie/e2.jpg",
  cover_image_focus: "40% 10%",
  _type: "movie",
};

describe("getCoverForSlot", () => {
  it("returns the chosen entry's cover with its focus", () => {
    expect(
      getCoverForSlot({ system_id: "f1", cover_entry_id: "e1" }, { f1: [old, recent] }),
    ).toEqual({ url: "/api/covers/anime/e1.jpg", focus: "90% 90%" });
  });

  it("falls back to the newest entry, focus and all", () => {
    expect(getCoverForSlot({ system_id: "f1" }, { f1: [old, recent] })).toEqual({
      url: "/api/covers/movie/e2.jpg",
      focus: "40% 10%",
    });
  });

  it("returns the placeholder, centred, when nothing has a cover", () => {
    expect(getCoverForSlot({ system_id: "f1" }, {})).toEqual({
      url: FALLBACK_SVG,
      focus: null,
    });
  });
});

describe("getSeriesCoverForSlot", () => {
  it("honours the type filter and keeps the focus", () => {
    expect(
      getSeriesCoverForSlot({ system_id: "s1" }, { s1: [old, recent] }, "Anime"),
    ).toEqual({ url: "/api/covers/anime/e1.jpg", focus: "90% 90%" });
  });
});

describe("favoriteCover", () => {
  it("reads an entry row's own cover and focus", () => {
    expect(favoriteCover(recent, { tier: "entry" }, {})).toEqual({
      url: "/api/covers/movie/e2.jpg",
      focus: "40% 10%",
    });
  });

  it("gives an entry with no cover the centred placeholder", () => {
    expect(favoriteCover({ system_id: "x" }, { tier: "entry" }, {})).toEqual({
      url: FALLBACK_SVG,
      focus: null,
    });
  });
});

describe("favoritePool", () => {
  const franchises = [
    { system_id: "a", franchise_type: "Anime" },
    { system_id: "m", franchise_type: "Game, Manga" },
    { system_id: "n", franchise_type: "Book" },
    { system_id: "am", franchise_type: "Anime Movie" },
  ];
  const ids = (rows) => rows.map((r) => r.system_id);

  it("the AniManga grid holds Anime and Manga franchises together", () => {
    const grid = FAVORITE_GRIDS.find((g) => g.id === "animanga-franchises");
    expect(grid.key).toBe("ACG");
    expect(ids(favoritePool(grid, { franchises }))).toEqual(["a", "m"]);
  });

  it("a grid naming no franchiseTypes filters on its key", () => {
    const grid = FAVORITE_GRIDS.find((g) => g.id === "movie-franchises");
    expect(grid.franchiseTypes).toBeUndefined();
    const pool = [...franchises, { system_id: "mv", franchise_type: "Movie" }];
    expect(ids(favoritePool(grid, { franchises: pool }))).toEqual(["mv"]);
  });

  // The book grid keeps the stored key "Novel" from before the rename, so the
  // key no longer names the franchise type it holds.
  it("the book grid keeps its stored key and holds Book franchises", () => {
    const grid = FAVORITE_GRIDS.find((g) => g.id === "book-franchises");
    expect(grid.key).toBe("Novel");
    expect(grid.forType).toBe("Book");
    const pool = [...franchises, { system_id: "old", franchise_type: "Novel" }];
    expect(ids(favoritePool(grid, { franchises: pool }))).toEqual(["n"]);
  });
});

// The Statistics Novel section counts the books that are novels. Every other
// book type, and a book with no type, is left out - so the fixture holds one
// of each, and the mirror case proves the four novel types do get through.
describe("novelsOnly", () => {
  const books = [
    { system_id: "ln", type: "輕小說" },
    { system_id: "n", type: "小說" },
    { system_id: "wn", type: "網路小說" },
    { system_id: "ss", type: "短篇集" },
    { system_id: "guide", type: "指南/設定集" },
    { system_id: "other", type: "其他" },
    { system_id: "untyped", type: null },
    { system_id: "missing" },
  ];

  it("names the four novel types", () => {
    expect(NOVEL_BOOK_TYPES).toEqual(["輕小說", "小說", "網路小說", "短篇集"]);
  });

  it("keeps the novel types", () => {
    expect(novelsOnly(books).map((b) => b.system_id)).toEqual(["ln", "n", "wn", "ss"]);
  });

  it("leaves out 指南/設定集, 其他 and a book with no type", () => {
    const kept = novelsOnly(books).map((b) => b.system_id);
    for (const id of ["guide", "other", "untyped", "missing"]) {
      expect(kept).not.toContain(id);
    }
  });

  it("is empty for no books", () => {
    expect(novelsOnly(undefined)).toEqual([]);
    expect(novelsOnly([])).toEqual([]);
  });
});
