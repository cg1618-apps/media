// Frontend: Plan page bucket resolution, mirroring app/services/domain/size_group.py.
//
// For most media types a bucket is a standing property of a franchise or series,
// stored as two maps keyed by media type: size_group_derived (written by
// Calculate) and size_group_manual (written by the admin). Manual wins per key.
//
// Comic, manga and book are different: they group by a column on the entry
// itself and never inherit. Game and h-game are different again: they group
// by the plan row's own platform_group, which the caller picks. Anime groups
// by its airing type first: a Movie is "movie", any other non-TV airing type
// "others", and only a TV anime inherits a size bucket. The manga, book and
// anime airing vocabularies are frontend-only - the Python side covers
// derived size buckets and the platform groups, which these are not.

import { PLATFORM_GROUP_TYPES, planNextGroups } from "../config/planNextGroups";

// Upper bound of each band, in vocabulary order. Only comic is read here -
// every other type inherits its bucket rather than computing one client-side.
// Hand-maintained copy of the "comic" entry in SIZE_THRESHOLDS in
// app/utils/plan_next_kinds.py - keep the two in sync by hand.
const COMIC_BANDS = [
  [3, "1_3"],
  [10, "4_10"],
  [null, "11_plus"],
];

export function effectiveBucket(derived, manual, mediaType) {
  if (manual && manual[mediaType]) return manual[mediaType];
  if (derived && derived[mediaType]) return derived[mediaType];
  return null;
}

function comicBucket(issueTotal) {
  if (!issueTotal || issueTotal <= 0) return null;
  for (const [upper, key] of COMIC_BANDS) {
    if (upper === null || issueTotal <= upper) return key;
  }
  return null;
}

function groupBucket(group, mediaType) {
  if (!group) return null;
  return effectiveBucket(
    group.size_group_derived,
    group.size_group_manual,
    mediaType,
  );
}

// Categorical self-grouping: the entry's own column value IS the bucket key,
// with no band arithmetic. Anything outside the tab's vocabulary (including
// null) falls through to `fallback` - "其他" for book, which owns a real
// 其他 key, and null for manga, whose empties belong in the trailing group.
function selfBucket(mediaType, value, fallback = null) {
  const keys = planNextGroups(mediaType).map((g) => g.key);
  return keys.includes(value) ? value : fallback;
}

function inheritedBucket(mediaType, series, franchise) {
  return groupBucket(series, mediaType) ?? groupBucket(franchise, mediaType);
}

// A Movie is filed as one, whatever its series measures; anything that is
// neither TV nor Movie (OVA, ONA, Special, or no airing type at all) is
// "others". Only a TV anime is sized.
function animeBucket(airingType, series, franchise) {
  if (airingType === "Movie") return "movie";
  if (airingType !== "TV") return "others";
  return inheritedBucket("anime", series, franchise);
}

// An entry's bucket is never stored. Comic, manga and book resolve it from
// their own column instead of inheriting it, because each has a grouping of
// its own that says more than its franchise's size would: comic by issue
// count, manga by serialization status, book by type. Anime reads its airing
// type first. `selfValue` carries whichever column the type reads (the plan
// row's platform_group for game and h-game). Every other type inherits:
// series first, then franchise.
export function entryBucket(mediaType, selfValue, series, franchise) {
  if (mediaType === "comic") return comicBucket(selfValue);
  if (mediaType === "manga") return selfBucket("manga", selfValue);
  if (mediaType === "book") return selfBucket("book", selfValue, "其他");
  if (PLATFORM_GROUP_TYPES.includes(mediaType)) return selfBucket(mediaType, selfValue);
  if (mediaType === "anime") return animeBucket(selfValue, series, franchise);
  return inheritedBucket(mediaType, series, franchise);
}

// A series- or franchise-scope row's bucket: the group's own size. An anime
// group that has none is filed under "others" with the unsized airing types;
// any other type's lands in the trailing ungrouped pile.
export function groupRowBucket(mediaType, series, franchise) {
  if (mediaType === "anime") return inheritedBucket("anime", series, franchise) ?? "others";
  return entryBucket(mediaType, null, series, franchise);
}

// Buckets in vocabulary order, always all of them so an empty band still
// renders its heading, plus a trailing ungrouped pile.
export function groupByBucket(rows, mediaType) {
  const grouped = {};
  for (const { key } of planNextGroups(mediaType)) grouped[key] = [];
  grouped.ungrouped = [];
  for (const row of rows) {
    const key = row.bucket && row.bucket in grouped ? row.bucket : "ungrouped";
    grouped[key].push(row);
  }
  return grouped;
}
