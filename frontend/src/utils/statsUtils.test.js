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
    { system_id: "n", franchise_type: "Novel" },
    { system_id: "am", franchise_type: "Anime Movie" },
  ];
  const ids = (rows) => rows.map((r) => r.system_id);

  it("the AniManga grid holds Anime and Manga franchises together", () => {
    const grid = FAVORITE_GRIDS.find((g) => g.id === "animanga-franchises");
    expect(grid.key).toBe("ACG");
    expect(ids(favoritePool(grid, { franchises }))).toEqual(["a", "m"]);
  });

  it("a grid naming no franchiseTypes filters on its key", () => {
    const grid = FAVORITE_GRIDS.find((g) => g.id === "novel-franchises");
    expect(ids(favoritePool(grid, { franchises }))).toEqual(["n"]);
  });
});
