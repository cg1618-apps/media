import { describe, it, expect } from "vitest";
import {
  ANILIST_BUCKETS,
  computeScoreRows,
} from "./StatsFranchiseSummary";

describe("ANILIST_BUCKETS", () => {
  it("is the MAL ladder on AniList's 0-100 scale", () => {
    // AniList's averageScore is an integer 0-100, MAL's is 0-10. The two
    // cards sit side by side, so the cut points have to be the same ones.
    expect(ANILIST_BUCKETS.map((b) => b.key)).toEqual([
      "90+",
      "87+",
      "85+",
      "82+",
      "77+",
      "70+",
      "40+",
      "<40",
    ]);
  });

  it("scales the bounds to whole numbers", () => {
    // Decimal arithmetic in binary floats: a bound that arrived as
    // 82.99999999999999 would put a score of 83 in the bucket below.
    ANILIST_BUCKETS.forEach(({ min, max }) => {
      expect(Number.isInteger(min)).toBe(true);
      expect(Number.isInteger(max)).toBe(true);
    });
  });

  it("covers the scale with no gap and no overlap", () => {
    const bounds = [...ANILIST_BUCKETS].reverse();
    bounds.slice(0, -1).forEach((bucket, i) => {
      expect(bucket.max).toBe(bounds[i + 1].min);
    });
    expect(bounds[0].min).toBe(0);
  });
});

describe("computeScoreRows", () => {
  const anime = (anilist_rating) => ({ anilist_rating });

  it("counts each score into exactly one bucket", () => {
    const { rows, scoredCount } = computeScoreRows(
      [anime(90), anime(89), anime(87), anime(39)],
      "anilist_rating",
      ANILIST_BUCKETS,
    );
    const count = (key) => rows.find((r) => r.label === key).count;
    expect(count("90+")).toBe(1);
    expect(count("87+")).toBe(2); // 89 and 87, the bound being inclusive below
    expect(count("<40")).toBe(1);
    expect(scoredCount).toBe(4);
  });

  it("leaves an unscored entry out of every bucket and out of the total", () => {
    // A stub AniList record resolves to no score at all, and counting it as
    // zero would pile the library into the bottom bucket.
    const { rows, scoredCount } = computeScoreRows(
      [anime(null), anime(undefined), {}, anime(80)],
      "anilist_rating",
      ANILIST_BUCKETS,
    );
    expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(1);
    expect(scoredCount).toBe(1);
  });

  it("puts a perfect 100 in the top bucket", () => {
    // The top bucket's max is scaled from MAL's 11, so it has to reach past
    // 100 - a 100 falling out of every bucket would be silent.
    const { rows } = computeScoreRows(
      [anime(100)],
      "anilist_rating",
      ANILIST_BUCKETS,
    );
    expect(rows.find((r) => r.label === "90+").count).toBe(1);
  });
});
