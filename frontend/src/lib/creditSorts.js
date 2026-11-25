// Frontend: the one sort a credit list offers - the studio, publisher and
// person pages' credited entries, each group sorted alike.
//
// Release date, newest first (SortControl's direction button turns it old to
// new); My rating, best first, for a viewer with a list of their own; and the
// public rating, highest first - MAL's score, or Metacritic's on a game and an
// h-game, the figure each type's library card shows. An entry with no value
// for the chosen sort goes last in either direction, so the reverse is not
// lib/sortDirection.js's plain `directed`: that would bring the blanks to the
// top. A tie falls back to the release date, newest first.
import { releaseScore } from "./releaseDate";
import { getRatingWeight } from "../utils/media";

export const CREDIT_SORT_DEFAULT = "release_date";

const METACRITIC_TYPES = new Set(["game", "h-game"]);

/** The public rating a credit card shows for `type`, or null without one. */
export function publicRating(type, entry) {
  const value = METACRITIC_TYPES.has(type) ? entry.metacritic_score : entry.mal_rating;
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Each sort's value, higher reading as "first" in the natural direction; null
// is "has none".
const SORT_VALUES = {
  release_date: (_type, entry) => releaseScore(entry.release_date) || null,
  // getRatingWeight counts up from S, so it is negated to put S highest.
  my_rating: (_type, entry) => (entry.my_rating ? -getRatingWeight(entry.my_rating) : null),
  public_rating: publicRating,
};

/** The sorts as SortControl options; My rating only for a viewer with a list. */
export function creditSortOptions(ownData) {
  return [
    { value: "release_date", label: "Release date", descending: true },
    ...(ownData ? [{ value: "my_rating", label: "My rating", descending: true }] : []),
    { value: "public_rating", label: "Public rating", descending: true },
  ];
}

/** A sorted copy of `entries` (one group, all of media type `type`). */
export function sortCredits(entries, type, sort, reversed = false) {
  const valueOf = SORT_VALUES[sort] ?? SORT_VALUES[CREDIT_SORT_DEFAULT];
  const release = SORT_VALUES.release_date;
  const sign = reversed ? 1 : -1;
  const compareValues = (a, b, direction) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return direction * (a - b);
  };
  return [...entries].sort(
    (a, b) =>
      compareValues(valueOf(type, a), valueOf(type, b), sign) ||
      compareValues(release(type, a), release(type, b), -1),
  );
}
