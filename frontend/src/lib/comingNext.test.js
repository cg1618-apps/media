// Frontend: unit tests for the dashboard's Coming Next selection.
import { describe, it, expect } from "vitest";
import {
  parseSeason,
  seasonOfDate,
  seasonAfter,
  entrySeason,
  isUnreleased,
  selectComingNext,
} from "./comingNext";

describe("parseSeason", () => {
  it("reads the 'SSS YYYY' string system_configs stores", () => {
    expect(parseSeason("SPR 2026")).toEqual({ code: "SPR", year: 2026 });
  });

  it("returns null for an unset or malformed value", () => {
    expect(parseSeason(null)).toBeNull();
    expect(parseSeason("")).toBeNull();
    expect(parseSeason("Not Set")).toBeNull();
    expect(parseSeason("SPRING 2026")).toBeNull();
    expect(parseSeason("SPR")).toBeNull();
  });
});

describe("seasonOfDate", () => {
  it("maps calendar quarters to seasons", () => {
    expect(seasonOfDate(new Date(2026, 0, 1))).toEqual({ code: "WIN", year: 2026 });
    expect(seasonOfDate(new Date(2026, 5, 30))).toEqual({ code: "SPR", year: 2026 });
    expect(seasonOfDate(new Date(2026, 8, 25))).toEqual({ code: "SUM", year: 2026 });
    expect(seasonOfDate(new Date(2026, 11, 31))).toEqual({ code: "FAL", year: 2026 });
  });
});

describe("seasonAfter", () => {
  it("steps to the following season", () => {
    expect(seasonAfter({ code: "WIN", year: 2026 })).toEqual({ code: "SPR", year: 2026 });
    expect(seasonAfter({ code: "SUM", year: 2026 })).toEqual({ code: "FAL", year: 2026 });
  });

  it("rolls Fall into Winter of the next year", () => {
    expect(seasonAfter({ code: "FAL", year: 2026 })).toEqual({ code: "WIN", year: 2027 });
  });
});

describe("entrySeason", () => {
  it("uses anime's release_season with the year of release_date", () => {
    // A late-December premiere MAL files under Winter: the column wins.
    expect(
      entrySeason({ release_season: "WIN", release_date: "2026-12-28" }, "anime"),
    ).toEqual({ code: "WIN", year: 2026 });
  });

  it("falls back to the month when an anime has no release_season", () => {
    expect(entrySeason({ release_date: "2026-10-04" }, "anime")).toEqual({
      code: "FAL",
      year: 2026,
    });
  });

  it("derives other types' season from the month of their release date", () => {
    expect(entrySeason({ release_date: "2026-11" }, "tv-show")).toEqual({
      code: "FAL",
      year: 2026,
    });
    expect(entrySeason({ release_date: "2027-02-14" }, "game")).toEqual({
      code: "WIN",
      year: 2027,
    });
  });

  it("follows the backend's release priority for the two-date types", () => {
    // anime-movie prefers the Japanese date; movie prefers the Taiwan one.
    expect(
      entrySeason({ release_date_jp: "2026-10-01", release_date_tw: "2027-01-01" }, "anime-movie"),
    ).toEqual({ code: "FAL", year: 2026 });
    expect(
      entrySeason({ release_date_usa: "2026-10-01", release_date_tw: "2027-01-01" }, "movie"),
    ).toEqual({ code: "WIN", year: 2027 });
    expect(entrySeason({ release_date_usa: "2026-10-01" }, "movie")).toEqual({
      code: "FAL",
      year: 2026,
    });
  });

  it("has no season for a year-only or missing date", () => {
    expect(entrySeason({ release_date: "2026" }, "cartoon")).toBeNull();
    expect(entrySeason({ release_date: null }, "cartoon")).toBeNull();
    expect(entrySeason({ release_date: "2026" }, "anime")).toBeNull();
  });
});

