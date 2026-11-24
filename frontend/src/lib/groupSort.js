// The order a grouping-tier library (collection, franchise, series) sorts its
// rows in.
//
// Each sort key falls through to the next when two rows tie on it:
//   expectation -> my rating   -> title
//   my_rating   -> expectation -> title
//   title
// A tier carries no public score, so the media libraries' public-score
// tie-break (libraryColumns' myRatingSort) has no counterpart here.
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

/**
 * The Chip tone an expectation is drawn in. Highest, and only Highest, stands
 * out in the brand tone; every other expectation keeps the neutral ink one,
 * so a glance down a library picks out the most anticipated.
 */
export function expectationTone(expectation) {
  return expectation === "Highest" ? "brand" : "ink";
}

const byTitle = (a, b, type) =>
  compareTitles(getSortName(a, type), getSortName(b, type));

const byRating = (a, b) => getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);

const byExpectation = (a, b, type) => {
  const field = EXPECTATION_FIELD[type];
  return getExpectationWeight(a[field]) - getExpectationWeight(b[field]);
};

// The keys each sort compares on, in order; the title always settles a tie.
const SORT_KEYS = {
  expectation: [byExpectation, byRating],
  my_rating: [byRating, byExpectation],
  title: [],
};

/** Comparator for `sort` ("expectation" | "my_rating" | "title") over rows of `type`. */
export function compareGroups(a, b, sort, type) {
  for (const compare of SORT_KEYS[sort] ?? []) {
    const diff = compare(a, b, type);
    if (diff !== 0) return diff;
  }
  return byTitle(a, b, type);
}
