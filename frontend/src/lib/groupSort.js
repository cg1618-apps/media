// The order a grouping-tier library (franchise, series) sorts its rows in.
//
// Each sort key falls through to the next when two rows tie on it:
//   expectation -> my rating -> title
//   my_rating   -> title
//   title
// The expectation and the rating are the viewer's own; a caller whose viewer
// holds no list sorts by title, since the values would all be null.
import { EXPECTATION_FIELD } from "../api/mutations/useMyRatingMutations";
import { getRatingWeight, getSortName } from "../utils/media";
import { compareTitles } from "./naming";

const EXPECTATION_WEIGHT = { Highest: 0, High: 1, Medium: 2, Low: 3 };

/** Highest first; an unset or unknown expectation sorts after Low. */
export function getExpectationWeight(expectation) {
  return EXPECTATION_WEIGHT[expectation] ?? 4;
}

const byTitle = (a, b, type) =>
  compareTitles(getSortName(a, type), getSortName(b, type));

const byRating = (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);

/** Comparator for `sort` ("expectation" | "my_rating" | "title") over rows of `type`. */
export function compareGroups(a, b, sort, type) {
  if (sort === "expectation") {
    const field = EXPECTATION_FIELD[type];
    const diff = getExpectationWeight(a[field]) - getExpectationWeight(b[field]);
    if (diff !== 0) return diff;
  }
  if (sort === "expectation" || sort === "my_rating") {
    const diff = byRating(a, b);
    if (diff !== 0) return diff;
  }
  return byTitle(a, b, type);
}
