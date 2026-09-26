// Frontend: the restricted sources an h-comic is prefilled with.
//
// Restricted sources are free text (bucket "restricted"), so these are
// suggestions rather than a vocabulary: the form starts with them and offers
// them while typing, and any other name is still accepted. Nothing on the
// server knows the list - a stored row is a typed name like any other.
//
// Which rows a form holds is the owner's once they touch it. So the Add form
// follows the region only with rows that are still UNTOUCHED - a suggested
// name with no url - and never removes a row that has one, or a name the
// suggestions do not contain.
import { H_COMIC_REGION_KR } from "./hComicRegion";

// Every h-comic, whatever its region.
export const H_COMIC_RESTRICTED_SOURCES = Object.freeze(["禁漫天堂"]);

// Added on KR.
export const H_COMIC_KR_RESTRICTED_SOURCES = Object.freeze([
  "污汙漫畫",
  "漫小肆ikanhm",
  "ToonGod",
  "Anime Planet",
  "MANGA18",
  "MANGADNA",
]);

/** The suggested names for a region, in the order they are offered. */
export function suggestedRestrictedSources(region) {
  return region === H_COMIC_REGION_KR
    ? [...H_COMIC_RESTRICTED_SOURCES, ...H_COMIC_KR_RESTRICTED_SOURCES]
    : [...H_COMIC_RESTRICTED_SOURCES];
}

function restrictedRow(name) {
  return { kind: "access", bucket: "restricted", name, url: "", available: null };
}

function isRestricted(row) {
  return row.bucket === "restricted";
}

/**
 * `rows` plus a restricted row for every suggested name the region has that
 * `rows` does not already carry. Existing rows are kept exactly as they are.
 */
export function withSuggestedRestrictedSources(rows, region) {
  const current = rows || [];
  const present = new Set(
    current.filter(isRestricted).map((row) => (row.name || "").trim())
  );
  const missing = suggestedRestrictedSources(region).filter(
    (name) => !present.has(name)
  );
  return [...current, ...missing.map(restrictedRow)];
}

/**
 * The rows after the region changes on the Add form: the suggestions the old
 * region had and the new one does not are dropped while still untouched, and
 * the new region's missing suggestions are added.
 */
export function followRegion(rows, fromRegion, toRegion) {
  const kept = new Set(suggestedRestrictedSources(toRegion));
  const dropped = new Set(
    suggestedRestrictedSources(fromRegion).filter((name) => !kept.has(name))
  );
  const remaining = (rows || []).filter(
    (row) =>
      !(isRestricted(row) && !row.url && dropped.has((row.name || "").trim()))
  );
  return withSuggestedRestrictedSources(remaining, toRegion);
}
