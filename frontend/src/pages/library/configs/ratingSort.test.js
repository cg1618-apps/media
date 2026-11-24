// Every media library's My Rating sort: my rating, then the type's public
// score (MAL, IMDb or Metacritic) higher first, then the title.
//
// Each fixture ties on my rating, and lists its rows so that the title order
// DISAGREES with the public-score order - "Able" would win on title and loses
// on score. Without that, a sort that skipped the public score and fell
// straight to the title would still pass.
import { describe, expect, it } from "vitest";
import { LIBRARY_CONFIGS } from "./index";

const PREFIX = {
  anime: "anime",
  "anime-movie": "anime_movie",
  movie: "movie",
  "tv-show": "tv",
  cartoon: "cartoon",
  manga: "manga",
  book: "book",
  comic: "comic",
  game: "game",
  "h-comic": "h_comic",
  "h-game": "h_game",
  hentai: "hentai",
};

// The public score each library breaks a rating tie on.
const PUBLIC_SCORE = {
  anime: ["mal_rating", 7.1, 8.9],
  "anime-movie": ["mal_rating", 7.1, 8.9],
  manga: ["mal_rating", 7.1, 8.9],
  book: ["mal_rating", 7.1, 8.9],
  movie: ["imdb_rating", "6.5", "8.2"],
  "tv-show": ["imdb_rating", "6.5", "8.2"],
  cartoon: ["imdb_rating", "6.5", "8.2"],
  game: ["metacritic_score", 71, 93],
};

const row = (type, name, fields) => ({
  system_id: name,
  [`${PREFIX[type]}_name_en`]: name,
  ...fields,
});

function sortByMyRating(type, rows) {
  const sortDef = LIBRARY_CONFIGS[type].sortDefs.find((s) => s.key === "my_rating");
  return [...rows].sort((a, b) => sortDef.compare(a, b, {}, {})).map((r) => r.system_id);
}

describe.each(Object.keys(PUBLIC_SCORE))("%s library, My Rating", (type) => {
  const [field, low, high] = PUBLIC_SCORE[type];

  it("puts my rating first, whatever the public score", () => {
    const rows = [
      row(type, "Able", { my_rating: "B", [field]: high }),
      row(type, "Zulu", { my_rating: "S", [field]: low }),
    ];
    expect(sortByMyRating(type, rows)).toEqual(["Zulu", "Able"]);
  });

  it("breaks a rating tie by the public score, higher first, unscored last", () => {
    const rows = [
      row(type, "Able", { my_rating: "A", [field]: low }),
      row(type, "Mike", { my_rating: "A" }),
      row(type, "Zulu", { my_rating: "A", [field]: high }),
    ];
    expect(sortByMyRating(type, rows)).toEqual(["Zulu", "Able", "Mike"]);
  });

  it("breaks a rating and score tie by title", () => {
    const rows = [
      row(type, "Zulu", { my_rating: "A", [field]: high }),
      row(type, "Able", { my_rating: "A", [field]: high }),
    ];
    expect(sortByMyRating(type, rows)).toEqual(["Able", "Zulu"]);
  });
});

describe.each(["comic", "h-comic", "h-game", "hentai"])(
  "%s library, My Rating, with no public score",
  (type) => {
    it("breaks a rating tie by title", () => {
      const rows = [
        row(type, "Zulu", { my_rating: "A" }),
        row(type, "Able", { my_rating: "A" }),
        row(type, "Mike", { my_rating: "S" }),
      ];
      expect(sortByMyRating(type, rows)).toEqual(["Mike", "Able", "Zulu"]);
    });
  },
);
