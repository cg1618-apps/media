import { fireEvent, render, screen } from "@testing-library/react";

import {
  anilistPopularitySort,
  anilistRatingSort,
  imdbRatingColumn,
  imdbRatingSort,
  imdbSeriesRatingSort,
  malRatingSort,
  usefulnessSort,
  planFlagColumn,
  playButtonColumn,
  watchButtonColumn,
} from "./libraryColumns";

it("watch column shows the status as text to a viewer and a toggle to an admin", () => {
  const col = watchButtonColumn();
  const item = { watching_status: "Watching" };

  render(<div>{col.render(item, { canTrack: false, handleStatusToggle: vi.fn() })}</div>);
  expect(screen.getByText("Watching")).toBeInTheDocument();

  const toggle = vi.fn();
  render(<div>{col.render(item, { canTrack: true, handleStatusToggle: toggle })}</div>);
  fireEvent.click(screen.getByRole("button"));
  expect(toggle).toHaveBeenCalledWith(expect.anything(), item, expect.any(String));
});

it("plan-flag column reports the field it is bound to", () => {
  const toggle = vi.fn();
  const col = planFlagColumn("read_next", "Read Next");
  expect(col.key).toBe("read_next");
  render(<div>{col.render({ read_next: false }, { canTrack: true, handleStatusToggle: toggle })}</div>);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(toggle).toHaveBeenCalledWith(expect.anything(), { read_next: false }, true, "read_next");
});

it("rating sorts put the highest first and unrated last", () => {
  const rows = [{ mal_rating: "7.1" }, { mal_rating: null }, { mal_rating: "8.9" }];
  expect([...rows].sort(malRatingSort.compare).map((r) => r.mal_rating)).toEqual(["8.9", "7.1", null]);
  const movies = [{ imdb_rating: "N/A" }, { imdb_rating: "8.0" }, { imdb_rating: "6.5" }];
  expect([...movies].sort(imdbRatingSort.compare).map((r) => r.imdb_rating)).toEqual(["8.0", "6.5", "N/A"]);
});

// A season entry carries its own rating and the whole show's; the show sort
// and column read the show's, not the season's.
it("the IMDb show sort and column read the whole show's rating", () => {
  const seasons = [
    { imdb_rating: "9.0", imdb_series_rating: "7.0" },
    { imdb_rating: "6.0", imdb_series_rating: "8.5" },
    { imdb_rating: "8.0", imdb_series_rating: null },
  ];
  expect([...seasons].sort(imdbSeriesRatingSort.compare).map((r) => r.imdb_series_rating)).toEqual([
    "8.5",
    "7.0",
    null,
  ]);
  const column = imdbRatingColumn({ field: "imdb_series_rating", key: "imdb_show", header: "Show" });
  expect(column.header).toBe("Show");
  render(<>{column.render(seasons[0])}</>);
  expect(screen.getByText("7.0")).toBeInTheDocument();
  expect(screen.queryByText("9.0")).toBeNull();
});

it("the usefulness sort follows the vocabulary's order, most useful first and unset last", () => {
  const rows = [{ usefulness: "不實用" }, { usefulness: null }, { usefulness: "非常實用" }, { usefulness: "特定情況實用" }, { usefulness: "實用" }];
  expect([...rows].sort(usefulnessSort.compare).map((r) => r.usefulness)).toEqual([
    "非常實用",
    "實用",
    "特定情況實用",
    "不實用",
    null,
  ]);
});

it("the AniList score sort puts the highest first and unscored last", () => {
  const rows = [{ anilist_rating: 74 }, { anilist_rating: null }, { anilist_rating: 85 }];
  expect([...rows].sort(anilistRatingSort.compare).map((r) => r.anilist_rating)).toEqual([
    85, 74, null,
  ]);
});

// A popularity RANK is better when it is smaller, so this sort runs the other
// way from every score sort above - and an entry AniList has not ranked still
// has to land last rather than first, which a plain ascending numeric sort
// with a 0 or -1 default gets backwards. Roughly a third of scored entries
// carry no all-time rank, so that arm is the common case.
it("the AniList popularity sort puts the smallest rank first and the unranked last", () => {
  const rows = [
    { anilist_popularity_rank: 364 },
    { anilist_popularity_rank: null },
    { anilist_popularity_rank: 12 },
  ];
  expect(
    [...rows].sort(anilistPopularitySort.compare).map((r) => r.anilist_popularity_rank),
  ).toEqual([12, 364, null]);
});

// The card figure follows the sort, and the popularity sort deliberately
// shows the SCORE rather than the rank it sorts on - a card has one score
// slot and the score is the comparable number.
it("both AniList sorts point a card at the AniList score", () => {
  expect(anilistRatingSort.cardScoreField).toBe("anilist_rating");
  expect(anilistPopularitySort.cardScoreField).toBe("anilist_rating");
  expect(malRatingSort.cardScoreField).toBe("mal_rating");
});

it("builds a play button column", () => {
  const col = playButtonColumn();
  expect(col.statusField).toBe("playing_status");
  expect(col.fallback).toBe("Might Play");
});
