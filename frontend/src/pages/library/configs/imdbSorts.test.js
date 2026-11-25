// The TV show and cartoon libraries' IMDb sorts: "IMDb Rating" is the whole
// show's rating and sits right under My Rating; "IMDb AVG Rating" is the
// season's, the average of its episodes, and follows it. A movie's single
// IMDb sort keeps the plain "IMDb Rating" label.
import { describe, expect, it } from "vitest";
import { LIBRARY_CONFIGS } from "./index";

describe.each(["tv-show", "cartoon"])("%s library IMDb sorts", (type) => {
  const sorts = () => LIBRARY_CONFIGS[type].sortDefs;

  it("lists IMDb Rating (the show's) under My Rating, then IMDb AVG Rating (the season's)", () => {
    const keys = sorts().map((s) => s.key);
    const at = keys.indexOf("my_rating");
    expect(keys.slice(at, at + 3)).toEqual(["my_rating", "imdb_series_rating", "imdb_rating"]);
    const label = (key) => sorts().find((s) => s.key === key).label;
    expect(label("imdb_series_rating")).toBe("IMDb Rating");
    expect(label("imdb_rating")).toBe("IMDb AVG Rating");
    expect(sorts().map((s) => s.label)).not.toContain("IMDb Show Rating");
  });
});

it("a movie's IMDb sort keeps the plain label", () => {
  const sort = LIBRARY_CONFIGS.movie.sortDefs.find((s) => s.key === "imdb_rating");
  expect(sort.label).toBe("IMDb Rating");
});
