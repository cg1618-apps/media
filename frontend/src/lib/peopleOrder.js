// Frontend: the order a person picker offers people in before any typed-text
// matching - the people worth reaching for first. Kept free of React so it is
// tested directly.
import { getRatingWeight } from "./formatters";

/**
 * A sorted copy of `people`: my rating best first (unrated last, by
 * getRatingWeight, the same scale the libraries sort on), then the most
 * appearances first (`credit_count`, which for a seiyuu counts castings).
 * The sort is stable, so people tied on both keep the order they came in.
 */
export function byRatingThenAppearances(people) {
  return [...(people || [])].sort(
    (a, b) =>
      getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating) ||
      (b.credit_count ?? 0) - (a.credit_count ?? 0),
  );
}