describe("selectComingNext", () => {
  const FAL_2026 = { code: "FAL", year: 2026 };

  const lists = {
    anime: [
      { system_id: "a1", release_season: "FAL", release_date: "2026-10-03", watching_status: "Watch When Airs" },
      { system_id: "a2", release_season: "FAL", release_date: "2026-10-01", watching_status: "Plan to Watch" },
      // Right status, wrong season.
      { system_id: "a3", release_season: "SUM", release_date: "2026-07-01", watching_status: "Watch When Airs" },
      // Right season, not a planning status.
      { system_id: "a4", release_season: "FAL", release_date: "2026-10-01", watching_status: "Might Watch" },
    ],
    "anime-movie": [],
    movie: [
      { system_id: "m1", release_date_tw: "2026-12-20", watching_status: "Watch When Airs" },
    ],
    "tv-show": [
      // Year only: no season, so left out.
      { system_id: "t1", release_date: "2026", watching_status: "Watch When Airs" },
    ],
    cartoon: [],
    game: [
      { system_id: "g1", release_date: "2026-11-05", playing_status: "Play When Released" },
      { system_id: "g2", release_date: "2026-10-20", playing_status: "Plan to Play" },
      // A watch vocabulary value on a game never matches.
      { system_id: "g3", release_date: "2026-10-20", playing_status: "Watch When Airs" },
    ],
  };

  const ids = (groups) =>
    groups.map((g) => [g.type, g.items.map((i) => i.system_id)]);

  it("groups Watch When Airs / Play When Released by type, types with nothing omitted", () => {
    const { airs } = selectComingNext(lists, FAL_2026);
    expect(ids(airs)).toEqual([
      ["anime", ["a1"]],
      ["movie", ["m1"]],
      ["game", ["g1"]],
    ]);
  });

  it("groups Plan to Watch / Plan to Play by type", () => {
    const { planned } = selectComingNext(lists, FAL_2026);
    expect(ids(planned)).toEqual([
      ["anime", ["a2"]],
      ["game", ["g2"]],
    ]);
  });

  it("sorts each group by release date", () => {
    const { airs } = selectComingNext(
      {
        anime: [
          { system_id: "late", release_season: "FAL", release_date: "2026-11-01", watching_status: "Watch When Airs" },
          { system_id: "early", release_season: "FAL", release_date: "2026-10-01", watching_status: "Watch When Airs" },
        ],
      },
      FAL_2026,
    );
    expect(ids(airs)).toEqual([["anime", ["early", "late"]]]);
  });

  it("tolerates a type whose list has not loaded", () => {
    expect(selectComingNext({}, FAL_2026)).toEqual({ airs: [], planned: [] });
  });

  it("keeps only entries not out yet by `today`, when given one", () => {
    const SUM_2026 = { code: "SUM", year: 2026 };
    const today = new Date(2026, 8, 28);
    const summer = {
      anime: [
        { system_id: "aired", release_season: "SUM", release_date: "2026-07-02", airing_status: "Finished Airing", watching_status: "Watch When Airs" },
        { system_id: "pending", release_season: "SUM", release_date: "2026-09-30", airing_status: "Not Yet Aired", watching_status: "Watch When Airs" },
      ],
      game: [
        { system_id: "out", release_date: "2026-08-01", release_status: "Released", playing_status: "Plan to Play" },
        { system_id: "soon", release_date: "2026-09-29", release_status: "Unreleased", playing_status: "Plan to Play" },
      ],
    };
    const { airs, planned } = selectComingNext(summer, SUM_2026, today);
    expect(ids(airs)).toEqual([["anime", ["pending"]]]);
    expect(ids(planned)).toEqual([["game", ["soon"]]]);
    // Without `today` the season's whole list stands, aired or not.
    expect(ids(selectComingNext(summer, SUM_2026).airs)).toEqual([
      ["anime", ["aired", "pending"]],
    ]);
  });
});

describe("isUnreleased", () => {
  const today = new Date(2026, 8, 28);

  it("reads airing_status for the watched types", () => {
    expect(isUnreleased({ airing_status: "Not Yet Aired" }, "anime", today)).toBe(true);
    expect(isUnreleased({ airing_status: "Rumored" }, "movie", today)).toBe(true);
    expect(isUnreleased({ airing_status: "Airing" }, "tv-show", today)).toBe(false);
    expect(isUnreleased({ airing_status: "Finished Airing" }, "cartoon", today)).toBe(false);
    expect(isUnreleased({ airing_status: "Canceled" }, "anime", today)).toBe(false);
  });

  it("reads release_status for games", () => {
    expect(isUnreleased({ release_status: "Unreleased" }, "game", today)).toBe(true);
    expect(isUnreleased({ release_status: "Rumored" }, "game", today)).toBe(true);
    expect(isUnreleased({ release_status: "Early Access" }, "game", today)).toBe(false);
    expect(isUnreleased({ release_status: "Released" }, "game", today)).toBe(false);
  });

  it("lets a set status win over the date", () => {
    // Stale date, fresh status: the status is what Fill keeps current.
    expect(
      isUnreleased({ airing_status: "Not Yet Aired", release_date: "2026-07-01" }, "anime", today),
    ).toBe(true);
    expect(
      isUnreleased({ airing_status: "Airing", release_date: "2026-12-01" }, "anime", today),
    ).toBe(false);
  });

  it("falls back to the release date lying after today when no status is set", () => {
    expect(isUnreleased({ release_date: "2026-09-29" }, "anime", today)).toBe(true);
    expect(isUnreleased({ release_date: "2026-09-28" }, "anime", today)).toBe(false);
    expect(isUnreleased({ release_date_tw: "2026-10-01" }, "movie", today)).toBe(true);
    // A month-only date counts from the first of the month.
    expect(isUnreleased({ release_date: "2026-09" }, "game", today)).toBe(false);
    expect(isUnreleased({ release_date: null }, "game", today)).toBe(false);
  });
});
