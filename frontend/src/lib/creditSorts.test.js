import { describe, expect, it } from "vitest";
import {
  CREDIT_SORT_DEFAULT,
  creditSortOptions,
  publicRating,
  sortCredits,
} from "./creditSorts";

const ids = (list) => list.map((e) => e.system_id);

describe("creditSortOptions", () => {
  it("offers release date, my rating and public rating to a viewer with a list", () => {
    expect(creditSortOptions(true).map((o) => o.value)).toEqual([
      "release_date",
      "my_rating",
      "public_rating",
    ]);
  });

  it("leaves my rating out for a viewer without a list", () => {
    expect(creditSortOptions(false).map((o) => o.value)).toEqual([
      "release_date",
      "public_rating",
    ]);
  });

  it("starts on release date, newest first", () => {
    expect(CREDIT_SORT_DEFAULT).toBe("release_date");
    const release = creditSortOptions(true).find((o) => o.value === "release_date");
    expect(release.descending).toBe(true);
  });
});

describe("publicRating", () => {
  it("reads Metacritic on a game and an h-game, MAL on the rest", () => {
    expect(publicRating("game", { metacritic_score: 88, mal_rating: 9 })).toBe(88);
    expect(publicRating("h-game", { metacritic_score: 70 })).toBe(70);
    expect(publicRating("anime", { mal_rating: 8.1, metacritic_score: 99 })).toBe(8.1);
    expect(publicRating("manga", { mal_rating: null })).toBeNull();
  });
});

describe("sortCredits", () => {
  const entries = [
    { system_id: "old", release_date: "2001-04", my_rating: "B", mal_rating: 7.5 },
    { system_id: "undated", release_date: null, my_rating: null, mal_rating: null },
    { system_id: "new", release_date: "2020-01-02", my_rating: "S", mal_rating: 8.9 },
    { system_id: "mid", release_date: "2010", my_rating: "A", mal_rating: null },
  ];

  it("runs newest first by default, the undated last", () => {
    expect(ids(sortCredits(entries, "anime", "release_date", false))).toEqual([
      "new",
      "mid",
      "old",
      "undated",
    ]);
  });

  it("runs oldest first reversed, and still keeps the undated last", () => {
    expect(ids(sortCredits(entries, "anime", "release_date", true))).toEqual([
      "old",
      "mid",
      "new",
      "undated",
    ]);
  });

  it("sorts by my rating best first, the unrated last either way", () => {
    expect(ids(sortCredits(entries, "anime", "my_rating", false))).toEqual([
      "new",
      "mid",
      "old",
      "undated",
    ]);
    expect(ids(sortCredits(entries, "anime", "my_rating", true))).toEqual([
      "old",
      "mid",
      "new",
      "undated",
    ]);
  });

  it("sorts by the public rating highest first, entries without one last", () => {
    // mid and undated both lack a rating; they fall back to release date.
    expect(ids(sortCredits(entries, "anime", "public_rating", false))).toEqual([
      "new",
      "old",
      "mid",
      "undated",
    ]);
    expect(ids(sortCredits(entries, "anime", "public_rating", true))).toEqual([
      "old",
      "new",
      "mid",
      "undated",
    ]);
  });

  it("reads a game's Metacritic score as its public rating", () => {
    const games = [
      { system_id: "low", metacritic_score: 60, release_date: "2020" },
      { system_id: "high", metacritic_score: 95, release_date: "2010" },
    ];
    expect(ids(sortCredits(games, "game", "public_rating", false))).toEqual(["high", "low"]);
  });

  it("does not reorder the list it is given", () => {
    const copy = [...entries];
    sortCredits(entries, "anime", "release_date", false);
    expect(entries).toEqual(copy);
  });
});
